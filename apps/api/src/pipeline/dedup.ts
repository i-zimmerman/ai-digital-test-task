import { diceSimilarity } from './text';

export interface DedupCandidate {
  id: string;
  product: string;
  textNorm: string;
  textHash: string;
  rating: number | null;
}

export interface ClusterMember {
  id: string;
  /** Similarity to the canonical member; 1 for the canonical member itself. */
  similarity: number;
}

export interface DuplicateCluster {
  clusterId: string;
  canonicalId: string;
  members: ClusterMember[];
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(a: number): number {
    let root = a;
    while (this.parent[root] !== root) root = this.parent[root]!;
    let cur = a;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/**
 * Groups near-identical reviews into clusters, SCOPED TO A SINGLE PRODUCT.
 *
 * The product scope is the important part. This corpus contains identical text
 * attached to different products — "Great product overall. The design is
 * gorgeous." appears under both FreshCrate and AeroBuds. Those are not one
 * person cross-posting; they are separate signals about separate products, and
 * collapsing them would corrupt the per-product counts the whole report is
 * built on. Measured on the provided data: a global dedup collapses 56 of 290
 * usable rows (19%), while product-scoped dedup collapses 15 — of which 10
 * clusters span more than one channel, i.e. genuine cross-posts.
 */
export function clusterDuplicates(
  rows: readonly DedupCandidate[],
  threshold: number,
): DuplicateCluster[] {
  const uf = new UnionFind(rows.length);
  const byProduct = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const bucket = byProduct.get(row.product);
    if (bucket) bucket.push(index);
    else byProduct.set(row.product, [index]);
  });

  for (const indices of byProduct.values()) {
    // Exact matches first — free, and it shrinks the O(n^2) pass below.
    const byHash = new Map<string, number>();
    for (const index of indices) {
      const hash = rows[index]!.textHash;
      const seen = byHash.get(hash);
      if (seen === undefined) byHash.set(hash, index);
      else uf.union(seen, index);
    }

    const representatives = [...byHash.values()];
    for (let i = 0; i < representatives.length; i += 1) {
      for (let j = i + 1; j < representatives.length; j += 1) {
        const a = rows[representatives[i]!]!;
        const b = rows[representatives[j]!]!;
        // Length guard: texts this different cannot clear the threshold.
        const longer = Math.max(a.textNorm.length, b.textNorm.length);
        if (Math.abs(a.textNorm.length - b.textNorm.length) > longer * 0.35) {
          continue;
        }
        if (diceSimilarity(a.textNorm, b.textNorm) >= threshold) {
          uf.union(representatives[i]!, representatives[j]!);
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  rows.forEach((_, index) => {
    const root = uf.find(index);
    const bucket = groups.get(root);
    if (bucket) bucket.push(index);
    else groups.set(root, [index]);
  });

  const clusters: DuplicateCluster[] = [];
  for (const indices of groups.values()) {
    const members = indices.map((i) => rows[i]!);
    const canonical = pickCanonical(members);
    clusters.push({
      clusterId: canonical.id,
      canonicalId: canonical.id,
      members: members.map((m) => ({
        id: m.id,
        similarity:
          m.id === canonical.id
            ? 1
            : Number(diceSimilarity(canonical.textNorm, m.textNorm).toFixed(4)),
      })),
    });
  }

  // Stable output ordering keeps runs reproducible.
  clusters.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  return clusters;
}

/**
 * Keeps the most informative member: longest text wins, then the one that has a
 * star rating, then the lowest id. Fully deterministic, so two runs over the
 * same data always keep the same review.
 */
function pickCanonical(members: readonly DedupCandidate[]): DedupCandidate {
  return [...members].sort((a, b) => {
    if (b.textNorm.length !== a.textNorm.length) {
      return b.textNorm.length - a.textNorm.length;
    }
    const aRated = a.rating === null ? 0 : 1;
    const bRated = b.rating === null ? 0 : 1;
    if (bRated !== aRated) return bRated - aRated;
    return a.id.localeCompare(b.id);
  })[0]!;
}
