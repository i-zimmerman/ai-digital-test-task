import { Inject, Injectable } from '@nestjs/common';
import {
  ISSUE_CATEGORY_LABEL,
  POSITIVE_CATEGORIES,
  SEVERITY_RANK,
  type ExampleQuote,
  type IssueCategory,
  type IssueFilters,
  type ReviewDetail,
  type Severity,
  type TopIssue,
} from '@rs/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { analyses, issues, reviews } from '../db/schema';

interface JoinedRow {
  reviewId: string;
  product: string;
  source: string;
  clusterSize: number;
  category: IssueCategory;
  label: string;
  quote: string;
  /** Severity of this issue on its own. */
  severity: Severity;
  /** Severity of the whole review — the worst of its issues. */
  reviewSeverity: Severity;
  sentiment: string;
  confidence: number;
}

@Injectable()
export class IssuesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Aggregation runs in TypeScript rather than SQL on purpose.
   *
   * The corpus is 300 reviews, so the whole joined set is a few hundred rows and
   * fetching it costs nothing. In exchange the ranking and example-selection
   * rules stay readable and unit-testable in one place instead of being spread
   * across window functions. At a million rows this becomes a GROUP BY with a
   * lateral join — flagged in WRITEUP.md as a deliberate trade-off.
   */
  async topIssues(filters: IssueFilters): Promise<TopIssue[]> {
    const conditions = [eq(reviews.status, 'ok')];
    if (filters.product) conditions.push(eq(reviews.product, filters.product));
    if (filters.source) conditions.push(eq(reviews.source, filters.source));
    // Filter on the issue's own severity: filtering by "critical" should show
    // critical problems, not every problem mentioned by someone who also had one.
    if (filters.severity) conditions.push(eq(issues.severity, filters.severity));

    const rows = (await this.db
      .select({
        reviewId: reviews.id,
        product: reviews.product,
        source: reviews.source,
        clusterSize: reviews.clusterSize,
        category: issues.category,
        label: issues.label,
        quote: issues.quote,
        severity: issues.severity,
        reviewSeverity: analyses.severity,
        sentiment: analyses.sentiment,
        confidence: analyses.confidence,
      })
      .from(issues)
      .innerJoin(analyses, eq(issues.analysisId, analyses.id))
      .innerJoin(reviews, eq(issues.reviewId, reviews.id))
      .where(and(...conditions))) as JoinedRow[];

    const buckets = new Map<IssueCategory, JoinedRow[]>();
    for (const row of rows) {
      if (!filters.includePositive && POSITIVE_CATEGORIES.has(row.category)) {
        continue;
      }
      const bucket = buckets.get(row.category);
      if (bucket) bucket.push(row);
      else buckets.set(row.category, [row]);
    }

    const result: TopIssue[] = [];
    for (const [category, bucketRows] of buckets) {
      result.push(summarise(category, bucketRows));
    }

    // Rank by how many distinct people raised it, breaking ties on severity so
    // a small number of critical reports is not buried under cosmetic noise.
    result.sort(
      (a, b) =>
        b.mentionCount - a.mentionCount ||
        SEVERITY_RANK[b.worstSeverity] - SEVERITY_RANK[a.worstSeverity] ||
        a.category.localeCompare(b.category),
    );
    return result;
  }

  /** The drill-down: every review behind one issue category. */
  async reviewsForIssue(
    category: IssueCategory,
    filters: IssueFilters,
  ): Promise<ReviewDetail[]> {
    const conditions = [eq(reviews.status, 'ok'), eq(issues.category, category)];
    if (filters.product) conditions.push(eq(reviews.product, filters.product));
    if (filters.source) conditions.push(eq(reviews.source, filters.source));
    if (filters.severity) conditions.push(eq(issues.severity, filters.severity));

    const ids = await this.db
      .selectDistinct({ id: reviews.id })
      .from(issues)
      .innerJoin(analyses, eq(issues.analysisId, analyses.id))
      .innerJoin(reviews, eq(issues.reviewId, reviews.id))
      .where(and(...conditions));

    const details = await Promise.all(
      ids.map((row) => this.reviewDetail(row.id)),
    );
    return details
      .filter((d): d is ReviewDetail => d !== null)
      .sort(
        (a, b) =>
          SEVERITY_RANK[b.severity ?? 'none'] - SEVERITY_RANK[a.severity ?? 'none'] ||
          (b.confidence ?? 0) - (a.confidence ?? 0),
      );
  }

  async reviewDetail(reviewId: string): Promise<ReviewDetail | null> {
    const [row] = await this.db
      .select({
        id: reviews.id,
        product: reviews.product,
        source: reviews.source,
        rating: reviews.rating,
        language: reviews.language,
        text: reviews.text,
        status: reviews.status,
        clusterId: reviews.clusterId,
        analysisId: analyses.id,
        summaryEn: analyses.summaryEn,
        sentiment: analyses.sentiment,
        severity: analyses.severity,
        confidence: analyses.confidence,
        languageDetected: analyses.languageDetected,
      })
      .from(reviews)
      .leftJoin(analyses, eq(analyses.reviewId, reviews.id))
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!row) return null;

    const issueRows = row.analysisId
      ? await this.db
          .select({
            category: issues.category,
            label: issues.label,
            quote: issues.quote,
            severity: issues.severity,
          })
          .from(issues)
          .where(eq(issues.analysisId, row.analysisId))
      : [];

    const siblings = row.clusterId
      ? await this.db
          .select({
            reviewId: reviews.id,
            source: reviews.source,
            similarity: reviews.dupSimilarity,
          })
          .from(reviews)
          .where(eq(reviews.clusterId, row.clusterId))
      : [];

    return {
      id: row.id,
      product: row.product,
      source: row.source,
      rating: row.rating,
      language: row.language,
      languageDetected: row.languageDetected,
      text: row.text,
      summaryEn: row.summaryEn,
      sentiment: row.sentiment,
      severity: row.severity,
      confidence: row.confidence,
      status: row.status,
      issues: issueRows,
      alsoPostedOn: siblings.map((s) => ({
        reviewId: s.reviewId,
        source: s.source,
        similarity: s.similarity ?? 1,
      })),
    };
  }

  async products(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ product: reviews.product })
      .from(reviews)
      .orderBy(sql`1`);
    return rows.map((r) => r.product);
  }
}

