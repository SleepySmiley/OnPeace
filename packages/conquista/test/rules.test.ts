import { describe, expect, it } from 'vitest';
import { BoardDef, RuleError } from '@onpeace/engine';
import {
  applyAction,
  buildDeck,
  createContext,
  describeObjective,
  eventsFor,
  objectiveMet,
  ownedBy,
  reinforcementsFor,
  setValue,
  timeout,
  viewFor,
  type Card,
  type GameState,
} from '../src';
import { data, newGame, setTerritories, skipSetup, worldContext } from './helpers';

const ctx = worldContext();

/** Stesso stato, ma al primo turno dopo i giri in cui nessuno può essere eliminato. */
function afterProtection(state: GameState): GameState {
  const s = structuredClone(state);
  s.turn!.number = ctx.rules.elimination.protectedRounds * s.order.length + 1;
  return s;
}

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

  it('seme da 128 bit: quattro numeri casuali veri, o un numero solo allargato (test e prove)', () => {
    const s = newGame(3, 'objectives', [1, 2, 3, 4]);
    expect(s.seed).toHaveLength(4);
    expect(newGame(3, 'objectives', 7)).toEqual(newGame(3, 'objectives', 7));
    expect(newGame(3, 'objectives', 7).seed).not.toEqual(newGame(3, 'objectives', 8).seed);
  });

  it('il tabellone deve avere almeno un territorio per giocatore', () => {
    const big = BoardDef.parse(data('territori/mondo.json'));
    const ids = new Set(big.territories.filter((t) => t.continent === 'oceania').map((t) => t.id));
    const small = {
      ...big,
      continents: big.continents.filter((c) => c.id === 'oceania'),
      territories: big.territories.filter((t) => ids.has(t.id)),
      links: big.links.filter((l) => ids.has(l.a) && ids.has(l.b)),
    };
    const objectives = { board: 'mondo', objectives: [{ id: 't3', kind: 'territories', count: 3, text: 'x' }] };
    expect(() => createContext(small, data('conquista/regole.json'), objectives)).toThrow(/solo 4 territori/);
  });

  it('con gli obiettivi segreti servono almeno 3 giocatori (in 2 si vincerebbe senza combattere)', () => {
    expect(() => newGame(2, 'objectives')).toThrow(/almeno 3/);
    expect(() => newGame(2, 'conquest')).not.toThrow();
  });
});

describe('preparazione a giri', () => {
  it('in ordine di gioco, 3 armate per volta, solo sui propri territori', () => {
    let s = newGame(3, 'objectives', 7);
    const [a, b, c] = s.order as [string, string, string];
    expect(s.setupPlayer).toBe(a);
    const mineA = ownedBy(s, a)[0]!;
    expect(() => applyAction(ctx, s, b, { kind: 'setup-place', placements: { [ownedBy(s, b)[0]!]: 3 } })).toThrow(/Non tocca a te/);
    expect(() => applyAction(ctx, s, a, { kind: 'setup-place', placements: { [mineA]: 2 } })).toThrow(/esattamente 3/);
    expect(() => applyAction(ctx, s, a, { kind: 'setup-place', placements: { [ownedBy(s, b)[0]!]: 3 } })).toThrow(/non è un tuo territorio/);
    const before = s.players.find((p) => p.id === a)!.setupLeft;
    const r = applyAction(ctx, s, a, { kind: 'setup-place', placements: { [mineA]: 2, [ownedBy(s, a)[1]!]: 1 } });
    s = r.state;
    expect(s.players.find((p) => p.id === a)!.setupLeft).toBe(before - 3);
    expect(r.events[0]).toMatchObject({ type: 'setup-place', player: a, left: before - 3 });
    expect(s.setupPlayer).toBe(b);
    // il tempo scaduto piazza solo il giro di chi tocca
    s = timeout(ctx, s).state;
    expect(s.setupPlayer).toBe(c);
    expect(s.phase).toBe('setup');
  });

  it('si va avanti a giri finché le armate finiscono, poi comincia il primo turno', () => {
    let s = newGame(4, 'conquest', 3);
    let steps = 0;
    while (s.phase === 'setup') {
      s = timeout(ctx, s).state;
      steps++;
    }
    const per = ctx.rules.initialArmies['4']!;
    const total = Object.values(s.territories).reduce((n, t) => n + t.armies, 0);
    // 4 giocatori, armate iniziali meno i territori già coperti, 3 alla volta
    expect(steps).toBe(s.players.reduce((n, p) => n + Math.ceil((per - ownedBy(s, p.id).length) / 3), 0));
    expect(total).toBe(per * 4);
    expect(s.phase).toBe('reinforce');
    expect(s.turn!.player).toBe(s.order[0]);
    expect(s.setupPlayer).toBeNull();
  });
});

