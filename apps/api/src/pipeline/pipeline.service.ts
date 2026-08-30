import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PROMPT_VERSION,
  type RawReview,
  type ReviewAnalysis,
} from '@rs/contracts';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { MODEL_PRICES, config } from '../config';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { analyses, issues, pipelineRuns, reviews } from '../db/schema';
import { chunk, mapWithConcurrency } from '../lib/concurrency';
import { clusterDuplicates, type DedupCandidate } from './dedup';
import { classifyJunk, hashText, normalizeText } from './text';
import {
  EMPTY_USAGE,
  addUsage,
  type Extractor,
  type Usage,
} from './llm/extractor';
import type { BatchItem } from './llm/prompt';

export interface PipelineCounts {
  ingested: number;
  junk: number;
  duplicates: number;
  duplicateClusters: number;
  analysed: number;
  spam: number;
  reused: number;
  failed: number;
}

export interface PipelineResult {
  runId: string;
  counts: PipelineCounts;
  usage: Usage;
  estimatedCostUsd: number;
  model: string;
}

@Injectable()
export class PipelineService {
  private readonly log = new Logger(PipelineService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async run(
    raw: readonly RawReview[],
    extractor: Extractor,
    options: { force?: boolean } = {},
  ): Promise<PipelineResult> {
    const runId = randomUUID();
    await this.db.insert(pipelineRuns).values({
      id: runId,
      status: 'running',
      model: extractor.model,
      promptVersion: PROMPT_VERSION,
      counts: {},
    });

    try {
      const ingested = await this.ingest(raw);
      const dedup = await this.dedup();
      const extraction = await this.extract(extractor, options.force ?? false);

      // Counted from the database after every stage, not accumulated as deltas:
      // a re-run that reuses cached extractions must still report the true
      // state of the corpus rather than zeroes.
      const counts: PipelineCounts = {
        ingested,
        junk: await this.countStatus('junk'),
        spam: await this.countStatus('spam'),
        duplicates: await this.countStatus('duplicate'),
        duplicateClusters: dedup.clusters,
        analysed: extraction.analysed,
        reused: extraction.reused,
        failed: extraction.failed,
      };

      const price = MODEL_PRICES[extractor.model];
      const estimatedCostUsd = price
        ? (extraction.usage.inputTokens * price.input +
            extraction.usage.outputTokens * price.output) /
          1_000_000
        : 0;

      await this.db
        .update(pipelineRuns)
        .set({
          status: 'ok',
          finishedAt: new Date(),
          counts,
          inputTokens: extraction.usage.inputTokens,
          outputTokens: extraction.usage.outputTokens,
          cachedInputTokens: extraction.usage.cachedInputTokens,
          estimatedCostUsd,
        })
        .where(eq(pipelineRuns.id, runId));

      return {
        runId,
        counts,
        usage: extraction.usage,
        estimatedCostUsd,
        model: extractor.model,
      };
    } catch (error) {
      await this.db
        .update(pipelineRuns)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        })
        .where(eq(pipelineRuns.id, runId));
      throw error;
    }
  }

  /** Stage 1 — load the raw rows and apply the deterministic junk filter. */
  async ingest(raw: readonly RawReview[]): Promise<number> {
    const rows = raw.map((review) => {
      const textNorm = normalizeText(review.text);
      const verdict = classifyJunk(review.text);
      return {
        id: review.id,
        product: review.product,
        source: review.source,
        rating: review.rating,
        language: review.language,
        text: review.text,
        textNorm,
        textHash: hashText(textNorm),
        status: verdict.junk ? ('junk' as const) : ('ok' as const),
        statusReason: verdict.reason ?? null,
        clusterId: null,
        canonicalId: null,
        dupSimilarity: null,
        clusterSize: 1,
      };
    });

    for (const batch of chunk(rows, 200)) {
      await this.db
        .insert(reviews)
        .values(batch)
        .onConflictDoUpdate({
          target: reviews.id,
          set: {
            product: sql`excluded.product`,
            source: sql`excluded.source`,
            rating: sql`excluded.rating`,
            language: sql`excluded.language`,
            text: sql`excluded.text`,
            textNorm: sql`excluded.text_norm`,
            textHash: sql`excluded.text_hash`,
            // Only the junk verdict is recomputed here. `spam` and `duplicate`
            // are set by later stages, and a re-ingest must not silently undo
            // them — otherwise a second run resurrects rows the pipeline had
            // already excluded.
            status: sql`CASE
              WHEN excluded.status = 'junk' THEN 'junk'
              WHEN ${reviews.status} = 'junk' THEN excluded.status
              ELSE ${reviews.status}
            END`,
            statusReason: sql`CASE
              WHEN excluded.status = 'junk' THEN excluded.status_reason
              WHEN ${reviews.status} = 'junk' THEN excluded.status_reason
              ELSE ${reviews.statusReason}
            END`,
          },
        });
    }

    this.log.log(`Ingested ${rows.length} reviews`);
    return rows.length;
  }

  /** Stage 2 — collapse cross-posted near-duplicates, scoped per product. */
  async dedup(): Promise<{ duplicates: number; clusters: number }> {
    const candidates = await this.db
      .select({
        id: reviews.id,
        product: reviews.product,
        textNorm: reviews.textNorm,
        textHash: reviews.textHash,
        rating: reviews.rating,
      })
      .from(reviews)
      .where(ne(reviews.status, 'junk'));

    const clusters = clusterDuplicates(
      candidates as DedupCandidate[],
      config.dedup.threshold,
    );

    let duplicates = 0;
    let multiMemberClusters = 0;

    for (const cluster of clusters) {
      if (cluster.members.length > 1) multiMemberClusters += 1;

      for (const member of cluster.members) {
        const isCanonical = member.id === cluster.canonicalId;
        if (!isCanonical) duplicates += 1;

        await this.db
          .update(reviews)
          .set({
            clusterId: cluster.clusterId,
            canonicalId: cluster.canonicalId,
            dupSimilarity: member.similarity,
            clusterSize: isCanonical ? cluster.members.length : 1,
            // Only ever move a row into or out of `duplicate`. A spam verdict
            // from a previous run must survive, and so must its reason —
            // clearing it unconditionally silently un-excludes the row.
            status: isCanonical
              ? sql`CASE WHEN ${reviews.status} = 'duplicate' THEN 'ok' ELSE ${reviews.status} END`
              : sql`CASE WHEN ${reviews.status} = 'spam' THEN 'spam' ELSE 'duplicate' END`,
            statusReason: isCanonical
              ? sql`CASE WHEN ${reviews.status} = 'duplicate' THEN NULL ELSE ${reviews.statusReason} END`
              : sql`CASE WHEN ${reviews.status} = 'spam' THEN ${reviews.statusReason}
                  ELSE ${`Cross-post of ${cluster.canonicalId} (similarity ${member.similarity})`} END`,
          })
          .where(eq(reviews.id, member.id));
      }
    }

    this.log.log(
      `Dedup: ${clusters.length} clusters, ${duplicates} rows collapsed (${multiMemberClusters} multi-member)`,
    );
    return { duplicates, clusters: multiMemberClusters };
  }

  /** Stage 3 — the only stage that talks to a model. */
  async extract(
    extractor: Extractor,
    force: boolean,
  ): Promise<{
    analysed: number;
    reused: number;
    failed: number;
    usage: Usage;
  }> {
    const pending = await this.db
      .select({
        id: reviews.id,
        product: reviews.product,
        source: reviews.source,
        text: reviews.text,
        textHash: reviews.textHash,
        existingHash: analyses.textHash,
      })
      .from(reviews)
      .leftJoin(
        analyses,
        and(
          eq(analyses.reviewId, reviews.id),
          eq(analyses.promptVersion, PROMPT_VERSION),
        ),
      )
      .where(
        and(
          inArray(reviews.status, ['ok', 'spam']),
          eq(reviews.id, reviews.canonicalId),
        ),
      );

    // Idempotency: an unchanged review under an unchanged prompt is not re-sent.
    const todo = pending.filter(
      (row) => force || row.existingHash !== row.textHash,
    );
    const reused = pending.length - todo.length;

    if (todo.length === 0) {
      this.log.log(`Extraction: nothing to do (${reused} results reused)`);
      return { analysed: 0, reused, failed: 0, usage: EMPTY_USAGE };
    }

    const batches = chunk<BatchItem>(
      todo.map((row) => ({
        id: row.id,
        product: row.product,
        source: row.source,
        text: row.text,
      })),
      config.llm.batchSize,
    );

    this.log.log(
      `Extraction: ${todo.length} reviews in ${batches.length} batches (${reused} reused) via ${extractor.name}/${extractor.model}`,
    );

    let usage = EMPTY_USAGE;
    let failed = 0;
    const collected: ReviewAnalysis[] = [];

    const settled = await mapWithConcurrency(
      batches,
      config.llm.concurrency,
      async (batch, index) => {
        try {
          const result = await extractor.extractBatch(batch);
          const returned = new Map(result.analyses.map((a) => [a.id, a]));
          const missing = batch.filter((item) => !returned.has(item.id));

          // The model dropped or renamed rows: recover them one at a time
          // rather than losing the whole batch.
          if (missing.length > 0) {
            this.log.warn(
              `Batch ${index + 1} returned ${result.analyses.length}/${batch.length}; retrying ${missing.length} individually`,
            );
            const singles = await Promise.allSettled(
              missing.map((item) => extractor.extractBatch([item])),
            );
            for (const single of singles) {
              if (single.status === 'fulfilled') {
                result.analyses.push(...single.value.analyses);
                result.usage = addUsage(result.usage, single.value.usage);
              }
            }
          }

          return result;
        } catch (error) {
          this.log.error(
            `Batch ${index + 1} of ${batches.length} failed permanently: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return null;
        }
      },
    );

    const requested = new Set(todo.map((row) => row.id));
    for (const result of settled) {
      if (!result) {
        failed += config.llm.batchSize;
        continue;
      }
      usage = addUsage(usage, result.usage);
      for (const analysis of result.analyses) {
        if (requested.has(analysis.id)) collected.push(analysis);
      }
    }

    failed = todo.length - collected.length;
    const hashById = new Map(todo.map((row) => [row.id, row.textHash]));
    await this.persistAnalyses(collected, hashById, extractor.model);

    return { analysed: collected.length, reused, failed, usage };
  }

  private async persistAnalyses(
    results: readonly ReviewAnalysis[],
    hashById: ReadonlyMap<string, string>,
    model: string,
  ): Promise<number> {
    let spam = 0;

    for (const analysis of results) {
      const textHash = hashById.get(analysis.id);
      if (!textHash) continue;

      const [row] = await this.db
        .insert(analyses)
        .values({
          reviewId: analysis.id,
          promptVersion: PROMPT_VERSION,
          textHash,
          model,
          isSpam: analysis.is_spam,
          languageDetected: analysis.language,
          sentiment: analysis.sentiment,
          severity: analysis.severity,
          summaryEn: analysis.summary_en,
          confidence: analysis.confidence,
          raw: analysis,
        })
        .onConflictDoUpdate({
          target: [analyses.reviewId, analyses.promptVersion],
          set: {
            textHash,
            model,
            isSpam: analysis.is_spam,
            languageDetected: analysis.language,
            sentiment: analysis.sentiment,
            severity: analysis.severity,
            summaryEn: analysis.summary_en,
            confidence: analysis.confidence,
            raw: analysis,
            createdAt: new Date(),
          },
        })
        .returning({ id: analyses.id });

      if (!row) continue;

      await this.db.delete(issues).where(eq(issues.analysisId, row.id));
      if (analysis.issues.length > 0) {
        await this.db.insert(issues).values(
          analysis.issues.map((issue) => ({
            analysisId: row.id,
            reviewId: analysis.id,
            category: issue.category,
            label: issue.label,
            quote: issue.quote,
            severity: issue.severity,
          })),
        );
      }

      if (analysis.is_spam) {
        spam += 1;
        await this.db
          .update(reviews)
          .set({ status: 'spam', statusReason: 'Promotional / scam content' })
          .where(eq(reviews.id, analysis.id));
      } else {
        // A re-run that reclassifies a review as genuine must clear the flag.
        await this.db
          .update(reviews)
          .set({ status: 'ok', statusReason: null })
          .where(and(eq(reviews.id, analysis.id), eq(reviews.status, 'spam')));
      }
    }

    return spam;
  }

  private async countStatus(status: 'junk' | 'spam' | 'duplicate'): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.status, status));
    return row?.count ?? 0;
  }

  async reset(): Promise<void> {
    await this.db.delete(issues);
    await this.db.delete(analyses);
    await this.db.delete(reviews);
    await this.db.delete(pipelineRuns);
  }
}
