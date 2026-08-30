import { describe, expect, it } from 'vitest';
import { classifyJunk, diceSimilarity, normalizeText } from './text';

describe('normalizeText', () => {
  it('strips punctuation and case, collapses whitespace', () => {
    expect(normalizeText('  Unusable!!  App CRASHES. ')).toBe('unusable app crashes');
  });

  it('makes punctuation-only cross-post variants identical', () => {
    expect(normalizeText('App crashes every single time. Unusable.')).toBe(
      normalizeText('App crashes every single time! Unusable!'),
    );
  });

  it('keeps non-Latin scripts', () => {
    expect(normalizeText('很好用，界面漂亮，但是太贵了。')).toBe('很好用 界面漂亮 但是太贵了');
  });
});

describe('classifyJunk', () => {
  it.each([
    ['', 'blank'],
    ['   ', 'whitespace'],
    ['.', 'punctuation'],
    ['...', 'ellipsis'],
    ['👍', 'emoji only'],
    ['n/a', 'n/a'],
    ['ok', 'filler'],
    ['meh', 'filler'],
    ['First!!!!', 'forum noise'],
  ])('rejects %j (%s)', (input) => {
    expect(classifyJunk(input).junk).toBe(true);
  });

  it.each([
    'Not happy. Battery dies in an hour.',
    'Me cobraron dos veces este mes, quiero un reembolso.',
    '很好用，界面漂亮，但是太贵了。',
    // The case a naive spam regex on "free" gets wrong: this is real feedback.
    'Not happy. The free tier is basically useless now.',
  ])('keeps %j', (input) => {
    expect(classifyJunk(input).junk).toBe(false);
  });

  it('explains why something was dropped', () => {
    expect(classifyJunk('meh').reason).toMatch(/filler/i);
  });
});

describe('diceSimilarity', () => {
  it('scores typo variants above the 0.88 threshold', () => {
    const a = normalizeText('Regret payign for this. Price went up with no warning.');
    const b = normalizeText('Regret paying for this. Price went up with no warning.');
    expect(diceSimilarity(a, b)).toBeGreaterThan(0.88);
  });

  it('scores reviews that merely share a template below the threshold', () => {
    const a = normalizeText('Could be better. Exactly what i needed, but too many taps to do one thing.');
    const b = normalizeText("It's okay. Exactly what i needed, but too many taps to do one thing.");
    // The hardest negative in the corpus at 0.806 — this is why 0.88, not 0.80.
    expect(diceSimilarity(a, b)).toBeLessThan(0.88);
  });

  it('is symmetric and self-identical', () => {
    const a = normalizeText('Battery dies in an hour');
    const b = normalizeText('Missing half the order');
    expect(diceSimilarity(a, a)).toBe(1);
    expect(diceSimilarity(a, b)).toBeCloseTo(diceSimilarity(b, a));
  });
});
