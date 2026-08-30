import { z } from 'zod';
import {
  ISSUE_CATEGORIES,
  SENTIMENTS,
  SEVERITY_LEVELS,
} from './taxonomy.js';

/**
 * Bump when the prompt or this schema changes. Extraction results are keyed by
 * (promptVersion, textHash), so a bump re-runs the pipeline while an unchanged
 * version makes re-runs free and idempotent.
 */
export const PROMPT_VERSION = 'v2';

export const ExtractedIssueSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  /** Short human-readable phrase, for display. Aggregation never groups on this. */
  label: z.string().min(1).max(60),
  /** Verbatim span from the review that supports this issue. */
  quote: z.string().min(1).max(300),
  /**
   * Severity of THIS issue, not of the review.
   *
   * A review saying "billed after I cancelled, and I wish it had dark mode"
   * is critical overall, but its dark-mode issue is low. Without per-issue
   * severity every category inherits the worst severity of any review that
   * mentions it, and the "worst severity" column reads Critical everywhere.
   */
  severity: z.enum(SEVERITY_LEVELS),
});
export type ExtractedIssue = z.infer<typeof ExtractedIssueSchema>;

export const ReviewAnalysisSchema = z.object({
  id: z.string(),
  /** Promotional/scam content with no genuine feedback about the product. */
  is_spam: z.boolean(),
  /** Detected from the text — the `language` field in the source data is not trusted blindly. */
  language: z.string().min(2).max(8),
  sentiment: z.enum(SENTIMENTS),
  /** Severity of the review as a whole — the worst of its issues. */
  severity: z.enum(SEVERITY_LEVELS),
  issues: z.array(ExtractedIssueSchema).max(5),
  /**
   * One-line English gist. Always filled, so a non-technical English-speaking
   * reader can act on a Portuguese or Chinese review instead of skipping it.
   */
  summary_en: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
});
export type ReviewAnalysis = z.infer<typeof ReviewAnalysisSchema>;

/** One structured-output call handles a batch of reviews. */
export const BatchAnalysisSchema = z.object({
  analyses: z.array(ReviewAnalysisSchema),
});
export type BatchAnalysis = z.infer<typeof BatchAnalysisSchema>;

/** Raw shape of the provided dataset. */
export const RawReviewSchema = z.object({
  id: z.string(),
  product: z.string(),
  source: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
  language: z.string(),
  text: z.string(),
});
export type RawReview = z.infer<typeof RawReviewSchema>;

export const RawReviewsSchema = z.array(RawReviewSchema);
