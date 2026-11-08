import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Catalog, MapDef, parseRules, type Dice, type Rules } from '../src';

export const dataDir = fileURLToPath(new URL('../../../data', import.meta.url));

export const readJson = (...parts: string[]) =>
  JSON.parse(readFileSync(join(dataDir, ...parts), 'utf8'));

export function loadRules(): Rules {
  return parseRules({
    units: readJson('rules', 'units.json'),
    buildings: readJson('rules', 'buildings.json'),
    defaults: readJson('rules', 'defaults.json'),
  });
}

export const loadCatalog = () => new Catalog(loadRules());

export const loadTestMap = () => MapDef.parse(readJson('maps', 'prova.json'));

/** Dadi a copione: restituisce i tiri nell'ordine dato, nessun critico salvo indicazione. */
export function scriptedDice(rolls: number[], crits: boolean[] = []): Dice & { used: () => number } {
  let i = 0;
  let c = 0;
  return {
    roll: () => {
      const v = rolls[i++];
      if (v === undefined) throw new Error('tiri a copione esauriti');
      return v;
    },
    crit: () => crits[c++] ?? false,
    used: () => i,
  };
}