function summarise(category: IssueCategory, rows: readonly JoinedRow[]): TopIssue {
  const byReview = new Map<string, JoinedRow>();
  for (const row of rows) {
    // One review can raise the same category twice; keep the worst of them.
    const existing = byReview.get(row.reviewId);
    if (!existing || SEVERITY_RANK[row.severity] > SEVERITY_RANK[existing.severity]) {
      byReview.set(row.reviewId, row);
    }
  }
  const unique = [...byReview.values()];

  const severityMix: Record<string, number> = {};
  const productMix: Record<string, number> = {};
  const sourceMix: Record<string, number> = {};
  let mentionCount = 0;
  let negative = 0;
  let worstSeverity: Severity = 'none';

  for (const row of unique) {
    severityMix[row.severity] = (severityMix[row.severity] ?? 0) + 1;
    productMix[row.product] = (productMix[row.product] ?? 0) + 1;
    sourceMix[row.source] = (sourceMix[row.source] ?? 0) + 1;
    mentionCount += row.clusterSize;
    if (row.sentiment === 'negative' || row.sentiment === 'mixed') negative += 1;
    if (SEVERITY_RANK[row.severity] > SEVERITY_RANK[worstSeverity]) {
      worstSeverity = row.severity;
    }
  }

  return {
    category,
    label: mostCommonLabel(rows) ?? ISSUE_CATEGORY_LABEL[category],
    reviewCount: unique.length,
    mentionCount,
    worstSeverity,
    severityMix: severityMix as TopIssue['severityMix'],
    productMix,
    sourceMix,
    negativeShare: unique.length ? negative / unique.length : 0,
    examples: pickExamples(rows),
  };
}

/** The specific complaint people actually wrote, not just the category name. */
function mostCommonLabel(rows: readonly JoinedRow[]): string | undefined {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.label.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  if (!best) return undefined;
  return best[0].charAt(0).toUpperCase() + best[0].slice(1);
}

/**
 * Two example quotes per issue: worst severity first, then highest model
 * confidence, then the longest quote — the most severe, best-evidenced,
 * most informative lines. Quotes are de-duplicated so both examples do not
 * come out as the same sentence from two channels.
 */
function quoteKey(quote: string): string {
  return quote
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickExamples(rows: readonly JoinedRow[], limit = 2): ExampleQuote[] {
  const ranked = [...rows].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.confidence - a.confidence ||
      b.quote.length - a.quote.length,
  );

  const seenQuote = new Set<string>();
  const seenReview = new Set<string>();
  const picked: ExampleQuote[] = [];

  for (const row of ranked) {
    // Two cross-posts of the same sentence often differ only by a trailing full
    // stop, which is enough to slip past a plain string comparison and show the
    // reader the same quote twice.
    const key = quoteKey(row.quote);
    if (seenQuote.has(key) || seenReview.has(row.reviewId)) continue;
    seenQuote.add(key);
    seenReview.add(row.reviewId);
    picked.push({
      reviewId: row.reviewId,
      quote: row.quote,
      product: row.product,
      source: row.source,
      severity: row.severity,
    });
    if (picked.length === limit) break;
  }

  return picked;
}
