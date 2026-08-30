import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walks up from the current working directory to the workspace root, so the
 * scripts work whether they are run from the repo root, from apps/api, or
 * through `pnpm --filter`.
 */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function dataPath(...segments: string[]): string {
  return resolve(repoRoot(), 'data', ...segments);
}
