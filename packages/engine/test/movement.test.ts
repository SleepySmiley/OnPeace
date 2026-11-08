import { describe, expect, it } from 'vitest';
import {
  NavGrid,
  applyLoad,
  checkLoad,
  checkMove,
  checkUnload,
  createContext,
  createGame,
  createUnit,
  finishSelection,
  groupRange,
  relocate,
  selectCountry,
  stackInCity,
  type GameState,
  type MoveAction,
} from '../src';
import { loadRules, twoIslandMap } from './helpers';

const map = twoIslandMap();
const ctx = createContext(map, loadRules());
const nav = new NavGrid(map);
const none = new Set<string>();

function game(turn = 2): GameState {
  const s = createGame(ctx, {
    id: 'm',
    seed: 1,
    players: [
      { id: 'a', name: 'A', color: '#c33' },
      { id: 'b', name: 'B', color: '#33c' },
    ],
    settings: { startingFunds: 100_000 },
  });
  selectCountry(s, ctx, 'a', 'aa');
  selectCountry(s, ctx, 'b', 'bb');
  finishSelection(s, ctx);
  s.turn = turn;
  return s;
}

/** Mette una pila del giocatore con le unità indicate in un punto (o città). */
function place(s: GameState, owner: string, types: string[], pos: [number, number], city: string | null = null) {
  const stack = {
    id: `t${s.nextId++}`,
    owner,
    pos,
    city,
    units: types.map((t) => createUnit(s, ctx, t, null)),
    exposed: false,
  };
  s.stacks.push(stack);
  return stack;
}

const move = (stack: string, units: MoveAction['units'], path: [number, number][], target?: string): MoveAction => ({
  kind: 'move',
  from: { stack },
  units,
  path,
  ...(target ? { target } : {}),
});

describe('griglia di navigazione', () => {
  it('distingue terra, mare e montagne', () => {
    expect(nav.terrainAt([50, 50])).toBe('land');
    expect(nav.terrainAt([200, 100])).toBe('sea');
    expect(nav.terrainAt([100, 50])).toBe('nogo');
    expect(nav.terrainFast([300, 150])).toBe('land');
    expect(nav.terrainFast([5, 5])).toBe('sea');
  });
});

describe('movimento', () => {
  it('fanteria: entro il raggio sì, oltre no', () => {
    const s = game();
    const st = place(s, 'a', ['infantry'], [40, 140]);
    expect(checkMove(s, ctx, nav, 'a', move(st.id, [{ type: 'infantry', count: 1 }], [[95, 140]]), none).ok).toBe(true);
    const far = checkMove(s, ctx, nav, 'a', move(st.id, [{ type: 'infantry', count: 1 }], [[110, 140]]), none);
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.errors.join()).toMatch(/troppo lungo/);
  });

  it('la pila mista usa la media dei raggi', () => {
    const s = game();
    const st = place(s, 'a', ['infantry', 'tanks'], [40, 140]);
    expect(groupRange(s, ctx, 'a', st.units)).toBe(6.5);
  });

  it('truppe di terra: niente mare, niente montagne', () => {
    const s = game();
    const coast = place(s, 'a', ['tanks'], [175, 150]);
    const sea = checkMove(s, ctx, nav, 'a', move(coast.id, [{ type: 'tanks', count: 1 }], [[225, 150]]), none);
    expect(sea.ok).toBe(false);
    const hill = place(s, 'a', ['tanks'], [80, 70]);
    const blocked = checkMove(s, ctx, nav, 'a', move(hill.id, [{ type: 'tanks', count: 1 }], [[130, 70]]), none);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.errors.join()).toMatch(/montagne/);
    // aggirando la montagna da sotto si passa (percorso a tratti, lunghezza ~52 su 70)
    const around = checkMove(
      s,
      ctx,
      nav,
      'a',
      move(hill.id, [{ type: 'tanks', count: 1 }], [[88, 94], [115, 94]]),
      none,
    );
    expect(around.ok).toBe(true);
  });

  it('terra, mare e aria si muovono separatamente', () => {
    const s = game();
    const st = place(s, 'a', ['infantry', 'bomber'], [40, 140]);
    const r = checkMove(
      s,
      ctx,
      nav,
      'a',
      move(st.id, [{ type: 'infantry', count: 1 }, { type: 'bomber', count: 1 }], [[60, 140]]),
      none,
    );
    expect(r.ok).toBe(false);
  });

  it('navi: escono dal porto e restano in mare', () => {
    const s = game();
    const port = place(s, 'a', ['destroyer'], [170, 100], 'a2');
    expect(checkMove(s, ctx, nav, 'a', move(port.id, [{ type: 'destroyer', count: 1 }], [[200, 60]]), none).ok).toBe(true);
    expect(checkMove(s, ctx, nav, 'a', move(port.id, [{ type: 'destroyer', count: 1 }], [[150, 60]]), none).ok).toBe(false);
  });

  it('aerei: sorvolano le montagne ma non si fermano sopra', () => {
    const s = game();
    const st = place(s, 'a', ['bomber'], [70, 50]);
    expect(checkMove(s, ctx, nav, 'a', move(st.id, [{ type: 'bomber', count: 1 }], [[150, 50]]), none).ok).toBe(true);
    const r = checkMove(s, ctx, nav, 'a', move(st.id, [{ type: 'bomber', count: 1 }], [[100, 50]]), none);
    expect(r.ok).toBe(false);
  });

  it('una destinazione vicino a una città entra nella città; città nemica = attacco', () => {
    const s = game();
    const ship = place(s, 'a', ['destroyer'], [200, 100]);
    const r = checkMove(s, ctx, nav, 'a', move(ship.id, [{ type: 'destroyer', count: 1 }], [[226, 102]]), none);
    expect(r.ok && r.plan.endCity?.id).toBe('b1');
    expect(r.ok && r.plan.arrival).toBe('attack_city');
  });

  it('al turno 1 (pace iniziale) non si attacca nessun giocatore', () => {
    const s = game(1);
    const ship = place(s, 'a', ['destroyer'], [200, 100]);
    const r = checkMove(s, ctx, nav, 'a', move(ship.id, [{ type: 'destroyer', count: 1 }], [[230, 100]]), none);
    expect(r.ok).toBe(false);
  });

  it('le unità già mosse in questo turno non si muovono di nuovo', () => {
    const s = game();
    const st = place(s, 'a', ['infantry'], [40, 140]);
    const moved = new Set(st.units.map((u) => u.id));
    expect(checkMove(s, ctx, nav, 'a', move(st.id, [{ type: 'infantry', count: 1 }], [[60, 140]]), moved).ok).toBe(false);
  });

  it('relocate unisce le pile proprie nello stesso punto', () => {
    const s = game();
    const a = place(s, 'a', ['infantry', 'infantry'], [40, 140]);
    const b = place(s, 'a', ['tanks'], [60, 140]);
    const dest = relocate(s, 'a', a, a.units.slice(0, 1), [60, 140], null);
    expect(dest).toBe(b);
    expect(b.units.length).toBe(2);
    expect(a.units.length).toBe(1);
  });
});

