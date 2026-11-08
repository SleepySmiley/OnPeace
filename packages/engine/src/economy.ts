/**
 * Economia (ricerca 01 §2–3): reddito delle città, bonus del paese completo,
 * mantenimento delle unità, rinforzi a cicli.
 */
import { cityDef, countryDef, type GameContext } from './context';
import { boostsFor, generalUpgradesOf, statsOf } from './forces';
import type { RulesDefaults } from './schema/rules';
import { allUnits, type GameState, type PlayerId, type UnitState } from './state';

/** Rinforzi (unità acquistabili per ciclo) di una città in base alla popolazione. */
export function reinforcementsForPopulation(population: number, defaults: RulesDefaults): number {
  const { populationTable, maxPerCity } = defaults.reinforcements;
  const row = populationTable.find((r) => population >= r.minPopulation);
  return Math.min(row?.reinforcements ?? 0, maxPerCity);
}

/**
 * Rinforzi di un ciclo per la città: popolazione + edifici (es. Centro di reclutamento)
 * + eventuale potenziamento del Generale che si trova lì.
 */
export function cityReinforcementQuota(state: GameState, ctx: GameContext, cityId: string): number {
  const city = state.cities[cityId]!;
  let quota = reinforcementsForPopulation(city.population, ctx.rules);
  for (const b of city.buildings) quota += ctx.catalog.building(b.type).effects.extraReinforcements ?? 0;
  const general = ctx.catalog.generalUnit;
  const hasGeneral = state.stacks.some(
    (s) => s.city === cityId && s.owner === city.owner && s.owner !== null && s.units.some((u) => u.type === general),
  );
  if (hasGeneral) {
    for (const up of generalUpgradesOf(state, ctx, city.owner)) quota += up.extraReinforcements;
  }
  return quota;
}

/** I rinforzi si ricaricano al turno 1 e poi ogni `cycleTurns` turni. */
export function isReinforcementTurn(turn: number, defaults: RulesDefaults): boolean {
  return turn >= 1 && (turn - 1) % defaults.reinforcements.cycleTurns === 0;
}

export function controlsCapital(state: GameState, ctx: GameContext, player: PlayerId, countryId: string): boolean {
  return state.cities[countryDef(ctx, countryId).capital]?.owner === player;
}

/** Territorio "proprio": la città è di un paese di cui il proprietario controlla la capitale. */
export function isOwnTerritory(state: GameState, ctx: GameContext, cityId: string): boolean {
  const owner = state.cities[cityId]?.owner;
  return owner != null && controlsCapital(state, ctx, owner, cityDef(ctx, cityId).country);
}

export function ownsWholeCountry(state: GameState, ctx: GameContext, player: PlayerId, countryId: string): boolean {
  const cities = ctx.citiesByCountry.get(countryId) ?? [];
  return cities.length > 0 && cities.every((c) => state.cities[c.id]?.owner === player);
}

/** Percentuale del reddito appena dopo la conquista. */
export function startingIncomePct(ownTerritory: boolean, defaults: RulesDefaults): number {
  return ownTerritory ? defaults.economy.ownedStartPct : defaults.economy.foreignStartPct;
}

/** Crescita di un turno: veloce fino al 100%, poi lenta fino al tetto; in territorio straniero fino al 50%. */
export function growIncomePct(pct: number, ownTerritory: boolean, defaults: RulesDefaults): number {
  const e = defaults.economy;
  if (!ownTerritory) return pct >= e.foreignCapPct ? pct : Math.min(e.foreignCapPct, pct + e.foreignGrowthPct);
  if (pct < e.ownedNormalPct) return Math.min(e.ownedNormalPct, pct + e.ownedGrowthPct);
  return Math.min(e.ownedCapPct, pct + e.ownedSlowGrowthPct);
}

export function effectiveIncomePct(state: GameState, ctx: GameContext, cityId: string): number {
  const pct = state.cities[cityId]!.incomePct;
  return isOwnTerritory(state, ctx, cityId) ? pct : Math.min(pct, ctx.rules.economy.foreignCapPct);
}

/** Reddito attuale di una città: nominale × percentuale × quota di popolazione rimasta. */
export function cityIncome(state: GameState, ctx: GameContext, cityId: string): number {
  const def = cityDef(ctx, cityId);
  const city = state.cities[cityId]!;
  return (def.income * effectiveIncomePct(state, ctx, cityId) * (city.population / def.population)) / 100;
}

