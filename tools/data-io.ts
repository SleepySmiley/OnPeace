import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseRules, type Rules } from '@onpeace/engine';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const dataDir = join(repoRoot, 'data');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadRules(): Rules {
  return parseRules({
    units: readJson(join(dataDir, 'rules', 'units.json')),
    buildings: readJson(join(dataDir, 'rules', 'buildings.json')),
    defaults: readJson(join(dataDir, 'rules', 'defaults.json')),
    strategies: readJson(join(dataDir, 'rules', 'strategies.json')),
    general: readJson(join(dataDir, 'rules', 'general.json')),
  });
}

export function listMapFiles(): string[] {
  return readdirSync(join(dataDir, 'maps'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(dataDir, 'maps', f));
}
