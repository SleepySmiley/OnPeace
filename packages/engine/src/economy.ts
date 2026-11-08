import type { RulesDefaults } from './schema/rules';

/** Rinforzi (unità acquistabili per ciclo) di una città in base alla popolazione. */
export function reinforcementsForPopulation(population: number, defaults: RulesDefaults): number {
  const { populationTable, maxPerCity } = defaults.reinforcements;
  const row = populationTable.find((r) => population >= r.minPopulation);
  return Math.min(row?.reinforcements ?? 0, maxPerCity);
}
