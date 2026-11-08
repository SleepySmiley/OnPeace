import { describe, expect, it } from 'vitest';
import {
  createContext,
  createGame,
  createUnit,
  eventsFor,
  finishSelection,
  selectCountry,
  viewFor,
  type GameState,
  type StackState,
  type TurnEvent,
} from '../src';
import { loadRules, twoIslandMap } from './helpers';

// mappa 400×200, scala 10: città e fanteria vedono 160 unità
const map = twoIslandMap();
const ctx = createContext(map, loadRules());

function game(): GameState {
  const s = createGame(ctx, {
    id: 'v',
    seed: 99,
    players: [
      { id: 'a', name: 'A', color: '#c33' },
      { id: 'b', name: 'B', color: '#33c' },
    ],
    settings: { startingFunds: 10_000 },
  });
  selectCountry(s, ctx, 'a', 'aa');
  selectCountry(s, ctx, 'b', 'bb');
  finishSelection(s);
  return s;
}

function place(s: GameState, owner: string, types: string[], pos: [number, number], exposed = false): StackState {
  const st: StackState = {
    id: `v${++s.nextId}`,
    owner,
    pos,
    city: null,
    units: types.map((t) => createUnit(s, ctx, t, null)),
    exposed,
  };
  s.stacks.push(st);
  return st;
}

describe('nebbia di guerra', () => {
  it('pile proprie complete, nemiche in vista complete, lontane solo come posizione', () => {
    const s = game();
    const near = place(s, 'b', ['tanks', 'tanks'], [240, 60]);
    const far = place(s, 'b', ['tanks'], [370, 170]);
    const v = viewFor(s, ctx, 'a');
    expect(v.stacks.filter((x) => x.owner === 'a').every((x) => x.units.length > 0 && !x.fog)).toBe(true);
    expect(v.stacks.find((x) => x.id === near.id)!.units).toHaveLength(2);
    const fogged = v.stacks.find((x) => x.id === far.id)!;
    expect(fogged.fog).toBe(true);
    expect(fogged.units).toEqual([]);
  });

  it('pile invisibili: nascoste salvo rilevamento ravvicinato o dopo una battaglia', () => {
    const s = game();
    const hidden = place(s, 'b', ['raiders'], [370, 170]);
    const close = place(s, 'b', ['raiders'], [175, 160]);
    const fought = place(s, 'b', ['raiders'], [370, 30], true);
    const v = viewFor(s, ctx, 'a');
    expect(v.stacks.some((x) => x.id === hidden.id)).toBe(false);
    expect(v.stacks.some((x) => x.id === close.id)).toBe(true);
    expect(v.stacks.some((x) => x.id === fought.id)).toBe(true);
  });

  it('nasconde il seme, i fondi altrui e i rinforzi nemici', () => {
    const s = game();
    const v = viewFor(s, ctx, 'a');
    expect(v.seed).toBe(0);
    expect(v.players.find((p) => p.id === 'a')!.money).toBe(s.players[0]!.money);
    expect(v.players.find((p) => p.id === 'b')!.money).toBe(0);
    expect(v.cities['b1']!.reinforcements).toBe(0);
    expect(v.cities['a1']!.reinforcements).toBe(s.cities['a1']!.reinforcements);
  });

  it('gli alleati condividono la vista', () => {
    const s = game();
    s.relations['a|b'] = { relation: 'alliance' };
    const far = place(s, 'b', ['tanks'], [370, 170]);
    const v = viewFor(s, ctx, 'a');
    expect(v.stacks.find((x) => x.id === far.id)!.fog).toBeUndefined();
    expect(v.players.find((p) => p.id === 'b')!.money).toBe(s.players[1]!.money);
  });

  it('eventi: bilancio solo proprio, battaglie altrui solo se in vista', () => {
    const s = game();
    const events: TurnEvent[] = [
      { kind: 'economy', player: 'a', income: 1, bonus: 0, upkeep: 0, net: 1 },
      { kind: 'economy', player: 'b', income: 1, bonus: 0, upkeep: 0, net: 1 },
      {
        kind: 'battle',
        id: 'b1',
        at: [370, 170],
        city: null,
        attacker: 'b',
        defender: null,
        attackers: [],
        defenders: [],
        winner: 'attacker',
        mutual: false,
        exchanges: [],
      },
      { kind: 'capture', player: 'b', city: 'b2', from: null, freeMilitia: 0, rare: null },
    ];
    const seen = eventsFor(events, s, ctx, 'a').map((e) => e.kind);
    expect(seen).toEqual(['economy', 'capture']);
  });
});
