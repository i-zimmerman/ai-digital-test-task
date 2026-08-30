import { ReviewAnalysisSchema, type ReviewAnalysis } from '@rs/contracts';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ExtractResult, Extractor } from './extractor';
import type { BatchItem } from './prompt';

export const SnapshotFileSchema = z.object({
  promptVersion: z.string(),
  model: z.string(),
  generatedAt: z.string(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cachedInputTokens: z.number(),
  }),
  analyses: z.array(ReviewAnalysisSchema),
});
export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

/**
 * Replays a recorded pipeline run instead of calling the API.
 *
 * This is what `pnpm seed` uses, and it is why the repo runs from a clean clone
 * with no API key: the deterministic stages (ingest, junk filter, dedup) really
 * execute, and only the model call is served from the committed snapshot. Same
 * orchestration code, one substituted dependency.
 */
export class SnapshotExtractor implements Extractor {
  readonly name = 'snapshot';
  readonly model: string;

  private readonly byId: Map<string, ReviewAnalysis>;
  private readonly fallback: Extractor | undefined;

  constructor(snapshotPath: string, fallback?: Extractor) {
    const parsed = SnapshotFileSchema.parse(
      JSON.parse(readFileSync(snapshotPath, 'utf8')),
    );
    this.model = parsed.model;
    this.byId = new Map(parsed.analyses.map((a) => [a.id, a]));
    this.fallback = fallback;
  }

  get size(): number {
    return this.byId.size;
  }

  async extractBatch(items: readonly BatchItem[]): Promise<ExtractResult> {
    const hits: ReviewAnalysis[] = [];
    const misses: BatchItem[] = [];

    for (const item of items) {
      const hit = this.byId.get(item.id);
      if (hit) hits.push(hit);
      else misses.push(item);
    }

    if (misses.length > 0) {
      if (!this.fallback) {
        throw new Error(
          `Snapshot has no entry for ${misses.length} review(s), e.g. ${misses[0]!.id}. Re-run the pipeline to regenerate it.`,
        );
      }
      const extra = await this.fallback.extractBatch(misses);
      hits.push(...extra.analyses);
    }

    return {
      analyses: hits,
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    };
  }
}