describe('preparazione tutti insieme (variante)', () => {
  const quick = worldContext((r) => {
    (r.setup as { placement: string }).placement = 'simultaneous';
  });
  it('ognuno piazza tutto in una volta, senza turni e alla cieca', () => {
    let s = newGame(2, 'conquest', 7, quick);
    const [a, b] = s.order as [string, string];
    expect(s.setupPlayer).toBeNull();
    const leftB = s.players.find((p) => p.id === b)!.setupLeft;
    const where = ownedBy(s, b)[0]!;
    const placed = applyAction(quick, s, b, { kind: 'setup-place', placements: { [where]: leftB } });
    s = placed.state;
    expect(s.phase).toBe('setup');
    // a non vede dove ha piazzato b, né sul tabellone né negli eventi; b sì
    expect(viewFor(quick, s, a).territories[where]!.armies).toBe(1);
    expect(eventsFor(placed.events, a)[0]).toMatchObject({ type: 'setup-place', placements: {} });
    expect(viewFor(quick, s, b).players.find((p) => p.id === b)!.pending).toEqual({ [where]: leftB });
    expect(viewFor(quick, s, a).players.find((p) => p.id === b)!.pending).toBeNull();
    // quando hanno confermato tutti si scopre tutto insieme
    const r = timeout(quick, s);
    expect(r.state.phase).toBe('reinforce');
    expect(r.state.turn!.player).toBe(a);
    expect(r.state.territories[where]!.armies).toBe(1 + leftB);
    const reveal = eventsFor(r.events, a).find((e) => e.type === 'setup-reveal');
    expect(reveal).toMatchObject({ placements: { [b]: { [where]: leftB } } });
    for (const p of r.state.players) {
      const armies = ownedBy(r.state, p.id).reduce((n, t) => n + r.state.territories[t]!.armies, 0);
      expect(armies).toBe(quick.rules.initialArmies['2']);
      expect(p.pending).toBeUndefined();
    }
  });
});

