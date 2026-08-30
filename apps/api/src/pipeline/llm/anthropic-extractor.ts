import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { BatchAnalysisSchema } from '@rs/contracts';
import { Logger } from '@nestjs/common';
import { config } from '../../config';
import { buildSystemPrompt, buildUserPrompt, type BatchItem } from './prompt';
import type { ExtractResult, Extractor } from './extractor';

const RETRYABLE_ATTEMPTS = 3;

export class AnthropicExtractor implements Extractor {
  readonly name = 'anthropic';
  readonly model = config.llm.model;

  private readonly log = new Logger(AnthropicExtractor.name);
  private readonly client: Anthropic;
  private readonly system = buildSystemPrompt();

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extractBatch(items: readonly BatchItem[]): Promise<ExtractResult> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.call(items);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === RETRYABLE_ATTEMPTS) break;
        const backoffMs = 500 * 2 ** (attempt - 1);
        this.log.warn(
          `Batch of ${items.length} failed (attempt ${attempt}/${RETRYABLE_ATTEMPTS}), retrying in ${backoffMs}ms: ${describe(error)}`,
        );
        await sleep(backoffMs);
      }
    }

    throw lastError;
  }

  private async call(items: readonly BatchItem[]): Promise<ExtractResult> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: config.llm.maxTokens,
      // Cache the system prompt: it is byte-identical across every batch, so
      // only the first call in a run pays full price for the taxonomy.
      system: [
        {
          type: 'text',
          text: this.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: zodOutputFormat(BatchAnalysisSchema),
        effort: config.llm.effort,
      },
      messages: [{ role: 'user', content: buildUserPrompt(items) }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(
        `Model refused the batch: ${response.stop_details?.explanation ?? 'no explanation'}`,
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error('Structured output did not parse against the schema');
    }

    return {
      analyses: parsed.analyses,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.APIConnectionError ||
    error instanceof Anthropic.InternalServerError ||
    // A batch that came back unparsable is worth one more shot.
    (error instanceof Error && error.message.includes('did not parse'))
  );
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `${error.status ?? '?'} ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
