import { describe, expect, it } from 'vitest';
import {
  NavGrid,
  computeEconomy,
  createContext,
  createGame,
  financeBreakdown,
  finishSelection,
  resolveTurn,
  selectCountry,
  viewFor,
} from '../src';
import { loadRules, twoIslandMap } from './helpers';

const map = twoIslandMap();
const ctx = createContext(map, loadRules());
const nav = new NavGrid(map);

function game() {
  const s = createGame(ctx, {
    id: 'st',
    seed: 3,
    players: [
      { id: 'a', name: 'A', color: '#c33' },
      { id: 'b', name: 'B', color: '#33c' },
    ],
    settings: { startingFunds: 10_000 },
  });
  selectCountry(s, ctx, 'a', 'aa');
  selectCountry(s, ctx, 'b', 'bb');
  finishSelection(s, ctx);
  return s;
}

describe('statistiche e finanze', () => {
  it('lo storico registra un punto per ogni turno giocato', () => {
    let s = game();
    s = resolveTurn(s, ctx, nav, {}).state;
    s = resolveTurn(s, ctx, nav, {}).state;
    expect(s.history?.map((h) => h.turn)).toEqual([1, 2]);
    expect(s.history![0]!.players['a']!.cities).toBe(2);
  });

  it('durante la partita lo storico degli avversari non mostra soldi e unità', () => {
    let s = game();
    s = resolveTurn(s, ctx, nav, {}).state;
    const v = viewFor(s, ctx, 'a');
    expect(v.history![0]!.players['b']!.money).toBe(0);
    expect(v.history![0]!.players['b']!.cities).toBe(2);
    expect(v.history![0]!.players['a']!.money).toBeGreaterThan(0);
  });

  it('il dettaglio delle finanze torna con il bilancio', () => {
    const s = game();
    const f = financeBreakdown(s, ctx, 'a');
    const eco = computeEconomy(s, ctx, 'a');
    expect(f.totals).toEqual({ income: eco.income, bonus: eco.bonus, upkeep: eco.upkeep, net: eco.net });
    expect(f.countries).toHaveLength(1);
    expect(f.countries[0]).toMatchObject({ id: 'aa', own: true, full: true });
    expect(f.countries[0]!.cities.map((c) => c.id).sort()).toEqual(['a1', 'a2']);
    expect(f.upkeep.reduce((n, u) => n + u.total, 0)).toBe(eco.upkeep);
  });
});
