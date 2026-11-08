import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Catalog, MapDef, createContext, parseRules, type Dice, type Rules } from '../src';

export const dataDir = fileURLToPath(new URL('../../../data', import.meta.url));

export const readJson = (...parts: string[]) =>
  JSON.parse(readFileSync(join(dataDir, ...parts), 'utf8'));

export function loadRules(): Rules {
  return parseRules({
    units: readJson('rules', 'units.json'),
    buildings: readJson('rules', 'buildings.json'),
    defaults: readJson('rules', 'defaults.json'),
    strategies: readJson('rules', 'strategies.json'),
    general: readJson('rules', 'general.json'),
  });
}

export const loadCatalog = () => new Catalog(loadRules());

export const loadTestMap = () => MapDef.parse(readJson('maps', 'prova.json'));

export const loadContext = () => createContext(loadTestMap(), loadRules());

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

/**
 * Mappa sintetica 400×200 (1 punto raggio = 10 unità):
 *   isola A  x 20–180  (montagna in x 90–110, y 20–90)
 *   mare     x 180–220
 *   isola B  x 220–380
 */
export function twoIslandMap(): MapDef {
  return MapDef.parse({
  id: 'test',
  name: 'Test',
  width: 400,
  height: 200,
  rangeScale: 10,
  countries: [
    { id: 'aa', name: 'A', capital: 'a1', shape: [[[[20, 20], [180, 20], [180, 180], [20, 180]]]] },
    { id: 'bb', name: 'B', capital: 'b1', shape: [[[[220, 20], [380, 20], [380, 180], [220, 180]]]] },
  ],
  cities: [
    { id: 'a1', name: 'A1', country: 'aa', pos: [50, 100], population: 2, income: 200, port: false },
    { id: 'a2', name: 'A2', country: 'aa', pos: [170, 100], population: 1, income: 100, port: true },
    { id: 'b1', name: 'B1', country: 'bb', pos: [230, 100], population: 2, income: 200, port: true },
    { id: 'b2', name: 'B2', country: 'bb', pos: [350, 100], population: 1, income: 100, port: false },
  ],
  noGo: [[[[90, 20], [110, 20], [110, 90], [90, 90]]]],
  });
}
