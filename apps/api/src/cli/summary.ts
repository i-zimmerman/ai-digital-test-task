import type { PipelineResult } from '../pipeline/pipeline.service';

export function printSummary(result: PipelineResult): void {
  const c = result.counts;
  const kept = c.ingested - c.junk - c.spam - c.duplicates;

  const lines = [
    '',
    `Pipeline run ${result.runId}`,
    `  model              ${result.model}`,
    `  ingested           ${c.ingested}`,
    `  junk removed       ${c.junk}`,
    `  spam removed       ${c.spam}`,
    `  duplicates merged  ${c.duplicates} across ${c.duplicateClusters} clusters`,
    `  analysed           ${c.analysed} (${c.reused} reused from a previous run)`,
    `  counted in report  ${kept}`,
  ];

  if (c.failed > 0) lines.push(`  FAILED             ${c.failed}`);
  if (result.usage.inputTokens > 0) {
    lines.push(
      `  tokens             ${result.usage.inputTokens} in (${result.usage.cachedInputTokens} cached) / ${result.usage.outputTokens} out`,
      `  estimated cost     $${result.estimatedCostUsd.toFixed(4)}`,
    );
  }
  lines.push('');

  process.stdout.write(`${lines.join('\n')}\n`);
}
