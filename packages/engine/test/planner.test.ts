import { describe, expect, it } from 'vitest';
import { NavGrid, createGame, finishSelection, selectCountry, simulatePlan, stackInCity, type Action } from '../src';
import { loadContext } from './helpers';

const ctx = loadContext();
const nav = new NavGrid(ctx.map);
const country = ctx.map.countries[0]!;
const capital = ctx.cities.get(country.capital)!;

function game() {
  const s = createGame(ctx, {
    id: 'plan',
    seed: 1,
    players: [
      { id: 'a', name: 'A', color: '#c33' },
      { id: 'b', name: 'B', color: '#33c' },
    ],
  });
  selectCountry(s, ctx, 'a', country.id);
  finishSelection(s);
  s.turn = 2;
  return s;
}

describe('anteprima del piano', () => {
  it('acquisto e movimento delle unità appena comprate, senza toccare lo stato vero', () => {
    const s = game();
    const before = JSON.stringify(s);
    const money = s.players[0]!.money;
    const to: [number, number] = [capital.pos[0] + 20, capital.pos[1]];
    const actions: Action[] = [
      { kind: 'buy', order: { city: capital.id, units: [{ type: 'tanks', count: 1 }], buildings: [] } },
      { kind: 'move', from: { city: capital.id }, units: [{ type: 'tanks', count: 1 }], path: [to] },
    ];
    const preview = simulatePlan(s, ctx, nav, 'a', actions);
    expect(JSON.stringify(s)).toBe(before);
    expect(preview.steps.map((x) => x.ok)).toEqual([true, true]);
    expect(preview.state.players[0]!.money).toBe(money - 120);
    expect(preview.steps[1]!.path?.[0]).toEqual(capital.pos);
    expect(preview.state.stacks.some((st) => st.owner === 'a' && st.pos[0] === to[0] && st.pos[1] === to[1])).toBe(true);
  });

  it('segnala gli ordini non validi e prosegue con gli altri', () => {
    const s = game();
    const garrison = stackInCity(s, 'a', capital.id)!;
    const n = garrison.units.length;
    const actions: Action[] = [
      { kind: 'move', from: { city: capital.id }, units: [{ type: 'militia', count: n + 5 }], path: [[0, 0]] },
      { kind: 'buy', order: { city: capital.id, units: [{ type: 'militia', count: 1 }], buildings: [] } },
    ];
    const preview = simulatePlan(s, ctx, nav, 'a', actions);
    expect(preview.steps[0]!.ok).toBe(false);
    expect(preview.steps[0]!.errors.length).toBeGreaterThan(0);
    expect(preview.steps[1]!.ok).toBe(true);
  });

  it('una unità si muove una volta sola per turno', () => {
    const s = game();
    const p1: [number, number] = [capital.pos[0] + 10, capital.pos[1]];
    const p2: [number, number] = [capital.pos[0] + 20, capital.pos[1]];
    const garrison = stackInCity(s, 'a', capital.id)!;
    const type = garrison.units[0]!.type;
    const count = garrison.units.filter((u) => u.type === type).length;
    const preview = simulatePlan(s, ctx, nav, 'a', [
      { kind: 'move', from: { city: capital.id }, units: [{ type, count }], path: [p1] },
      { kind: 'move', from: { at: p1 }, units: [{ type, count: 1 }], path: [p2] },
    ]);
    expect(preview.steps[1]!.ok).toBe(false);
  });
});
