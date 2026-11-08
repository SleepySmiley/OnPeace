import { describe, expect, it } from 'vitest';
import {
  NavGrid,
  createContext,
  createGame,
  finishSelection,
  selectCountry,
  simulatePlan,
  stackInCity,
  type Action,
} from '../src';
import { loadRules, twoIslandMap } from './helpers';

const map = twoIslandMap();
const ctx = createContext(map, loadRules());
const nav = new NavGrid(map);

function game() {
  const s = createGame(ctx, {
    id: 'plan',
    seed: 1,
    players: [
      { id: 'a', name: 'A', color: '#c33' },
      { id: 'b', name: 'B', color: '#33c' },
    ],
    settings: { startingFunds: 100_000 },
  });
  selectCountry(s, ctx, 'a', 'aa');
  selectCountry(s, ctx, 'b', 'bb');
  finishSelection(s);
  s.turn = 2;
  return s;
}

describe('anteprima del piano', () => {
  it('acquisto e movimento delle unità appena comprate, senza toccare lo stato vero', () => {
    const s = game();
    const before = JSON.stringify(s);
    const money = s.players[0]!.money;
    const to: [number, number] = [100, 140];
    const actions: Action[] = [
      { kind: 'buy', order: { city: 'a1', units: [{ type: 'tanks', count: 1 }], buildings: [] } },
      { kind: 'move', from: { city: 'a1' }, units: [{ type: 'tanks', count: 1 }], path: [to] },
    ];
    const preview = simulatePlan(s, ctx, nav, 'a', actions);
    expect(JSON.stringify(s)).toBe(before);
    expect(preview.steps.map((x) => x.ok)).toEqual([true, true]);
    expect(preview.state.players[0]!.money).toBe(money - 120);
    expect(preview.steps[1]!.path).toEqual([[50, 100], to]);
    expect(preview.state.stacks.some((st) => st.owner === 'a' && st.pos[0] === 100 && st.pos[1] === 140)).toBe(true);
  });

  it('un attacco resta fermo nell’anteprima ma ha la freccia', () => {
    const s = game();
    const actions: Action[] = [
      { kind: 'buy', order: { city: 'a2', units: [{ type: 'destroyer', count: 1 }], buildings: [] } },
      { kind: 'move', from: { city: 'a2' }, units: [{ type: 'destroyer', count: 1 }], path: [[230, 100]] },
    ];
    const preview = simulatePlan(s, ctx, nav, 'a', actions);
    expect(preview.steps[1]).toMatchObject({ ok: true, arrival: 'attack_city' });
    const ship = stackInCity(preview.state, 'a', 'a2')!;
    expect(ship.units.some((u) => u.type === 'destroyer')).toBe(true);
  });

  it('segnala gli ordini non validi e prosegue con gli altri', () => {
    const s = game();
    const n = stackInCity(s, 'a', 'a1')!.units.length;
    const actions: Action[] = [
      { kind: 'move', from: { city: 'a1' }, units: [{ type: 'militia', count: n + 5 }], path: [[60, 120]] },
      { kind: 'buy', order: { city: 'a1', units: [{ type: 'militia', count: 1 }], buildings: [] } },
    ];
    const preview = simulatePlan(s, ctx, nav, 'a', actions);
    expect(preview.steps[0]!.ok).toBe(false);
    expect(preview.steps[0]!.errors.length).toBeGreaterThan(0);
    expect(preview.steps[1]!.ok).toBe(true);
  });

  it('una unità si muove una volta sola per turno', () => {
    const s = game();
    const preview = simulatePlan(s, ctx, nav, 'a', [
      { kind: 'buy', order: { city: 'a1', units: [{ type: 'tanks', count: 1 }], buildings: [] } },
      { kind: 'move', from: { city: 'a1' }, units: [{ type: 'tanks', count: 1 }], path: [[80, 140]] },
      { kind: 'move', from: { at: [80, 140] }, units: [{ type: 'tanks', count: 1 }], path: [[110, 150]] },
    ]);
    expect(preview.steps.map((x) => x.ok)).toEqual([true, true, false]);
  });
});
