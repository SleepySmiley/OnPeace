/**
 * Controlla che i file in data/ siano validi: è la rete di sicurezza
 * quando regole e mappe vengono modificate a mano.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MapDef, checkMap, parseRules, reinforcementsForPopulation } from '../src';

const dataDir = fileURLToPath(new URL('../../../data', import.meta.url));
const readJson = (...parts: string[]) => JSON.parse(readFileSync(join(dataDir, ...parts), 'utf8'));

const rawRules = () => ({
  units: readJson('rules', 'units.json'),
  buildings: readJson('rules', 'buildings.json'),
  defaults: readJson('rules', 'defaults.json'),
  strategies: readJson('rules', 'strategies.json'),
  general: readJson('rules', 'general.json'),
});
const rules = parseRules(rawRules());

describe('regole', () => {
  it('unità ed edifici caricati', () => {
    expect(rules.units.length).toBeGreaterThan(10);
    expect(rules.buildings.length).toBe(6);
  });

  it('statistiche di riferimento (ricerca 02 §2)', () => {
    const byId = new Map(rules.units.map((u) => [u.id, u]));
    expect(byId.get('infantry')).toMatchObject({ attack: 4, defence: 6, hp: 7, cost: 70 });
    expect(byId.get('tanks')).toMatchObject({ attack: 8, defence: 4, hp: 7, cost: 120 });
    expect(byId.get('destroyer')).toMatchObject({ attack: 9, defence: 7, cost: 250 });
  });

  it('rinforzi dalla popolazione, con il tetto per città', () => {
    const d = rules.defaults;
    expect(reinforcementsForPopulation(0.2, d)).toBe(1);
    expect(reinforcementsForPopulation(1.0, d)).toBe(3);
    expect(reinforcementsForPopulation(2.1, d)).toBe(6);
    expect(reinforcementsForPopulation(5, d)).toBe(d.reinforcements.maxPerCity);
  });

  it('rifiuta riferimenti a unità inesistenti', () => {
    const raw = rawRules();
    raw.units.units[0].defenceBonus = [{ vs: ['unita_fantasma'], value: 1 }];
    expect(() => parseRules(raw)).toThrow(/unita_fantasma/);
  });

  it('rifiuta strategie e potenziamenti con riferimenti sbagliati', () => {
    const raw = rawRules();
    raw.strategies.strategies[0].modifiers[0].target = { units: ['carro_fantasma'] };
    raw.general.defaultUpgrades = ['potenziamento_fantasma'];
    expect(() => parseRules(raw)).toThrow(/carro_fantasma[\s\S]*potenziamento_fantasma/);
  });

  it('contenuti di M5: strategie, Generale, unità rare', () => {
    expect(rules.strategies.length).toBeGreaterThanOrEqual(8);
    expect(rules.strategies.length).toBeLessThanOrEqual(10);
    const general = rules.units.find((u) => u.id === rules.general.unit)!;
    expect(general).toMatchObject({ role: 'general', hp: 1, rare: false });
    const rares = rules.units.filter((u) => u.rare);
    expect(rares.length).toBeGreaterThanOrEqual(25);
    expect(rares.some((u) => u.oneShot && u.collateral >= 50)).toBe(true); // la testata nucleare
    expect(rares.some((u) => u.hunts.includes('general'))).toBe(true);
    expect(rares.filter((u) => u.role === 'commander').every((u) => u.aura.length > 0)).toBe(true);
  });
});

describe('mappe', () => {
  const files = readdirSync(join(dataDir, 'maps')).filter((f) => f.endsWith('.json'));
  const options = { portMaxSeaDistance: rules.defaults.movement.portMaxSeaDistance, minCityDistance: 4 };
  // sulle mappe reali città di confine e capitali vicine (Vienna e Bratislava) sono normali
  const optionsFor = (map: MapDef) => (map.id === 'prova' ? options : { ...options, minCityDistance: 1 });

  it('esiste almeno una mappa', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} è valida e coerente`, () => {
      const map = MapDef.parse(readJson('maps', file));
      expect(checkMap(map, optionsFor(map))).toEqual([]);
    });
  }

  it('checkMap trova una città fuori dal suo paese e una capitale sbagliata', () => {
    const map = MapDef.parse(readJson('maps', files[0]!));
    const [first, second] = map.countries;
    const city = map.cities.find((c) => c.country === first!.id)!;
    city.pos = [-50, -50];
    first!.capital = map.cities.find((c) => c.country === second!.id)!.id;
    const errors = checkMap(map, options);
    expect(errors.some((e) => e.includes(`${city.id}: la posizione non è dentro`))).toBe(true);
    expect(errors.some((e) => e.includes(`${first!.id}: la capitale`))).toBe(true);
  });
});