/**
 * Mantenimento per turno di un'unità o edificio: costo (con la strategia) / divisore,
 * meno la Banca della città d'origine e i bonus di comando (`boostUpkeep`, negativo = risparmio).
 * Le unità rare non pagano mantenimento.
 */
export function unitUpkeep(state: GameState, ctx: GameContext, owner: PlayerId, unit: UnitState, boostUpkeep = 0): number {
  const isBuilding = ctx.catalog.isBuilding(unit.type);
  if (!isBuilding && ctx.catalog.unit(unit.type).rare) return 0;
  let upkeep = statsOf(state, ctx, owner, unit.type).cost / ctx.rules.economy.upkeepDivisor;
  if (unit.origin) {
    const origin = state.cities[unit.origin];
    if (origin?.owner === owner) {
      for (const b of origin.buildings) upkeep -= ctx.catalog.building(b.type).effects.upkeepReduction ?? 0;
    }
  }
  return Math.max(0, upkeep + boostUpkeep);
}

/** Chiama `visit` con il mantenimento di ogni unità e edificio del giocatore. */
export function forEachUpkeep(
  state: GameState,
  ctx: GameContext,
  player: PlayerId,
  visit: (unit: UnitState, upkeep: number) => void,
): void {
  for (const stack of state.stacks) {
    if (stack.owner !== player) continue;
    const units = allUnits(stack);
    const boost = boostsFor(state, ctx, player, units);
    for (const u of units) visit(u, unitUpkeep(state, ctx, player, u, boost(u).upkeep));
  }
  for (const city of Object.values(state.cities)) {
    if (city.owner !== player) continue;
    for (const b of city.buildings) visit(b, unitUpkeep(state, ctx, player, b));
  }
}

export interface EconomyReport {
  player: PlayerId;
  /** Reddito delle città. */
  income: number;
  /** Bonus dei paesi posseduti per intero. */
  bonus: number;
  upkeep: number;
  net: number;
}

/** Bilancio di un turno per il giocatore (non modifica lo stato). */
export function computeEconomy(state: GameState, ctx: GameContext, player: PlayerId): EconomyReport {
  let income = 0;
  const countries = new Set<string>();
  for (const city of Object.values(state.cities)) {
    if (city.owner !== player) continue;
    income += cityIncome(state, ctx, city.id);
    countries.add(cityDef(ctx, city.id).country);
  }
  let bonus = 0;
  for (const countryId of countries) {
    if (!ownsWholeCountry(state, ctx, player, countryId)) continue;
    const countryIncome = (ctx.citiesByCountry.get(countryId) ?? []).reduce(
      (s, c) => s + cityIncome(state, ctx, c.id),
      0,
    );
    bonus += (countryIncome * ctx.rules.economy.fullCountryBonusPct) / 100;
  }
  let upkeep = 0;
  forEachUpkeep(state, ctx, player, (_, value) => (upkeep += value));
  income = Math.round(income);
  bonus = Math.round(bonus);
  upkeep = Math.round(upkeep);
  return { player, income, bonus, upkeep, net: income + bonus - upkeep };
}

/**
 * Inizio turno: ricarica dei rinforzi (nei turni di ciclo), incasso del reddito
 * e pagamento del mantenimento, poi crescita del reddito e della popolazione.
 */
export function applyStartOfTurnEconomy(state: GameState, ctx: GameContext): EconomyReport[] {
  const defaults = ctx.rules;
  if (isReinforcementTurn(state.turn, defaults)) {
    for (const city of Object.values(state.cities)) {
      const quota = cityReinforcementQuota(state, ctx, city.id);
      city.reinforcements = defaults.reinforcements.accumulate ? city.reinforcements + quota : quota;
    }
  }

  const reports: EconomyReport[] = [];
  for (const player of state.players) {
    if (player.status !== 'active') continue;
    const report = computeEconomy(state, ctx, player.id);
    player.money += report.net;
    reports.push(report);
  }

  for (const city of Object.values(state.cities)) {
    if (city.owner == null) continue;
    city.incomePct = growIncomePct(city.incomePct, isOwnTerritory(state, ctx, city.id), defaults);
    const base = cityDef(ctx, city.id).population;
    if (city.population < base) {
      city.population = Math.min(base, city.population + (base * defaults.population.recoveryPctPerTurn) / 100);
    }
  }
  return reports;
}
