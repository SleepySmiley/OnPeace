import { describe, expect, it } from 'vitest';
import { RuleError } from '@onpeace/engine';
import {
  applyAction,
  buildDeck,
  objectiveMet,
  ownedBy,
  reinforcementsFor,
  setValue,
  timeout,
  viewFor,
  type Card,
  type GameState,
} from '../src';
import { cardTotal, newGame, setTerritories, skipSetup, worldContext } from './helpers';

const ctx = worldContext();

/** Tutto il mondo a un giocatore tranne i territori indicati. */
function worldTo(state: GameState, owner: string, except: Record<string, [string, number]> = {}): GameState {
  const all: Record<string, [string, number]> = {};
  for (const t of ctx.board.territories) all[t.id] = [owner, 2];
  return setTerritories(state, { ...all, ...except });
}

describe('nuova partita', () => {
  it('distribuisce i territori a giro con un\'armata e calcola le armate iniziali', () => {
    const s = newGame(4);
    const counts = s.order.map((p) => ownedBy(s, p).length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(47);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(Object.values(s.territories).every((t) => t.armies === 1)).toBe(true);
    for (const p of s.players) expect(p.setupLeft + ownedBy(s, p.id).length).toBe(ctx.rules.initialArmies['4']);
    expect(s.phase).toBe('setup');
  });

  it('dà a ognuno un obiettivo diverso e mai quello di eliminare sé stesso', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = newGame(6, 'objectives', seed);
      const keys = s.players.map((p) => `${p.objective!.id}:${p.objective!.target ?? ''}`);
      expect(new Set(keys).size).toBe(6);
      for (const p of s.players) expect(p.objective!.target).not.toBe(p.id);
    }
  });

  it('in modalità conquista non ci sono obiettivi', () => {
    expect(newGame(3, 'conquest').players.every((p) => p.objective === null)).toBe(true);
  });

  it('il mazzo ha una carta per territorio più i jolly', () => {
    const deck = buildDeck(ctx);
    expect(deck).toHaveLength(47 + ctx.rules.cards.jokers);
    expect(newGame().deck).toHaveLength(deck.length);
  });

  it('rifiuta un numero di giocatori fuori dalle regole', () => {
    expect(() => newGame(1)).toThrow(RuleError);
  });
});

describe('preparazione', () => {
  it('accetta solo il totale esatto sui propri territori, poi comincia il primo turno', () => {
    let s = newGame(2, 'objectives', 7);
    const [a, b] = s.order as [string, string];
    const mineA = ownedBy(s, a);
    const left = s.players.find((p) => p.id === a)!.setupLeft;
    expect(() => applyAction(ctx, s, a, { kind: 'setup-place', placements: { [mineA[0]!]: left - 1 } })).toThrow(/esattamente/);
    expect(() => applyAction(ctx, s, a, { kind: 'setup-place', placements: { [ownedBy(s, b)[0]!]: left } })).toThrow(/non è tuo/);
    s = applyAction(ctx, s, a, { kind: 'setup-place', placements: { [mineA[0]!]: left } }).state;
    expect(s.phase).toBe('setup');
    const r = timeout(ctx, s);
    expect(r.state.phase).toBe('reinforce');
    expect(r.state.turn!.player).toBe(s.order[0]);
    expect(r.events.some((e) => e.type === 'turn')).toBe(true);
  });
});

