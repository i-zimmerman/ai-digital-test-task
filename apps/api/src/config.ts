import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { repoRoot } from './lib/paths';

// `.env` lives at the workspace root, but these scripts run from apps/api, so
// dotenv's cwd-relative default silently finds nothing. Everything appeared to
// work only because each setting's fallback happened to match the file — the
// API key, which has no usable default, was the first one to expose it.
loadEnv({ path: join(repoRoot(), '.env'), quiet: true });

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5433/review_signal',
  port: num(process.env.PORT, 3001),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  llm: {
    model: process.env.LLM_MODEL ?? 'claude-opus-5',
    effort: (process.env.LLM_EFFORT ?? 'medium') as
      | 'low'
      | 'medium'
      | 'high'
      | 'xhigh'
      | 'max',
    batchSize: num(process.env.LLM_BATCH_SIZE, 20),
    concurrency: num(process.env.LLM_CONCURRENCY, 4),
    maxTokens: num(process.env.LLM_MAX_TOKENS, 16000),
  },
  dedup: {
    /**
     * Similarity at or above this counts as the same review re-posted.
     * 0.88 keeps "Unusable." vs "Unusable!" together while keeping genuinely
     * different complaints apart. Tuned against the dataset — see WRITEUP.md.
     */
    threshold: num(process.env.DEDUP_THRESHOLD, 0.88),
  },
  paths: {
    reviews: process.env.REVIEWS_PATH ?? '../../data/reviews.json',
    snapshot: process.env.SNAPSHOT_PATH ?? '../../data/snapshot.json',
    goldLabels: process.env.GOLD_LABELS_PATH ?? '../../data/gold-labels.json',
  },
} as const;

/**
 * Published Anthropic list prices, $ per million tokens. Used only to print a
 * cost estimate after a run — no billing depends on it.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
