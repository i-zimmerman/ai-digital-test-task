import { PROMPT_VERSION, ReviewAnalysisSchema } from '@rs/contracts';
import { desc, eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { analyses, pipelineRuns } from '../db/schema';
import { dataPath } from '../lib/paths';
import { withApp } from './context';

/**
 * Freezes the current extraction results into data/snapshot.json so the repo
 * runs without an API key. Committing this file is the point.
 */
void withApp(async (app) => {
  const db = app.get<Db>(DB);

  const rows = await db
    .select({ raw: analyses.raw, model: analyses.model })
    .from(analyses)
    .where(eq(analyses.promptVersion, PROMPT_VERSION))
    .orderBy(analyses.reviewId);

  if (rows.length === 0) {
    process.stderr.write(
      `No analyses for prompt version ${PROMPT_VERSION}. Run \`pnpm pipeline:run\` first.\n`,
    );
    process.exit(1);
  }

  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.status, 'ok'))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);

  const snapshot = {
    promptVersion: PROMPT_VERSION,
    model: rows[0]!.model,
    generatedAt: new Date().toISOString(),
    usage: {
      inputTokens: run?.inputTokens ?? 0,
      outputTokens: run?.outputTokens ?? 0,
      cachedInputTokens: run?.cachedInputTokens ?? 0,
    },
    analyses: rows.map((r) => ReviewAnalysisSchema.parse(r.raw)),
  };

  const out = dataPath('snapshot.json');
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Wrote ${snapshot.analyses.length} analyses to ${out}\n`);
});