describe('rinforzi', () => {
  it('un\'armata ogni 3 territori, almeno 3, più i bonus dei continenti', () => {
    let s = skipSetup(ctx, newGame(2));
    const [a, b] = s.order as [string, string];
    // a tiene l'Oceania (4 territori, bonus 2) e nient'altro
    const changes: Record<string, [string, number]> = {};
    for (const t of ctx.board.territories) changes[t.id] = [t.continent === 'oceania' ? a : b, 1];
    s = setTerritories(s, changes);
    expect(reinforcementsFor(ctx, s, a)).toBe(3 + 2);
    expect(reinforcementsFor(ctx, s, b)).toBe(Math.floor(43 / 3) + 5 + 2 + 5 + 3 + 7);
  });

  it('i rinforzi vanno piazzati tutti e poi si passa agli attacchi', () => {
    const s = skipSetup(ctx, newGame(3));
    const me = s.turn!.player;
    const t = ownedBy(s, me)[0]!;
    expect(() => applyAction(ctx, s, me, { kind: 'reinforce', placements: { [t]: 2 } })).toThrow(RuleError);
    const r = applyAction(ctx, s, me, { kind: 'reinforce', placements: { [t]: 3 } });
    expect(r.state.phase).toBe('attack');
    expect(r.state.territories[t]!.armies).toBe(s.territories[t]!.armies + 3);
  });

  it('non è il tuo turno: nessuna azione', () => {
    const s = skipSetup(ctx, newGame(3));
    const other = s.order[1]!;
    expect(() => applyAction(ctx, s, other, { kind: 'end-turn' })).toThrow(/Non è il tuo turno/);
  });
});

describe('carte', () => {
  const card = (symbol: Card['symbol'], territory: string | null = null): Card => ({ id: `${symbol}-${Math.random()}`, territory, symbol });
  it('valore dei tris secondo le regole', () => {
    const v = (...s: Card['symbol'][]) => setValue(ctx.rules, s.map((x) => card(x)));
    expect(v('artillery', 'artillery', 'artillery')).toBe(4);
    expect(v('infantry', 'infantry', 'infantry')).toBe(6);
    expect(v('cavalry', 'cavalry', 'cavalry')).toBe(8);
    expect(v('infantry', 'cavalry', 'artillery')).toBe(10);
    expect(v('joker', 'cavalry', 'cavalry')).toBe(12);
    expect(v('joker', 'cavalry', 'infantry')).toBeNull();
    expect(v('infantry', 'infantry', 'cavalry')).toBeNull();
  });

  it('un tris aggiunge armate, più il bonus per i territori posseduti', () => {
    const s = skipSetup(ctx, newGame(2));
    const me = s.turn!.player;
    const mine = ownedBy(s, me)[0]!;
    const hand: Card[] = [
      { id: 'x1', territory: mine, symbol: 'infantry' },
      { id: 'x2', territory: null, symbol: 'infantry' },
      { id: 'x3', territory: null, symbol: 'infantry' },
    ];
    s.players.find((p) => p.id === me)!.cards = hand;
    const r = applyAction(ctx, s, me, { kind: 'play-set', cards: ['x1', 'x2', 'x3'] });
    expect(r.state.turn!.reinforcements).toBe(3 + 6 + 2);
    expect(r.state.players.find((p) => p.id === me)!.cards).toHaveLength(0);
    expect(r.state.discard).toHaveLength(3);
  });

  it('con troppe carte bisogna giocare un tris prima di piazzare', () => {
    const s = skipSetup(ctx, newGame(2));
    const me = s.turn!.player;
    const p = s.players.find((x) => x.id === me)!;
    p.cards = s.deck.splice(0, ctx.rules.cards.maxHand + 1);
    expect(() => applyAction(ctx, s, me, { kind: 'reinforce', placements: { [ownedBy(s, me)[0]!]: 3 } })).toThrow(/tris/);
    // allo scadere del tempo i tris obbligatori si giocano da soli
    const r = timeout(ctx, s);
    expect(r.events.some((e) => e.type === 'set')).toBe(true);
    expect(cardTotal(r.state)).toBe(cardTotal(s));
  });
});

