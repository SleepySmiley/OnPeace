import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const dataDir = join(repoRoot, 'data');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
