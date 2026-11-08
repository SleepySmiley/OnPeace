/** Statistiche per giocatore (grafici di fine partita) e dettaglio delle finanze. */
import { cityDef, type GameContext } from './context';
import { cityIncome, computeEconomy, effectiveIncomePct, forEachUpkeep, ownsWholeCountry } from './economy';
import { allUnits, type GameState, type PlayerId, type PlayerStats } from './state';

export function playerStats(state: GameState, ctx: GameContext, player: PlayerId): PlayerStats {
  const p = state.players.find((x) => x.id === player)!;
  const cities = Object.values(state.cities).filter((c) => c.owner === player).length;
  const units = state.stacks.filter((s) => s.owner === player).reduce((n, s) => n + allUnits(s).length, 0);
  const eco = computeEconomy(state, ctx, player);
  return { cities, units, money: Math.round(p.money), income: eco.income + eco.bonus, score: Math.round(p.score) };
}

/** Aggiunge allo storico le statistiche del turno corrente (sostituisce se già presenti). */
export function recordStats(state: GameState, ctx: GameContext): void {
  const players: Record<PlayerId, PlayerStats> = {};
  for (const p of state.players) players[p.id] = playerStats(state, ctx, p.id);
  const history = (state.history ??= []);
  const last = history[history.length - 1];
  if (last && last.turn === state.turn) history[history.length - 1] = { turn: state.turn, players };
  else history.push({ turn: state.turn, players });
}

export interface FinanceBreakdown {
  countries: {
    id: string;
    /** Il giocatore controlla la capitale (territorio proprio). */
    own: boolean;
    /** Possiede tutte le città: riceve il bonus. */
    full: boolean;
    income: number;
    bonus: number;
    cities: { id: string; income: number; pct: number }[];
  }[];
  upkeep: { type: string; count: number; total: number }[];
  totals: { income: number; bonus: number; upkeep: number; net: number };
}

/** Da dove vengono e dove vanno i soldi del giocatore, per il pannello Finanze. */
export function financeBreakdown(state: GameState, ctx: GameContext, player: PlayerId): FinanceBreakdown {
  const byCountry = new Map<string, FinanceBreakdown['countries'][number]>();
  for (const city of Object.values(state.cities)) {
    if (city.owner !== player) continue;
    const def = cityDef(ctx, city.id);
    let entry = byCountry.get(def.country);
    if (!entry) {
      const capital = ctx.countries.get(def.country)!.capital;
      entry = {
        id: def.country,
        own: state.cities[capital]?.owner === player,
        full: ownsWholeCountry(state, ctx, player, def.country),
        income: 0,
        bonus: 0,
        cities: [],
      };
      byCountry.set(def.country, entry);
    }
    const income = cityIncome(state, ctx, city.id);
    entry.income += income;
    entry.cities.push({ id: city.id, income: Math.round(income), pct: Math.round(effectiveIncomePct(state, ctx, city.id)) });
  }
  for (const c of byCountry.values()) {
    if (c.full) c.bonus = Math.round((c.income * ctx.rules.economy.fullCountryBonusPct) / 100);
    c.income = Math.round(c.income);
    c.cities.sort((a, b) => b.income - a.income);
  }

  const upkeep = new Map<string, { count: number; total: number }>();
  const add = (type: string, value: number) => {
    const u = upkeep.get(type) ?? { count: 0, total: 0 };
    u.count++;
    u.total += value;
    upkeep.set(type, u);
  };
  forEachUpkeep(state, ctx, player, (u, value) => add(u.type, value));

  const eco = computeEconomy(state, ctx, player);
  return {
    countries: [...byCountry.values()].sort((a, b) => b.income - a.income),
    upkeep: [...upkeep]
      .map(([type, u]) => ({ type, count: u.count, total: Math.round(u.total) }))
      .sort((a, b) => b.total - a.total),
    totals: { income: eco.income, bonus: eco.bonus, upkeep: eco.upkeep, net: eco.net },
  };
}