describe('attacchi', () => {
  /** a attacca da Italia ai Balcani; armate a scelta. */
  function duel(att: number, def: number, seed = 99) {
    let s = skipSetup(ctx, newGame(2, 'conquest', seed));
    const [a, b] = s.order as [string, string];
    s = setTerritories(s, { italia: [a, att], balcani: [b, def] });
    s.phase = 'attack';
    return { s, a, b };
  }

  it('dadi ordinati, pareggi al difensore, perdite coerenti', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { s, a } = duel(10, 10, seed);
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      const e = r.events.find((x) => x.type === 'battle')!;
      if (e.type !== 'battle') throw new Error();
      expect(e.attack).toHaveLength(3);
      expect(e.defense).toHaveLength(3);
      let al = 0;
      let dl = 0;
      for (let i = 0; i < 3; i++) {
        if (e.attack[i]! > e.defense[i]!) dl++;
        else al++;
      }
      expect([e.attackerLosses, e.defenderLosses]).toEqual([al, dl]);
      expect(r.state.territories.italia!.armies).toBe(10 - al);
      expect(r.state.territories.balcani!.armies).toBe(10 - dl);
    }
  });

  it('servono più armate dei dadi e un territorio confinante nemico', () => {
    const { s, a } = duel(3, 2);
    expect(() => applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 })).toThrow(/almeno/);
    expect(() => applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'siberia', dice: 1 })).toThrow(RuleError);
  });

  it('dopo una conquista si occupa con almeno tanti armate quanti dadi', () => {
    for (let seed = 1; seed < 400; seed++) {
      const { s, a } = duel(8, 1, seed);
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      if (r.state.territories.balcani!.owner !== a) continue;
      const occ = r.state.turn!.occupation!;
      expect(occ).toMatchObject({ from: 'italia', to: 'balcani', min: 3, max: 7 });
      expect(() => applyAction(ctx, r.state, a, { kind: 'end-turn' })).toThrow(/occupare|armate spostare/);
      expect(() => applyAction(ctx, r.state, a, { kind: 'occupy', armies: 2 })).toThrow(RuleError);
      const o = applyAction(ctx, r.state, a, { kind: 'occupy', armies: 5 });
      expect(o.state.territories.balcani!.armies).toBe(5);
      expect(o.state.territories.italia!.armies).toBe(3);
      expect(o.state.turn!.conquered).toBe(true);
      return;
    }
    throw new Error('nessuna conquista in 400 tentativi');
  });

  it('chi conquista pesca una carta a fine turno', () => {
    for (let seed = 1; seed < 400; seed++) {
      const { s, a } = duel(8, 1, seed);
      let r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      if (!r.state.turn!.occupation) continue;
      r = applyAction(ctx, r.state, a, { kind: 'occupy', armies: 3 });
      const before = r.state.players.find((p) => p.id === a)!.cards.length;
      r = applyAction(ctx, r.state, a, { kind: 'end-turn' });
      expect(r.state.players.find((p) => p.id === a)!.cards.length).toBe(before + 1);
      expect(r.state.turn!.player).not.toBe(a);
      return;
    }
    throw new Error('nessuna conquista');
  });

  it('eliminare un giocatore ne prende le carte; in conquista vince chi resta solo', () => {
    for (let seed = 1; seed < 400; seed++) {
      let s = skipSetup(ctx, newGame(2, 'conquest', seed));
      const [a, b] = s.order as [string, string];
      s = worldTo(s, a, { italia: [a, 9], balcani: [b, 1] });
      s.phase = 'attack';
      s.players.find((p) => p.id === b)!.cards = s.deck.splice(0, 2);
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      if (!r.state.turn!.occupation) continue;
      expect(r.events.some((e) => e.type === 'eliminated' && e.player === b && e.cardsTaken === 2)).toBe(true);
      const o = applyAction(ctx, r.state, a, { kind: 'occupy', armies: 3 });
      expect(o.state.winner).toBe(a);
      expect(o.state.phase).toBe('over');
      expect(() => applyAction(ctx, o.state, a, { kind: 'end-turn' })).toThrow(/finita/);
      return;
    }
    throw new Error('nessuna conquista');
  });
});

