import { Inject, Injectable } from '@nestjs/common';
import type { Sentiment, Severity, Stats } from '@rs/contracts';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { analyses, pipelineRuns, reviews } from '../db/schema';

@Injectable()
export class StatsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(): Promise<Stats> {
    const rows = await this.db
      .select({
        id: reviews.id,
        product: reviews.product,
        source: reviews.source,
        rating: reviews.rating,
        language: reviews.language,
        status: reviews.status,
        clusterId: reviews.clusterId,
        clusterSize: reviews.clusterSize,
        sentiment: analyses.sentiment,
        severity: analyses.severity,
        languageDetected: analyses.languageDetected,
      })
      .from(reviews)
      .leftJoin(analyses, eq(analyses.reviewId, reviews.id));

    const tally = <T extends string>(): Record<string, number> => ({}) as Record<T, number>;
    const products = tally();
    const sources = tally();
    const languages = tally();
    const sentimentMix: Record<string, number> = {};
    const severityMix: Record<string, number> = {};

    let junk = 0;
    let spam = 0;
    let duplicates = 0;
    let analysed = 0;
    let rated = 0;
    let contradictions = 0;
    const multiClusters = new Set<string>();

    for (const row of rows) {
      products[row.product] = (products[row.product] ?? 0) + 1;
      sources[row.source] = (sources[row.source] ?? 0) + 1;

      const lang = row.languageDetected ?? row.language;
      languages[lang] = (languages[lang] ?? 0) + 1;

      if (row.status === 'junk') junk += 1;
      if (row.status === 'spam') spam += 1;
      if (row.status === 'duplicate') duplicates += 1;
      if (row.status === 'duplicate' && row.clusterId) multiClusters.add(row.clusterId);

      if (row.status !== 'ok') continue;
      if (!row.sentiment || !row.severity) continue;

      analysed += 1;
      sentimentMix[row.sentiment] = (sentimentMix[row.sentiment] ?? 0) + 1;
      severityMix[row.severity] = (severityMix[row.severity] ?? 0) + 1;

      // The headline finding about this dataset: star ratings and review text
      // frequently disagree, which is why sentiment is read from text only.
      if (row.rating !== null) {
        rated += 1;
        const positiveStars = row.rating >= 4;
        const negativeStars = row.rating <= 2;
        if (
          (positiveStars && row.sentiment === 'negative') ||
          (negativeStars && row.sentiment === 'positive')
        ) {
          contradictions += 1;
        }
      }
    }

    const [run] = await this.db
      .select()
      .from(pipelineRuns)
      .where(isNotNull(pipelineRuns.finishedAt))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(1);

    return {
      totalReviews: rows.length,
      analysed,
      junk,
      spam,
      duplicates,
      duplicateClusters: multiClusters.size,
      products: toList(products),
      sources: toList(sources),
      languages: toList(languages).map((l) => ({ code: l.name, count: l.count })),
      sentimentMix: sentimentMix as Record<Sentiment, number>,
      severityMix: severityMix as Record<Severity, number>,
      ratingContradictionRate: rated > 0 ? contradictions / rated : null,
      lastRun: run
        ? {
            id: run.id,
            finishedAt: run.finishedAt?.toISOString() ?? null,
            model: run.model,
            promptVersion: run.promptVersion,
            inputTokens: run.inputTokens,
            outputTokens: run.outputTokens,
            estimatedCostUsd: run.estimatedCostUsd,
          }
        : null,
    };
  }

  async excluded(): Promise<
    { id: string; product: string; source: string; text: string; status: string; reason: string | null }[]
  > {
    return this.db
      .select({
        id: reviews.id,
        product: reviews.product,
        source: reviews.source,
        text: reviews.text,
        status: reviews.status,
        reason: reviews.statusReason,
      })
      .from(reviews)
      .where(sql`${reviews.status} <> 'ok'`)
      .orderBy(reviews.status, reviews.id);
  }
}

function toList(counts: Record<string, number>): { name: string; count: number }[] {
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
