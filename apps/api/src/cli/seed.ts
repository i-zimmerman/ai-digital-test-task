import { existsSync } from 'node:fs';
import { PipelineService } from '../pipeline/pipeline.service';
import { MockExtractor } from '../pipeline/llm/mock-extractor';
import { SnapshotExtractor } from '../pipeline/llm/snapshot-extractor';
import { dataPath } from '../lib/paths';
import { loadReviews } from './load-reviews';
import { withApp } from './context';
import { printSummary } from './summary';

/**
 * Loads the dataset and replays the committed pipeline snapshot — no API key
 * needed. The deterministic stages genuinely run; only the model call is
 * replayed. Anything the snapshot is missing falls back to the keyword mock so
 * a stale snapshot degrades instead of failing.
 */
void withApp(async (app) => {
  const snapshotPath = dataPath('snapshot.json');
  if (!existsSync(snapshotPath)) {
    process.stderr.write(
      `No snapshot at ${snapshotPath}.\nRun \`pnpm pipeline:run\` with an ANTHROPIC_API_KEY, then \`pnpm pipeline:snapshot\`.\n`,
    );
    process.exit(1);
  }

  const extractor = new SnapshotExtractor(snapshotPath, new MockExtractor());
  process.stdout.write(
    `Replaying snapshot (${extractor.size} analyses, model ${extractor.model})\n`,
  );

  const result = await app.get(PipelineService).run(loadReviews(), extractor);
  printSummary(result);
});
