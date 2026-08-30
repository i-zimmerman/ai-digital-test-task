import { createHash } from 'node:crypto';

/**
 * Deterministic text utilities. Deliberately free of Nest and of the database
 * so the interesting logic can be unit-tested in isolation.
 */

/** Letters (any script), digits and spaces survive; everything else goes. */
const NON_CONTENT = /[^\p{L}\p{N}\s]/gu;

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKC')
    .replace(NON_CONTENT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashText(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/**
 * Single words that are technically text but carry nothing actionable.
 * Anything caught here is excluded from aggregation and reported as such.
 */
const LOW_CONTENT_TOKENS = new Set([
  'ok',
  'okay',
  'k',
  'meh',
  'na',
  'nan',
  'none',
  'nothing',
  'nil',
  'first',
  'test',
  'testing',
  'asdf',
  'idk',
  'hmm',
  'hm',
  'yeah',
  'yep',
  'nope',
  'good',
  'bad',
  'fine',
]);

export interface JunkVerdict {
  junk: boolean;
  reason?: string;
}

/**
 * Rule-based junk detection, run BEFORE the LLM.
 *
 * This covers empty strings, punctuation, emoji and single filler words — cases
 * where a model call would be pure waste. It deliberately does NOT try to catch
 * promotional spam: a regex on "free" fires on five legitimate reviews in this
 * corpus ("the free tier is basically useless now"). Spam is the model's job.
 */
export function classifyJunk(rawText: string): JunkVerdict {
  const normalized = normalizeText(rawText);

  if (normalized.length === 0) {
    return { junk: true, reason: 'Empty after normalisation (blank, punctuation or emoji only)' };
  }

  // Count characters, not string length: "n/a" normalises to "n a", which is
  // three characters long but carries two of content.
  const contentChars = normalized.replace(/\s/g, '').length;
  if (contentChars < 3) {
    return { junk: true, reason: `Too short to carry meaning ("${rawText.trim()}")` };
  }

  const words = normalized.split(' ');
  if (words.length === 1 && LOW_CONTENT_TOKENS.has(words[0]!)) {
    return { junk: true, reason: `Single filler word ("${rawText.trim()}")` };
  }

  return { junk: false };
}

/**
 * Character-trigram Dice coefficient.
 *
 * Chosen over token overlap because the near-duplicates in this dataset differ
 * by typos ("payign" / "paying") and punctuation, which trigrams absorb and
 * whole-token comparison does not.
 */
export function trigrams(normalized: string): Set<string> {
  const padded = `  ${normalized} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;

  let overlap = 0;
  const [small, large] = ga.size <= gb.size ? [ga, gb] : [gb, ga];
  for (const gram of small) {
    if (large.has(gram)) overlap += 1;
  }
  return (2 * overlap) / (ga.size + gb.size);
}
