import { describe, expect, it } from 'vitest';
import {
  MapDef,
  NavGrid,
  createContext,
  createGame,
  createUnit,
  finishSelection,
  relationKey,
  resolveTurn,
  selectCountry,
  stackInCity,
  type Action,
  type GameState,
  type StackState,
  type TurnEvent,
} from '../src';
import { loadRules } from './helpers';

/**
 * Striscia di terra 400×200 (1 punto raggio = 10 unità), mare tutto attorno:
 *   A x 20–140 | C (neutrale) x 140–260 | B x 260–380
 */
const map = MapDef.parse({
  id: 'turni',
  name: 'Turni',
  width: 400,
  height: 200,
  rangeScale: 10,
  countries: [
    { id: 'aa', name: 'A', capital: 'a1', shape: [[[[20, 20], [140, 20], [140, 180], [20, 180]]]] },
    { id: 'cc', name: 'C', capital: 'c1', shape: [[[[140, 20], [260, 20], [260, 180], [140, 180]]]] },
    { id: 'bb', name: 'B', capital: 'b1', shape: [[[[260, 20], [380, 20], [380, 180], [260, 180]]]] },
  ],
  cities: [
    { id: 'a1', name: 'A1', country: 'aa', pos: [50, 100], population: 2, income: 300, port: false },
    { id: 'a2', name: 'A2', country: 'aa', pos: [100, 30], population: 1, income: 150, port: true },
    { id: 'c1', name: 'C1', country: 'cc', pos: [200, 100], population: 2, income: 300, port: false },
    { id: 'c2', name: 'C2', country: 'cc', pos: [200, 30], population: 1, income: 250, port: true },
    { id: 'b1', name: 'B1', country: 'bb', pos: [350, 100], population: 2, income: 300, port: false },
    { id: 'b2', name: 'B2', country: 'bb', pos: [300, 160], population: 1, income: 150, port: true },
  ],
});
const ctx = createContext(map, loadRules());
const nav = new NavGrid(map);

function game(turn = 2, id = 'g'): GameState {
  const s = createGame(ctx, {
    id,
    seed: 42,
    players: [
      { id: 'a', name: 'A', color: '#c33' },
      { id: 'b', name: 'B', color: '#33c' },
    ],
    settings: { startingFunds: 100_000 },
  });
  selectCountry(s, ctx, 'a', 'aa');
  selectCountry(s, ctx, 'b', 'bb');
  finishSelection(s);
  s.turn = turn;
  return s;
}

function place(s: GameState, owner: string, types: string[], pos: [number, number]): StackState {
  const stack: StackState = {
    id: `t${++s.nextId}`,
    owner,
    pos,
    city: null,
    units: types.map((t) => createUnit(s, ctx, t, null)),
    exposed: false,
  };
  s.stacks.push(stack);
  return stack;
}

const n = (type: string, count: number) => Array.from({ length: count }, () => type);
const of = <K extends TurnEvent['kind']>(events: TurnEvent[], kind: K) =>
  events.filter((e): e is Extract<TurnEvent, { kind: K }> => e.kind === kind);
const run = (s: GameState, actions: Record<string, Action[]>) => resolveTurn(s, ctx, nav, actions);

