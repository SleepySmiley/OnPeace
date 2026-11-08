/**
 * Partite simulate con azioni casuali sulla mappa di prova: il motore non deve mai
 * lanciare eccezioni inattese né produrre stati incoerenti.
 */
import { describe, expect, it } from 'vitest';
import {
  NavGrid,
  allUnits,
  createGame,
  createRng,
  distance,
  finishSelection,
  resolveTurn,
  selectCountry,
  type Action,
  type GameState,
} from '../src';
import { loadContext } from './helpers';

const ctx = loadContext();
const nav = new NavGrid(ctx.map);

function checkInvariants(s: GameState): void {
  const ids = new Set<string>();
  for (const stack of s.stacks) {
    expect(stack.units.length).toBeGreaterThan(0);
    for (const u of allUnits(stack)) {
      expect(ids.has(u.id)).toBe(false);
      ids.add(u.id);
      expect(u.hp).toBeGreaterThan(0);
    }
    if (stack.city) expect(stack.pos).toEqual(ctx.cities.get(stack.city)!.pos);
  }
  for (const city of Object.values(s.cities)) {
    for (const b of city.buildings) {
      expect(ids.has(b.id)).toBe(false);
      ids.add(b.id);
    }
    if (city.owner) expect(s.players.some((p) => p.id === city.owner)).toBe(true);
    expect(Number.isFinite(city.population) && city.population > 0).toBe(true);
  }
  for (const p of s.players) expect(Number.isFinite(p.money)).toBe(true);
}

function randomActions(s: GameState, player: string, rng: ReturnType<typeof createRng>): Action[] {
  const actions: Action[] = [];
  const unitTypes = ['infantry', 'tanks', 'militia', 'bomber'];
  for (const city of Object.values(s.cities)) {
    if (city.owner !== player || city.reinforcements === 0 || rng.next() < 0.5) continue;
    actions.push({
      kind: 'buy',
      order: { city: city.id, units: [{ type: rng.pick(unitTypes), count: rng.int(1, city.reinforcements) }], buildings: [] },
    });
  }
  for (const stack of s.stacks) {
    if (stack.owner !== player || rng.next() < 0.3) continue;
    const types = [...new Set(stack.units.map((u) => u.type))];
    const type = rng.pick(types);
    const def = ctx.catalog.unit(type);
    const count = rng.int(1, stack.units.filter((u) => u.type === type).length);
    const reach = def.move * ctx.map.rangeScale;
    const enemyStacks = s.stacks.filter((x) => x.owner !== player && distance(x.pos, stack.pos) <= reach);
    const foreign = ctx.map.cities
      .filter((c) => s.cities[c.id]!.owner !== player)
      .sort((x, y) => distance(x.pos, stack.pos) - distance(y.pos, stack.pos));
    const nearest = foreign[0];
    if (enemyStacks.length > 0 && rng.next() < 0.3) {
      const t = rng.pick(enemyStacks);
      actions.push({ kind: 'move', from: { stack: stack.id }, units: [{ type, count }], path: [t.pos], target: t.id });
    } else if (nearest && rng.next() < 0.7) {
      // marcia verso la città non propria più vicina (attacco se a portata)
      const d = distance(nearest.pos, stack.pos);
      const k = d <= reach ? 1 : (reach * 0.95) / d;
      const to: [number, number] = [
        stack.pos[0] + (nearest.pos[0] - stack.pos[0]) * k,
        stack.pos[1] + (nearest.pos[1] - stack.pos[1]) * k,
      ];
      actions.push({ kind: 'move', from: { stack: stack.id }, units: [{ type, count }], path: [to] });
    } else {
      const a = rng.next() * Math.PI * 2;
      const r = reach * rng.next();
      actions.push({
        kind: 'move',
        from: { stack: stack.id },
        units: [{ type, count }],
        path: [[stack.pos[0] + Math.cos(a) * r, stack.pos[1] + Math.sin(a) * r]],
      });
    }
  }
  if (rng.next() < 0.1) {
    const other = rng.pick(s.players.filter((p) => p.id !== player && p.status === 'active'));
    if (other) actions.push({ kind: 'diplomacy', to: other.id, proposal: rng.pick(['peace', 'alliance', 'war'] as const) });
  }
  for (const p of s.proposals) if (p.to === player) actions.push({ kind: 'respond', proposal: p.id, accept: rng.next() < 0.5 });
  return actions;
}

describe('partite simulate', () => {
  for (const seed of [1, 2, 3]) {
    it(`seme ${seed}: 20 turni senza errori né incoerenze`, () => {
      const rng = createRng(seed);
      let s = createGame(ctx, {
        id: `fuzz${seed}`,
        seed,
        players: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id, color: '#888' })),
        settings: { startingFunds: 5000 },
      });
      const free = [...ctx.map.countries];
      for (const p of s.players) {
        const pick = free.splice(rng.int(0, free.length - 1), 1)[0]!;
        selectCountry(s, ctx, p.id, pick.id);
      }
      finishSelection(s);
      checkInvariants(s);
      for (let t = 0; t < 20 && s.phase === 'playing'; t++) {
        const actions: Record<string, Action[]> = {};
        for (const p of s.players) if (p.status === 'active') actions[p.id] = randomActions(s, p.id, rng);
        s = resolveTurn(s, ctx, nav, actions).state;
        checkInvariants(s);
      }
    }, 30_000);
  }
});
