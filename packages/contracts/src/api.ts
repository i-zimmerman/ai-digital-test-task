import { z } from 'zod';
import {
  ISSUE_CATEGORIES,
  REVIEW_STATUSES,
  SENTIMENTS,
  SEVERITY_LEVELS,
} from './taxonomy.js';

export const IssueFiltersSchema = z.object({
  product: z.string().optional(),
  severity: z.enum(SEVERITY_LEVELS).optional(),
  source: z.string().optional(),
  /** Positive categories are hidden by default — "top issues" means problems. */
  includePositive: z.coerce.boolean().optional().default(false),
});
export type IssueFilters = z.infer<typeof IssueFiltersSchema>;

export const ExampleQuoteSchema = z.object({
  reviewId: z.string(),
  quote: z.string(),
  product: z.string(),
  source: z.string(),
  severity: z.enum(SEVERITY_LEVELS),
});
export type ExampleQuote = z.infer<typeof ExampleQuoteSchema>;

export const TopIssueSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  label: z.string(),
  /** Distinct reviews mentioning this issue (post-dedup). */
  reviewCount: z.number().int(),
  /** Distinct people, i.e. review count plus collapsed cross-posts. */
  mentionCount: z.number().int(),
  worstSeverity: z.enum(SEVERITY_LEVELS),
  severityMix: z.record(z.enum(SEVERITY_LEVELS), z.number().int()),
  productMix: z.record(z.string(), z.number().int()),
  sourceMix: z.record(z.string(), z.number().int()),
  negativeShare: z.number(),
  examples: z.array(ExampleQuoteSchema),
});
export type TopIssue = z.infer<typeof TopIssueSchema>;

export const ReviewDetailSchema = z.object({
  id: z.string(),
  product: z.string(),
  source: z.string(),
  rating: z.number().int().nullable(),
  language: z.string(),
  languageDetected: z.string().nullable(),
  text: z.string(),
  summaryEn: z.string().nullable(),
  sentiment: z.enum(SENTIMENTS).nullable(),
  severity: z.enum(SEVERITY_LEVELS).nullable(),
  confidence: z.number().nullable(),
  status: z.enum(REVIEW_STATUSES),
  issues: z.array(
    z.object({
      category: z.enum(ISSUE_CATEGORIES),
      label: z.string(),
      quote: z.string(),
      severity: z.enum(SEVERITY_LEVELS),
    }),
  ),
  /** Channels this same review was cross-posted to, including its own. */
  alsoPostedOn: z.array(
    z.object({ reviewId: z.string(), source: z.string(), similarity: z.number() }),
  ),
});
export type ReviewDetail = z.infer<typeof ReviewDetailSchema>;

export const StatsSchema = z.object({
  totalReviews: z.number().int(),
  analysed: z.number().int(),
  junk: z.number().int(),
  spam: z.number().int(),
  duplicates: z.number().int(),
  duplicateClusters: z.number().int(),
  products: z.array(z.object({ name: z.string(), count: z.number().int() })),
  sources: z.array(z.object({ name: z.string(), count: z.number().int() })),
  languages: z.array(z.object({ code: z.string(), count: z.number().int() })),
  sentimentMix: z.record(z.enum(SENTIMENTS), z.number().int()),
  severityMix: z.record(z.enum(SEVERITY_LEVELS), z.number().int()),
  /** Share of rated reviews whose star rating contradicts the extracted sentiment. */
  ratingContradictionRate: z.number().nullable(),
  lastRun: z
    .object({
      id: z.string(),
      finishedAt: z.string().nullable(),
      model: z.string(),
      promptVersion: z.string(),
      inputTokens: z.number().int(),
      outputTokens: z.number().int(),
      estimatedCostUsd: z.number(),
    })
    .nullable(),
});
export type Stats = z.infer<typeof StatsSchema>;