describe('obiettivi', () => {
  it('continenti: vince subito chi completa il suo obiettivo nel proprio turno', () => {
    let s = skipSetup(ctx, newGame(3, 'objectives', 5));
    const me = s.turn!.player;
    const others = s.order.filter((p) => p !== me);
    s.players.find((p) => p.id === me)!.objective = { id: 'europa_africa' };
    const changes: Record<string, [string, number]> = {};
    for (const t of ctx.board.territories) changes[t.id] = [others[0]!, 1];
    for (const t of ctx.board.territories) if (t.continent === 'europa' || t.continent === 'africa') changes[t.id] = [me, 2];
    s = setTerritories(s, changes);
    expect(objectiveMet(ctx, s, me)).toBe(true);
    const r = applyAction(ctx, s, me, { kind: 'reinforce', placements: { italia: s.turn!.reinforcements } });
    expect(r.state.winner).toBe(me);
    expect(r.events.at(-1)).toMatchObject({ type: 'victory', reason: 'objective' });
  });

  it('elimina: se il bersaglio lo elimina un altro si passa alla riserva', () => {
    for (let seed = 1; seed < 400; seed++) {
      let s = skipSetup(ctx, newGame(3, 'objectives', seed));
      const [a, b, c] = s.order as [string, string, string];
      s.players.find((p) => p.id === c)!.objective = { id: 'elimina', target: b };
      s.players.find((p) => p.id === a)!.objective = { id: 'territori_26' };
      s = worldTo(s, c, { italia: [a, 9], balcani: [b, 1], francia: [a, 1] });
      s.phase = 'attack';
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      if (!r.state.turn!.occupation) continue;
      expect(r.state.players.find((p) => p.id === c)!.objective).toEqual({ id: 'territori_26' });
      expect(r.events.some((e) => e.type === 'objective-changed' && e.player === c)).toBe(true);
      return;
    }
    throw new Error('nessuna conquista');
  });
});

describe('spostamento e fine turno', () => {
  it('uno spostamento tra territori confinanti, poi il turno passa', () => {
    let s = skipSetup(ctx, newGame(2));
    const [a, b] = s.order as [string, string];
    s = setTerritories(s, { italia: [a, 6], francia: [a, 1], iberia: [a, 1], balcani: [b, 1] });
    s.phase = 'attack';
    expect(() => applyAction(ctx, s, a, { kind: 'fortify', from: 'italia', to: 'iberia', armies: 2 })).toThrow(/confinante/);
    expect(() => applyAction(ctx, s, a, { kind: 'fortify', from: 'italia', to: 'francia', armies: 6 })).toThrow(/Almeno/);
    const r = applyAction(ctx, s, a, { kind: 'fortify', from: 'italia', to: 'francia', armies: 5 });
    expect(r.state.territories.francia!.armies).toBe(6);
    expect(r.state.turn!.player).toBe(b);
    expect(r.state.phase).toBe('reinforce');
  });

  it('a tempo scaduto il turno si chiude da solo in ogni fase', () => {
    const s = skipSetup(ctx, newGame(3));
    const first = s.turn!.player;
    const r = timeout(ctx, s);
    expect(r.state.turn!.player).not.toBe(first);
    const placed = Object.values(r.state.territories).reduce((n, t) => n + t.armies, 0);
    expect(placed).toBe(Object.values(s.territories).reduce((n, t) => n + t.armies, 0) + 3);
  });
});

describe('vista', () => {
  it('carte e obiettivi altrui restano coperti fino alla fine', () => {
    const s = skipSetup(ctx, newGame(3));
    const [a, b] = s.order as [string, string];
    s.players.find((p) => p.id === b)!.cards = s.deck.splice(0, 2);
    const v = viewFor(ctx, s, a);
    const vb = v.players.find((p) => p.id === b)!;
    expect(vb.cards).toBeNull();
    expect(vb.cardCount).toBe(2);
    expect(vb.objective).toBeNull();
    expect(v.players.find((p) => p.id === a)!.objective).toMatch(/\S/);
    expect('deck' in v).toBe(false);
    expect('seed' in v).toBe(false);
  });
});
