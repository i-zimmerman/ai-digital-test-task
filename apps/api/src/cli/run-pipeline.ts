import { config } from '../config';
import { PipelineService } from '../pipeline/pipeline.service';
import { AnthropicExtractor } from '../pipeline/llm/anthropic-extractor';
import { MockExtractor } from '../pipeline/llm/mock-extractor';
import { loadReviews } from './load-reviews';
import { withApp } from './context';
import { printSummary } from './summary';

const useMock = process.argv.includes('--mock') || !config.anthropicApiKey;
const force = process.argv.includes('--force');

void withApp(async (app) => {
  if (useMock && !config.anthropicApiKey) {
    process.stdout.write(
      'No ANTHROPIC_API_KEY set — running with the deterministic keyword mock.\n' +
        'Set the key in .env for a real extraction run.\n\n',
    );
  }

  const extractor = useMock
    ? new MockExtractor()
    : new AnthropicExtractor(config.anthropicApiKey);

  const result = await app
    .get(PipelineService)
    .run(loadReviews(), extractor, { force });

  printSummary(result);
});
