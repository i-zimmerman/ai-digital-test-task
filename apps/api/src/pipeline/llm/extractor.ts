import type { ReviewAnalysis } from '@rs/contracts';
import type { BatchItem } from './prompt';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface ExtractResult {
  analyses: ReviewAnalysis[];
  usage: Usage;
}

export interface Extractor {
  readonly name: string;
  readonly model: string;
  extractBatch(items: readonly BatchItem[]): Promise<ExtractResult>;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  };
}