describe('trasporti', () => {
  it('carico in porto, viaggio e sbarco sulla costa nemica', () => {
    const s = game();
    const harbor = stackInCity(s, 'a', 'a2')!;
    harbor.units.push(createUnit(s, ctx, 'transport', 'a2'), createUnit(s, ctx, 'infantry', 'a2'));
    const before = harbor.units.filter((u) => u.type === 'infantry').length;
    const load = checkLoad(s, ctx, 'a', { kind: 'load', from: { city: 'a2' }, units: [{ type: 'infantry', count: before }] });
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    applyLoad(load.plan);
    const transport = harbor.units.find((u) => u.type === 'transport')!;
    expect(transport.cargo.length).toBe(before);

    const sail = checkMove(s, ctx, nav, 'a', { kind: 'move', from: { city: 'a2' }, units: [{ type: 'transport', count: 1 }], path: [[205, 150]] }, none);
    expect(sail.ok).toBe(true);
    if (!sail.ok) return;
    const fleet = relocate(s, 'a', sail.plan.source, sail.plan.units, sail.plan.end, null);
    expect(fleet.units[0]!.cargo.length).toBe(before);

    const land = checkUnload(s, ctx, nav, 'a', {
      kind: 'unload',
      from: { stack: fleet.id },
      units: [{ type: 'infantry', count: before }],
      to: [222, 150],
    });
    expect(land.ok).toBe(true);
    const tooFar = checkUnload(s, ctx, nav, 'a', {
      kind: 'unload',
      from: { stack: fleet.id },
      units: [{ type: 'infantry', count: 1 }],
      to: [260, 150],
    });
    expect(tooFar.ok).toBe(false);
  });

  it('il sottomarino porta solo Incursori', () => {
    const s = game();
    const st = place(s, 'a', ['submarine', 'infantry', 'raiders'], [170, 100], 'a2');
    expect(checkLoad(s, ctx, 'a', { kind: 'load', from: { stack: st.id }, units: [{ type: 'infantry', count: 1 }] }).ok).toBe(false);
    expect(checkLoad(s, ctx, 'a', { kind: 'load', from: { stack: st.id }, units: [{ type: 'raiders', count: 1 }] }).ok).toBe(true);
  });
});
