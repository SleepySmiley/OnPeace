/**
 * Produzione: quante unità si possono ancora arruolare, dove, e quando i rinforzi si ricaricano.
 * I rinforzi di ogni città tornano alla quota piena ogni `cycleTurns` turni (dal turno 1);
 * se le regole non li accumulano, quelli non usati si perdono alla ricarica.
 */
import {
  cityReinforcementQuota,
  controlsCapital,
  isReinforcementTurn,
  type GameState,
  type PlayerId,
} from '@onpeace/engine';
import { ctx } from './store';

/** Il primo turno dopo `turn` in cui i rinforzi si ricaricano. */
export function nextRefillTurn(turn: number): number {
  const cycle = ctx.rules.reinforcements.cycleTurns;
  if (turn < 1) return 1;
  return turn + cycle - ((turn - 1) % cycle);
}

/** I rinforzi si sono ricaricati all'inizio di questo turno. */
export const refilledThisTurn = (turn: number) => isReinforcementTurn(turn, ctx.rules);

export interface CityProduction {
  city: string;
  available: number;
  quota: number;
}

export interface CountryProduction {
  country: string;
  /** Si controlla la capitale: solo allora si arruola nelle sue città. */
  canBuy: boolean;
  available: number;
  quota: number;
  cities: CityProduction[];
}

export interface Production {
  countries: CountryProduction[];
  /** Unità ancora arruolabili in tutto (solo nei paesi di cui si ha la capitale). */
  available: number;
  quota: number;
  nextRefill: number;
  /** Perché ora non si può comprare nulla, anche con rinforzi disponibili. */
  blocked: string | null;
}

export function productionOf(state: GameState, player: PlayerId): Production {
  const byCountry = new Map<string, CountryProduction>();
  for (const city of Object.values(state.cities)) {
    if (city.owner !== player) continue;
    const def = ctx.cities.get(city.id)!;
    let c = byCountry.get(def.country);
    if (!c) {
      c = { country: def.country, canBuy: controlsCapital(state, ctx, player, def.country), available: 0, quota: 0, cities: [] };
      byCountry.set(def.country, c);
    }
    const quota = cityReinforcementQuota(state, ctx, city.id);
    c.cities.push({ city: city.id, available: city.reinforcements, quota });
    c.available += city.reinforcements;
    c.quota += quota;
  }
  const countries = [...byCountry.values()].sort(
    (a, b) => Number(b.canBuy) - Number(a.canBuy) || b.quota - a.quota,
  );
  for (const c of countries) c.cities.sort((a, b) => b.quota - a.quota);
  const buyable = countries.filter((c) => c.canBuy);
  const money = state.players.find((p) => p.id === player)?.money ?? 0;
  return {
    countries,
    available: buyable.reduce((s, c) => s + c.available, 0),
    quota: buyable.reduce((s, c) => s + c.quota, 0),
    nextRefill: nextRefillTurn(state.turn),
    blocked: ctx.rules.economy.blockPurchasesWhenNegative && money < 0 ? 'Con il saldo negativo non puoi arruolare' : null,
  };
}

/** "al turno 9 (tra 3 turni)" / "al prossimo turno". */
export function refillText(turn: number, nextRefill: number): string {
  const wait = nextRefill - turn;
  return wait <= 1 ? 'al prossimo turno' : `al turno ${nextRefill} (tra ${wait} turni)`;
}