describe('rinforzi', () => {
  it('un\'armata ogni 3 territori, almeno 3, più i bonus dei continenti', () => {
    let s = skipSetup(ctx, newGame(2, 'conquest'));
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
    const s = skipSetup(ctx, newGame(2, 'conquest'));
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

  it('nessun limite di carte in mano: il tris non è mai obbligatorio', () => {
    const s = skipSetup(ctx, newGame(2, 'conquest'));
    const me = s.turn!.player;
    s.players.find((x) => x.id === me)!.cards = s.deck.splice(0, 12);
    const r = applyAction(ctx, s, me, { kind: 'reinforce', placements: { [ownedBy(s, me)[0]!]: 3 } });
    expect(r.state.phase).toBe('attack');
    // nemmeno a tempo scaduto si giocano tris al posto del giocatore
    const t = timeout(ctx, s);
    expect(t.events.some((e) => e.type === 'set')).toBe(false);
    expect(t.state.players.find((x) => x.id === me)!.cards).toHaveLength(12);
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
      expect(e.attack).toEqual([...e.attack].sort((x, y) => y - x));
      expect(e.defense).toEqual([...e.defense].sort((x, y) => y - x));
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
      let s = afterProtection(skipSetup(ctx, newGame(2, 'conquest', seed)));
      const [a, b] = s.order as [string, string];
      s = worldTo(s, a, { italia: [a, 9], balcani: [b, 1] });
      s.phase = 'attack';
      s.players.find((p) => p.id === b)!.cards = s.deck.splice(0, 2);
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      if (!r.state.turn!.occupation) continue;
      expect(r.events.some((e) => e.type === 'eliminated' && e.player === b && e.cardsTaken === 2)).toBe(true);
      expect(r.state.players.find((p) => p.id === a)!.cards).toHaveLength(2);
      expect(r.state.players.find((p) => p.id === b)!.cards).toHaveLength(0);
      const o = applyAction(ctx, r.state, a, { kind: 'occupy', armies: 3 });
      expect(o.state.winner).toBe(a);
      expect(o.events.at(-1)).toMatchObject({ type: 'victory', reason: 'conquest' });
      expect(o.state.phase).toBe('over');
      expect(() => applyAction(ctx, o.state, a, { kind: 'end-turn' })).toThrow(/finita/);
      return;
    }
    throw new Error('nessuna conquista');
  });
});

describe('regola Prestige: nessuna eliminazione nei primi giri', () => {
  it("fino alla fine del 4° giro non si attacca l'ultimo territorio di un giocatore", () => {
    let s = skipSetup(ctx, newGame(3, 'conquest', 8));
    const [a, b, c] = s.order as [string, string, string];
    s = worldTo(s, c, { italia: [a, 9], balcani: [b, 1], francia: [b, 1] });
    s.phase = 'attack';
    const last = setTerritories(s, { francia: [c, 2] });
    const n = ctx.rules.elimination.protectedRounds * s.order.length;
    // b ha due territori: si attacca normalmente
    expect(() => applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 })).not.toThrow();
    // b ha un solo territorio: protetto fino all'ultimo turno del 4° giro compreso
    last.turn!.number = n;
    expect(() => applyAction(ctx, last, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 })).toThrow(/4° giro/);
    last.turn!.number = n + 1;
    expect(() => applyAction(ctx, last, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 })).not.toThrow();
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

  it('vince subito anche chi completa l’obiettivo con lo spostamento di fine turno', () => {
    let s = skipSetup(ctx, newGame(3, 'objectives', 5));
    const me = s.turn!.player;
    const other = s.order.find((p) => p !== me)!;
    s.players.find((p) => p.id === me)!.objective = { id: 'territori_20_presidiati' };
    const mine = ctx.board.territories.map((t) => t.id).filter((t) => t !== 'italia' && t !== 'francia').slice(0, 18);
    const changes: Record<string, [string, number]> = {};
    for (const t of ctx.board.territories) changes[t.id] = [other, 1];
    for (const t of mine) changes[t] = [me, 2];
    changes.italia = [me, 1];
    changes.francia = [me, 5];
    s = setTerritories(s, changes);
    s.phase = 'attack';
    expect(objectiveMet(ctx, s, me)).toBe(false);
    const r = applyAction(ctx, s, me, { kind: 'fortify', from: 'francia', to: 'italia', armies: 1 });
    expect(r.state.winner).toBe(me);
    expect(r.events.at(-1)).toMatchObject({ type: 'victory', player: me, reason: 'objective' });
  });

  it('il nome del bersaglio entra nel testo così com’è, anche con simboli come $&', () => {
    const s = newGame(3, 'objectives', 5);
    s.players[1]!.name = '$&$`';
    expect(describeObjective(ctx, s, { id: 'elimina', target: s.players[1]!.id })).toMatch(/^Elimina \$&\$`\./);
  });

  it('elimina: se il bersaglio lo elimina un altro si passa alla riserva', () => {
    for (let seed = 1; seed < 400; seed++) {
      let s = afterProtection(skipSetup(ctx, newGame(3, 'objectives', seed)));
      const [a, b, c] = s.order as [string, string, string];
      s.players.find((p) => p.id === c)!.objective = { id: 'elimina', target: b };
      s.players.find((p) => p.id === a)!.objective = { id: 'territori_26' };
      s = worldTo(s, c, { italia: [a, 9], balcani: [b, 1], francia: [a, 1] });
      s.phase = 'attack';
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      if (!r.state.turn!.occupation) continue;
      expect(r.state.players.find((p) => p.id === c)!.objective).toEqual({ id: 'territori_26' });
      expect(r.events.some((e) => e.type === 'objective-changed' && e.player === c)).toBe(true);
      // il cambio di obiettivo lo vede solo c: agli altri rivelerebbe che doveva eliminare b
      expect(eventsFor(r.events, c).some((e) => e.type === 'objective-changed')).toBe(true);
      expect(eventsFor(r.events, a).some((e) => e.type === 'objective-changed')).toBe(false);
      return;
    }
    throw new Error('nessuna conquista');
  });
});

describe('spostamento e fine turno', () => {
  it('uno spostamento tra territori confinanti, poi il turno passa', () => {
    let s = skipSetup(ctx, newGame(2, 'conquest'));
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
    // a metà occupazione: entrano le armate minime, poi il turno passa
    let occupied = false;
    for (let seed = 1; seed < 400 && !occupied; seed++) {
      let d = skipSetup(ctx, newGame(3, 'conquest', seed));
      const [p0, p1] = d.order as [string, string];
      d = setTerritories(d, { italia: [p0, 8], balcani: [p1, 1], anatolia: [p1, 1] });
      d.phase = 'attack';
      const a = applyAction(ctx, d, p0, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
      if (!a.state.turn!.occupation) continue;
      const t = timeout(ctx, a.state);
      expect(t.state.territories.balcani!.armies).toBe(3);
      expect(t.state.turn!.player).not.toBe(p0);
      occupied = true;
    }
    expect(occupied).toBe(true);
    // nella fase dello spostamento: il turno passa
    const f = structuredClone(s);
    f.phase = 'fortify';
    expect(timeout(ctx, f).state.turn!.player).not.toBe(first);
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
