import {
  ISSUE_CATEGORIES,
  SEVERITY_RANK,
  type IssueCategory,
  type Sentiment,
  type Severity,
} from '@rs/contracts';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { analyses, issues, reviews } from '../db/schema';
import { dataPath } from '../lib/paths';
import { withApp } from './context';

const GoldSchema = z.object({
  labelledBy: z.string(),
  labels: z.array(
    z.object({
      id: z.string(),
      stratum: z.string(),
      is_spam: z.boolean(),
      is_junk: z.boolean(),
      language: z.string(),
      sentiment: z.string(),
      severity: z.string(),
      categories: z.array(z.enum(ISSUE_CATEGORIES)),
      note: z.string().optional(),
    }),
  ),
  expectedDuplicateClusters: z.array(z.array(z.string())),
  expectedNotDuplicates: z.array(z.array(z.string())),
});

interface PRF {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

function prf(tp: number, fp: number, fn: number): PRF {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

void withApp(async (app) => {
  const db = app.get<Db>(DB);
  const gold = GoldSchema.parse(
    JSON.parse(readFileSync(dataPath('gold-labels.json'), 'utf8')),
  );

  const allReviews = await db
    .select({
      id: reviews.id,
      status: reviews.status,
      clusterId: reviews.clusterId,
      canonicalId: reviews.canonicalId,
      text: reviews.text,
    })
    .from(reviews);

  if (allReviews.length === 0) {
    process.stderr.write('The database is empty. Run `pnpm seed` (or `pnpm pipeline:run`) first.\n');
    process.exit(1);
  }

  const reviewById = new Map(allReviews.map((r) => [r.id, r]));

  const analysisRows = await db
    .select({
      reviewId: analyses.reviewId,
      sentiment: analyses.sentiment,
      severity: analyses.severity,
      isSpam: analyses.isSpam,
      language: analyses.languageDetected,
      model: analyses.model,
      confidence: analyses.confidence,
    })
    .from(analyses);
  const analysisById = new Map(analysisRows.map((a) => [a.reviewId, a]));

  const issueRows = await db
    .select({ reviewId: issues.reviewId, category: issues.category })
    .from(issues);
  const categoriesById = new Map<string, Set<IssueCategory>>();
  for (const row of issueRows) {
    const set = categoriesById.get(row.reviewId) ?? new Set<IssueCategory>();
    set.add(row.category);
    categoriesById.set(row.reviewId, set);
  }

  // ---- exclusion (spam + junk) -------------------------------------------
  let exTp = 0;
  let exFp = 0;
  let exFn = 0;
  const exclusionMisses: string[] = [];

  for (const label of gold.labels) {
    const row = reviewById.get(label.id);
    if (!row) continue;
    const goldExcluded = label.is_spam || label.is_junk;
    const systemExcluded = row.status === 'spam' || row.status === 'junk';
    if (goldExcluded && systemExcluded) exTp += 1;
    else if (!goldExcluded && systemExcluded) {
      exFp += 1;
      exclusionMisses.push(`${label.id} kept in gold, excluded by system (${row.status})`);
    } else if (goldExcluded && !systemExcluded) {
      exFn += 1;
      exclusionMisses.push(`${label.id} excluded in gold, kept by system`);
    }
  }
  const exclusion = prf(exTp, exFp, exFn);

  // ---- per-review classification -----------------------------------------
  // A gold review the system collapsed into a duplicate is scored against its
  // cluster canonical: that is the system's answer for that content.
  const scored = gold.labels.filter((l) => !l.is_spam && !l.is_junk);

  let sentimentHits = 0;
  let severityExact = 0;
  let severityWithinOne = 0;
  let languageHits = 0;
  let catTp = 0;
  let catFp = 0;
  let catFn = 0;
  let missingAnalysis = 0;
  const confusion: Record<string, Record<string, number>> = {};
  const perReview: unknown[] = [];

  for (const label of scored) {
    const row = reviewById.get(label.id);
    const targetId = row?.canonicalId ?? label.id;
    const analysis = analysisById.get(targetId);
    const predicted = categoriesById.get(targetId) ?? new Set<IssueCategory>();

    if (!analysis) {
      missingAnalysis += 1;
      perReview.push({ id: label.id, error: 'no analysis in database' });
      continue;
    }

    const sentimentOk = analysis.sentiment === (label.sentiment as Sentiment);
    if (sentimentOk) sentimentHits += 1;
    confusion[label.sentiment] ??= {};
    confusion[label.sentiment]![analysis.sentiment] =
      (confusion[label.sentiment]![analysis.sentiment] ?? 0) + 1;

    const severityOk = analysis.severity === (label.severity as Severity);
    if (severityOk) severityExact += 1;
    const gap = Math.abs(
      SEVERITY_RANK[analysis.severity] - SEVERITY_RANK[label.severity as Severity],
    );
    if (gap <= 1) severityWithinOne += 1;

    if (analysis.language.toLowerCase().startsWith(label.language)) languageHits += 1;

    const goldCats = new Set(label.categories);
    const tp = [...predicted].filter((c) => goldCats.has(c));
    const fp = [...predicted].filter((c) => !goldCats.has(c));
    const fn = [...goldCats].filter((c) => !predicted.has(c));
    catTp += tp.length;
    catFp += fp.length;
    catFn += fn.length;

    perReview.push({
      id: label.id,
      stratum: label.stratum,
      scoredAgainst: targetId === label.id ? undefined : targetId,
      sentiment: { gold: label.sentiment, system: analysis.sentiment, ok: sentimentOk },
      severity: {
        gold: label.severity,
        system: analysis.severity,
        ok: severityOk,
        gap,
      },
      categories: {
        gold: [...goldCats],
        system: [...predicted],
        missed: fn,
        spurious: fp,
      },
      confidence: analysis.confidence,
    });
  }

  const n = scored.length - missingAnalysis;
  const categories = prf(catTp, catFp, catFn);

  // ---- dedup --------------------------------------------------------------
  const systemPair = (a: string, b: string): boolean => {
    const ra = reviewById.get(a);
    const rb = reviewById.get(b);
    return !!ra?.clusterId && ra.clusterId === rb?.clusterId;
  };

  let dupTp = 0;
  let dupFn = 0;
  const dedupMisses: string[] = [];
  for (const cluster of gold.expectedDuplicateClusters) {
    for (let i = 0; i < cluster.length; i += 1) {
      for (let j = i + 1; j < cluster.length; j += 1) {
        if (systemPair(cluster[i]!, cluster[j]!)) dupTp += 1;
        else {
          dupFn += 1;
          dedupMisses.push(`missed ${cluster[i]} = ${cluster[j]}`);
        }
      }
    }
  }
  let dupFp = 0;
  for (const [a, b] of gold.expectedNotDuplicates) {
    if (systemPair(a!, b!)) {
      dupFp += 1;
      dedupMisses.push(`wrongly merged ${a} + ${b}`);
    }
  }
  const dedup = prf(dupTp, dupFp, dupFn);

  const model = analysisRows[0]?.model ?? 'unknown';

  // ---- report -------------------------------------------------------------
  const out: string[] = [
    '',
    '='.repeat(66),
    `  EVALUATION vs ${gold.labels.length} hand-labelled reviews`,
    `  model: ${model}   labelled by: ${gold.labelledBy}`,
    '='.repeat(66),
    '',
    `  Spam / junk detection      P ${pct(exclusion.precision)}  R ${pct(exclusion.recall)}  F1 ${pct(exclusion.f1)}   (tp ${exclusion.tp} fp ${exclusion.fp} fn ${exclusion.fn})`,
    `  Duplicate detection        P ${pct(dedup.precision)}  R ${pct(dedup.recall)}  F1 ${pct(dedup.f1)}   (tp ${dedup.tp} fp ${dedup.fp} fn ${dedup.fn})`,
    '',
    `  Scored on ${n} non-spam, non-junk reviews:`,
    `  Sentiment accuracy         ${pct(n ? sentimentHits / n : 0)}   (${sentimentHits}/${n})`,
    `  Severity exact             ${pct(n ? severityExact / n : 0)}   (${severityExact}/${n})`,
    `  Severity within one level  ${pct(n ? severityWithinOne / n : 0)}   (${severityWithinOne}/${n})`,
    `  Language detection         ${pct(n ? languageHits / n : 0)}   (${languageHits}/${n})`,
    `  Issue categories (micro)   P ${pct(categories.precision)}  R ${pct(categories.recall)}  F1 ${pct(categories.f1)}   (tp ${categories.tp} fp ${categories.fp} fn ${categories.fn})`,
    '',
  ];

  if (model.startsWith('mock')) {
    out.push(
      '  NOTE: these numbers come from the keyword mock, not from a model.',
      '  The mock\'s rules and these gold labels were written by the same person',
      '  from the same reading of the corpus, so the score is circular and means',
      '  nothing. Run `pnpm pipeline:run` with an ANTHROPIC_API_KEY for a real one.',
      '',
    );
  }

  if (missingAnalysis > 0) {
    out.push(`  WARNING: ${missingAnalysis} labelled review(s) had no analysis in the database.`, '');
  }

  const disagreements = (perReview as { id: string; sentiment?: { ok: boolean }; severity?: { ok: boolean }; categories?: { missed: string[]; spurious: string[] } }[])
    .filter(
      (r) =>
        r.sentiment?.ok === false ||
        r.severity?.ok === false ||
        (r.categories?.missed.length ?? 0) > 0 ||
        (r.categories?.spurious.length ?? 0) > 0,
    );

  if (disagreements.length > 0) {
    out.push('  Disagreements:');
    for (const item of disagreements) {
      const bits: string[] = [];
      if (item.sentiment?.ok === false) bits.push('sentiment');
      if (item.severity?.ok === false) bits.push('severity');
      if (item.categories?.missed.length) bits.push(`missed ${item.categories.missed.join(',')}`);
      if (item.categories?.spurious.length) bits.push(`extra ${item.categories.spurious.join(',')}`);
      out.push(`    ${item.id}  ${bits.join(' | ')}`);
    }
    out.push('');
  }

  for (const miss of [...exclusionMisses, ...dedupMisses]) {
    out.push(`    ${miss}`);
  }
  if (exclusionMisses.length + dedupMisses.length > 0) out.push('');

  process.stdout.write(`${out.join('\n')}\n`);

  const reportPath = dataPath('..', 'eval-report.json');
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model,
        labelledBy: gold.labelledBy,
        summary: {
          exclusion,
          dedup,
          sentimentAccuracy: n ? sentimentHits / n : 0,
          severityExact: n ? severityExact / n : 0,
          severityWithinOne: n ? severityWithinOne / n : 0,
          languageAccuracy: n ? languageHits / n : 0,
          categories,
          scoredReviews: n,
        },
        sentimentConfusion: confusion,
        perReview,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`  Full report written to ${reportPath}\n\n`);
});
