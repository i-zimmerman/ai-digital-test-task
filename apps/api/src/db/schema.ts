import type {
  IssueCategory,
  ReviewStatus,
  Sentiment,
  Severity,
} from '@rs/contracts';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

/** Raw dataset rows, plus everything the deterministic stages derive. */
export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    product: text('product').notNull(),
    source: text('source').notNull(),
    rating: integer('rating'),
    language: text('language').notNull(),
    text: text('text').notNull(),
    /** Lowercased, punctuation-stripped, whitespace-collapsed. Drives dedup. */
    textNorm: text('text_norm').notNull(),
    /** sha256 of textNorm — exact-duplicate key and LLM cache key. */
    textHash: text('text_hash').notNull(),
    status: text('status').$type<ReviewStatus>().notNull().default('ok'),
    /** Human-readable reason, shown in the UI so exclusions are auditable. */
    statusReason: text('status_reason'),
    /** Every review in a near-duplicate cluster shares this. */
    clusterId: text('cluster_id'),
    /** The review kept for this cluster. Equals `id` on the canonical row. */
    canonicalId: text('canonical_id'),
    /** Similarity to the canonical row (1 for the canonical row itself). */
    dupSimilarity: doublePrecision('dup_similarity'),
    /** Cluster member count, stored on the canonical row. */
    clusterSize: integer('cluster_size').notNull().default(1),
    ingestedAt: timestamp('ingested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('reviews_product_idx').on(t.product),
    index('reviews_status_idx').on(t.status),
    index('reviews_cluster_idx').on(t.clusterId),
    index('reviews_text_hash_idx').on(t.textHash),
  ],
);

/** One LLM extraction per (review, prompt version). */
export const analyses = pgTable(
  'analyses',
  {
    id: serial('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    promptVersion: text('prompt_version').notNull(),
    /** Lets a re-run reuse a result when the text and prompt are unchanged. */
    textHash: text('text_hash').notNull(),
    model: text('model').notNull(),
    isSpam: boolean('is_spam').notNull(),
    languageDetected: text('language_detected').notNull(),
    sentiment: text('sentiment').$type<Sentiment>().notNull(),
    severity: text('severity').$type<Severity>().notNull(),
    summaryEn: text('summary_en').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    raw: jsonb('raw').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('analyses_review_prompt_uq').on(t.reviewId, t.promptVersion),
    index('analyses_severity_idx').on(t.severity),
  ],
);

/** Normalised issues — one row per (review, extracted issue). Aggregation reads this. */
export const issues = pgTable(
  'issues',
  {
    id: serial('id').primaryKey(),
    analysisId: integer('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    /** Denormalised so top-issue queries never need a three-way join. */
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    category: text('category').$type<IssueCategory>().notNull(),
    label: text('label').notNull(),
    quote: text('quote').notNull(),
    /** Severity of this specific issue — see ExtractedIssueSchema. */
    severity: text('severity').$type<Severity>().notNull(),
  },
  (t) => [
    index('issues_category_idx').on(t.category),
    index('issues_review_idx').on(t.reviewId),
  ],
);

export const pipelineRuns = pgTable('pipeline_runs', {
  id: text('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').$type<'running' | 'ok' | 'failed'>().notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  counts: jsonb('counts').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
  estimatedCostUsd: doublePrecision('estimated_cost_usd').notNull().default(0),
  error: text('error'),
});

export type ReviewRow = typeof reviews.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
export type IssueRow = typeof issues.$inferSelect;
export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