describe('risoluzione del turno', () => {
  it('è deterministica e non modifica lo stato di partenza', () => {
    const s = game();
    const st = place(s, 'a', n('tanks', 10), [140, 100]);
    const actions: Record<string, Action[]> = {
      a: [{ kind: 'move', from: { stack: st.id }, units: [{ type: 'tanks', count: 10 }], path: [[200, 100]] }],
    };
    const before = JSON.stringify(s);
    const r1 = run(s, actions);
    const r2 = run(s, actions);
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(r1.state.turn).toBe(3);
  });

  it('le unità comprate si muovono nello stesso turno', () => {
    const s = game();
    const { state, events } = run(s, {
      a: [
        { kind: 'buy', order: { city: 'a1', units: [{ type: 'tanks', count: 2 }], buildings: [] } },
        { kind: 'move', from: { city: 'a1' }, units: [{ type: 'tanks', count: 2 }], path: [[100, 100]] },
      ],
    });
    expect(of(events, 'action_failed')).toEqual([]);
    const moved = state.stacks.find((st) => st.owner === 'a' && st.pos[0] === 100 && st.pos[1] === 100);
    expect(moved?.units.map((u) => u.type)).toEqual(['tanks', 'tanks']);
  });

  it('conquista di una capitale neutrale: Milizie gratuite e reddito al 50%', () => {
    const s = game();
    const st = place(s, 'a', n('tanks', 14), [140, 100]);
    const { state, events } = run(s, {
      a: [{ kind: 'move', from: { stack: st.id }, units: [{ type: 'tanks', count: 14 }], path: [[200, 100]] }],
    });
    const battle = of(events, 'battle')[0]!;
    expect(battle.winner).toBe('attacker');
    const capture = of(events, 'capture')[0]!;
    expect(capture).toMatchObject({ player: 'a', city: 'c1', from: null });
    expect(capture.freeMilitia).toBeGreaterThan(0);
    expect(state.cities['c1']!.owner).toBe('a');
    // reddito: incassato al 50% a inizio turno, poi cresciuto al 75%
    expect(state.cities['c1']!.incomePct).toBe(75);
    const garrison = stackInCity(state, 'a', 'c1')!;
    expect(garrison.units.filter((u) => u.type === 'militia').length).toBe(capture.freeMilitia);
  });

  it('gli aerei vincono ma non conquistano: restano fuori dalla città', () => {
    const s = game();
    const st = place(s, 'a', n('bomber', 15), [100, 100]);
    const { state, events } = run(s, {
      a: [{ kind: 'move', from: { stack: st.id }, units: [{ type: 'bomber', count: 15 }], path: [[200, 30]] }],
    });
    expect(of(events, 'battle')[0]!.winner).toBe('attacker');
    expect(of(events, 'capture')).toEqual([]);
    expect(state.cities['c2']!.owner).toBeNull();
    const bombers = state.stacks.find((x) => x.owner === 'a' && x.units.some((u) => u.type === 'bomber'))!;
    expect(bombers.city).toBeNull();
    expect(Math.hypot(bombers.pos[0] - 200, bombers.pos[1] - 30)).toBeGreaterThan(15);
  });

  it('turno 1: pace iniziale, gli attacchi tra giocatori falliscono', () => {
    const s = game(1);
    const st = place(s, 'a', n('tanks', 3), [250, 100]);
    const { events } = run(s, {
      a: [{ kind: 'move', from: { stack: st.id }, units: [{ type: 'tanks', count: 3 }], path: [[300, 160]] }],
    });
    expect(of(events, 'action_failed')[0]!.reason).toMatch(/guerra/);
  });

  it('intercettazione: una pila di 3 unità o meno resta sempre bloccata', () => {
    for (const id of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6']) {
      const s = game(2, id);
      const att = place(s, 'a', n('tanks', 5), [250, 60]);
      const def = place(s, 'b', n('infantry', 2), [300, 60]);
      const { events } = run(s, {
        a: [{ kind: 'move', from: { stack: att.id }, units: [{ type: 'tanks', count: 5 }], path: [[300, 60]], target: def.id }],
        b: [{ kind: 'move', from: { stack: def.id }, units: [{ type: 'infantry', count: 2 }], path: [[305, 100]] }],
      });
      expect(of(events, 'battle')).toHaveLength(1);
      for (const ev of of(events, 'intercept')) expect(ev.blocked).toBe(true);
    }
  });

  it('intercettazione: una pila grande può scappare (e senza raggio non c’è battaglia)', () => {
    let blocked = 0;
    let escaped = 0;
    for (let i = 0; i < 60; i++) {
      const s = game(2, `fuga${i}`);
      const att = place(s, 'a', n('tanks', 1), [250, 60]);
      const def = place(s, 'b', n('infantry', 10), [300, 60]);
      const { events } = run(s, {
        a: [{ kind: 'move', from: { stack: att.id }, units: [{ type: 'tanks', count: 1 }], path: [[300, 60]], target: def.id }],
        b: [{ kind: 'move', from: { stack: def.id }, units: [{ type: 'infantry', count: 10 }], path: [[320, 110]] }],
      });
      const intercept = of(events, 'intercept')[0];
      if (!intercept) continue; // la fanteria si è mossa per prima
      if (intercept.blocked) {
        blocked++;
        expect(of(events, 'battle')).toHaveLength(1);
      } else {
        escaped++;
        expect(of(events, 'battle')).toHaveLength(0);
      }
    }
    expect(blocked).toBeGreaterThan(0);
    expect(escaped).toBeGreaterThan(blocked);
  });

  it('attacco reciproco: una sola battaglia a ruoli alternati', () => {
    const s = game();
    const sa = place(s, 'a', n('tanks', 3), [250, 60]);
    const sb = place(s, 'b', n('infantry', 3), [300, 60]);
    const { events } = run(s, {
      a: [{ kind: 'move', from: { stack: sa.id }, units: [{ type: 'tanks', count: 3 }], path: [[300, 60]], target: sb.id }],
      b: [{ kind: 'move', from: { stack: sb.id }, units: [{ type: 'infantry', count: 3 }], path: [[250, 60]], target: sa.id }],
    });
    const battles = of(events, 'battle');
    expect(battles).toHaveLength(1);
    expect(battles[0]!.mutual).toBe(true);
  });

  it('linea difensiva: due pile vicine fermano il nemico', () => {
    const s = game();
    place(s, 'b', n('infantry', 1), [300, 40]);
    place(s, 'b', n('infantry', 1), [300, 58]);
    const tank = place(s, 'a', n('tanks', 1), [270, 50]);
    const { state, events } = run(s, {
      a: [{ kind: 'move', from: { stack: tank.id }, units: [{ type: 'tanks', count: 1 }], path: [[330, 50]] }],
    });
    const mv = of(events, 'move')[0]!;
    expect(mv.stoppedByWall).toBe(true);
    const after = state.stacks.find((x) => x.owner === 'a' && x.units.some((u) => u.type === 'tanks') && !x.city)!;
    expect(after.pos[0]).toBeLessThan(300);
  });

  it('diplomazia: proposta di pace, accettazione, dichiarazione di guerra con preavviso', () => {
    let s = game();
    let r = run(s, { a: [{ kind: 'diplomacy', to: 'b', proposal: 'peace' }] });
    s = r.state;
    const proposal = s.proposals[0]!;
    expect(proposal).toMatchObject({ from: 'a', to: 'b', kind: 'peace' });

    r = run(s, { b: [{ kind: 'respond', proposal: proposal.id, accept: true }] });
    s = r.state;
    expect(s.relations[relationKey('a', 'b')]!.relation).toBe('peace');

    r = run(s, { a: [{ kind: 'diplomacy', to: 'b', proposal: 'war' }] });
    s = r.state;
    // dichiarata al turno 4, attiva dal turno 5 (che è il turno appena iniziato)
    expect(s.relations[relationKey('a', 'b')]!.relation).toBe('war');
    expect(of(r.events, 'war_started')).toHaveLength(1);
  });

  it('alleati: invio di denaro consentito, ai nemici no; alleati rimasti soli vincono insieme', () => {
    const s = game();
    s.relations[relationKey('a', 'b')] = { relation: 'alliance' };
    const money = s.players[1]!.money;
    const { state, events } = run(s, { a: [{ kind: 'send_money', to: 'b', amount: 500 }] });
    expect(of(events, 'money')[0]).toMatchObject({ from: 'a', to: 'b', amount: 500 });
    expect(state.players[1]!.money).toBe(money + 500);
    // restano solo due giocatori alleati: vincono insieme
    expect(state.phase).toBe('ended');
    expect(state.winners).toEqual(['a', 'b']);

    const enemies = game();
    const r = run(enemies, { a: [{ kind: 'send_money', to: 'b', amount: 500 }] });
    expect(of(r.events, 'action_failed')[0]!.reason).toMatch(/alleati/);
  });

  it('chi perde tutte le città è eliminato e la partita finisce', () => {
    const s = game();
    // B tiene solo B2, senza difese
    s.cities['b1']!.owner = 'a';
    s.stacks = s.stacks.filter((x) => !(x.owner === 'b' && (x.city === 'b1' || x.city === 'b2')));
    const st = place(s, 'a', n('tanks', 2), [300, 110]);
    const { state, events } = run(s, {
      a: [{ kind: 'move', from: { stack: st.id }, units: [{ type: 'tanks', count: 2 }], path: [[300, 160]] }],
    });
    expect(of(events, 'capture')[0]).toMatchObject({ city: 'b2', from: 'b' });
    expect(of(events, 'eliminated')[0]).toMatchObject({ player: 'b' });
    expect(state.phase).toBe('ended');
    expect(state.winners).toEqual(['a']);
  });
});
