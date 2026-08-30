import { describe, expect, it } from 'vitest';
import { clusterDuplicates, type DedupCandidate } from './dedup';
import { hashText, normalizeText } from './text';

function candidate(
  id: string,
  product: string,
  text: string,
  rating: number | null = null,
): DedupCandidate {
  const textNorm = normalizeText(text);
  return { id, product, textNorm, textHash: hashText(textNorm), rating };
}

const THRESHOLD = 0.88;

describe('clusterDuplicates', () => {
  it('merges the same review cross-posted to several channels', () => {
    const rows = [
      candidate('a', 'PulseFit', 'App crashes every single time I try to sync. Unusable.'),
      candidate('b', 'PulseFit', 'App crashes every single time I try to sync. Unusable. '),
      candidate('c', 'PulseFit', 'App crashes every single time I try to sync! Unusable!'),
    ];
    const clusters = clusterDuplicates(rows, THRESHOLD);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members).toHaveLength(3);
  });

  it('merges typo variants that exact matching would miss', () => {
    const rows = [
      candidate('a', 'PulseFit', 'Regret payign for this. Price went up with no warning.'),
      candidate('b', 'PulseFit', 'Regret paying for this. Price went up with no warning.'),
    ];
    expect(clusterDuplicates(rows, THRESHOLD)[0]!.members).toHaveLength(2);
  });

  it('NEVER merges identical text belonging to different products', () => {
    // The trap in this dataset: the same sentence appears under FreshCrate and
    // AeroBuds. Merging them would corrupt every per-product count.
    const rows = [
      candidate('a', 'FreshCrate', 'Great product overall. The design is gorgeous.'),
      candidate('b', 'AeroBuds', 'Great product overall. The design is gorgeous.'),
    ];
    const clusters = clusterDuplicates(rows, THRESHOLD);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.members.length === 1)).toBe(true);
  });

  it('keeps reviews that only share a template opener apart', () => {
    const rows = [
      candidate('a', 'TaskFlow', 'Could be better. Exactly what i needed, but too many taps to do one thing.'),
      candidate('b', 'TaskFlow', "It's okay. Exactly what i needed, but too many taps to do one thing."),
    ];
    expect(clusterDuplicates(rows, THRESHOLD)).toHaveLength(2);
  });

  it('picks a canonical deterministically: longest, then rated, then lowest id', () => {
    const rows = [
      candidate('z', 'AeroBuds', "Won't hold a charge anymore.", null),
      candidate('m', 'AeroBuds', "Won't hold a charge anymore.", 2),
      candidate('a', 'AeroBuds', "Won't hold a charge anymore, sadly.", null),
    ];
    const [cluster] = clusterDuplicates(rows, THRESHOLD);
    expect(cluster!.canonicalId).toBe('a');

    // Same input in a different order must give the same canonical.
    const shuffled = clusterDuplicates([rows[1]!, rows[2]!, rows[0]!], THRESHOLD);
    expect(shuffled[0]!.canonicalId).toBe('a');
  });

  it('reports similarity of each member against the canonical', () => {
    const rows = [
      candidate('a', 'PulseFit', 'Regret paying for this. Price went up with no warning.'),
      candidate('b', 'PulseFit', 'Regret payign for this. Price went up with no warning.'),
    ];
    const members = clusterDuplicates(rows, THRESHOLD)[0]!.members;
    const canonical = members.find((m) => m.similarity === 1);
    const other = members.find((m) => m.similarity !== 1);
    expect(canonical).toBeDefined();
    expect(other!.similarity).toBeGreaterThan(0.88);
    expect(other!.similarity).toBeLessThan(1);
  });
});
