/** Dadi della battaglia: confronto a coppie e le quattro regole dei pari, con lanci forzati. */
import { describe, expect, it } from 'vitest';
import { createRng } from '@onpeace/engine';
import { applyAction, battleRolls, defenseDice, diceAfter, fightAlternate, hitLosses, maxAttackDice, pairWins, rollBattle, rollHits, sendsArmies, tiedPairs, type TieRule } from '../src';
import { classicContext, newGame, setTerritories, skipSetup } from './helpers';

/** Dadi decisi in anticipo, nell'ordine in cui si tirano (prima tutti quelli di chi attacca). */
const scripted = (values: number[]) => ({
  int: () => {
    const v = values.shift();
    if (v === undefined) throw new Error('dadi finiti');
    return v;
  },
});

describe('dadi', () => {
  it('confronto dal più alto: il pari va a chi difende, o a chi attacca', () => {
    const roll = (ties: TieRule) => rollBattle(scripted([2, 6, 4, 1, 6, 3]), 3, 3, ties);
    expect(roll('defender')).toEqual({ attack: [6, 4, 2], defense: [6, 3, 1], rerolls: [], won: [false, true, true] });
    expect(roll('attacker').won).toEqual([true, true, true]);
  });

  it('si ritira la coppia: solo i dadi pari, finché non sono diversi', () => {
    // primo lancio 6·4·2 contro 6·3·2: pari la prima e la terza coppia
    // poi 3–3 e 5–1 (la prima è ancora pari), poi 2–4
    const b = rollBattle(scripted([6, 4, 2, 6, 3, 2, 3, 5, 3, 1, 2, 4]), 3, 3, 'reroll-pair');
    expect(b.attack).toEqual([6, 4, 2]);
    expect(b.defense).toEqual([6, 3, 2]);
    expect(b.rerolls).toEqual([
      { pairs: [0, 2], attack: [3, 5], defense: [3, 1] },
      { pairs: [0], attack: [2], defense: [4] },
    ]);
    expect(b.won).toEqual([false, true, true]);
    expect(diceAfter(b)).toEqual({ attack: [2, 4, 5], defense: [4, 3, 1] });
    expect(diceAfter(b, 1)).toEqual({ attack: [3, 4, 5], defense: [3, 3, 1] });
    expect(diceAfter(b, 0)).toEqual({ attack: [6, 4, 2], defense: [6, 3, 2] });
  });

  it('si ritira tutto il lancio, anche il dado che non si confronta', () => {
    // 3 contro 2: 5·4·1 contro 5·2 (pari), poi 6·2·2 contro 3·1
    const b = rollBattle(scripted([5, 4, 1, 5, 2, 6, 2, 2, 3, 1]), 3, 2, 'reroll-all');
    expect(b.rerolls).toEqual([{ attack: [6, 2, 2], defense: [3, 1] }]);
    expect(b.won).toEqual([true, true]);
    expect(diceAfter(b)).toEqual({ attack: [6, 2, 2], defense: [3, 1] });
  });

  it('senza pari non si ritira niente', () => {
    for (const ties of ['reroll-pair', 'reroll-all'] as const) {
      const b = rollBattle(scripted([6, 5, 4, 3]), 2, 2, ties);
      expect(b.rerolls).toEqual([]);
      expect(b.won).toEqual([true, true]);
    }
  });

  it('pari senza fine: dopo 50 lanci rifatti decide chi difende', () => {
    const always = { int: () => 3 };
    for (const ties of ['reroll-pair', 'reroll-all'] as const) {
      const b = rollBattle(always, 2, 2, ties);
      expect(b.rerolls).toHaveLength(50);
      expect(b.won).toEqual([false, false]);
    }
  });

  it('pari e battaglie salvate prima delle regole sui pari', () => {
    expect(tiedPairs([6, 4, 2], [6, 3, 2])).toEqual([0, 2]);
    expect(tiedPairs([6, 4], [6])).toEqual([0]);
    expect(pairWins({ attack: [6, 4, 2], defense: [6, 3, 1] })).toEqual([false, true, true]);
    expect(pairWins({ attack: [6, 4, 2], defense: [6, 3, 1], won: [true, true, true] })).toEqual([true, true, true]);
  });

  it('medie su tanti lanci come i conti esatti (3 contro 3)', () => {
    const rng = createRng(2026);
    const mean = (ties: TieRule, n = 20_000) => {
      let lost = 0;
      for (let i = 0; i < n; i++) lost += rollBattle(rng, 3, 3, ties).won.filter((w) => !w).length;
      return lost / n;
    };
    // perdite medie di chi attacca: 1,89 col pari a chi difende, 1,50 ritirando
    expect(mean('defender')).toBeCloseTo(1.89, 1);
    expect(mean('reroll-pair')).toBeCloseTo(1.5, 1);
    expect(mean('reroll-all')).toBeCloseTo(1.5, 1);
    expect(mean('attacker')).toBeCloseTo(1.11, 1);
  });
});

describe('battaglie con le regole dei pari', () => {
  for (const ties of ['attacker', 'reroll-pair', 'reroll-all'] as const) {
    it(`${ties}: perdite, armate ed evento coerenti`, () => {
      const ctx = classicContext((r) => ((r.dice as { tiesTo: string }).tiesTo = ties));
      let rerolled = 0;
      for (let seed = 1; seed < 120; seed++) {
        let s = skipSetup(ctx, newGame(2, 'conquest', seed, ctx));
        const [a, b] = s.order as [string, string];
        s = setTerritories(s, { italia: [a, 10], balcani: [b, 10] });
        s.phase = 'attack';
        const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 });
        const e = r.events.find((x) => x.type === 'battle');
        if (e?.type !== 'battle') throw new Error('nessuna battaglia');
        const won = e.won!;
        expect(won).toHaveLength(3);
        const dl = won.filter(Boolean).length;
        expect([e.attackerLosses, e.defenderLosses]).toEqual([3 - dl, dl]);
        expect(r.state.territories.italia!.armies).toBe(10 - (3 - dl));
        expect(r.state.territories.balcani!.armies).toBe(10 - dl);
        const final = diceAfter(e);
        if (ties === 'attacker') expect(e.rerolls).toBeUndefined();
        else {
          // alla fine nessuna coppia è pari, e decide il dado più alto
          expect(tiedPairs(final.attack, final.defense)).toEqual([]);
          won.forEach((w, i) => expect(w).toBe(final.attack[i]! > final.defense[i]!));
          if (e.rerolls) rerolled++;
          else expect(tiedPairs(e.attack, e.defense)).toEqual([]);
        }
      }
      // 3 contro 3 il pari esce spesso: su 119 battaglie qualcuna si ritira di sicuro
      if (ties !== 'attacker') expect(rerolled).toBeGreaterThan(20);
    });
  }

  it('difesa con al massimo 2 dadi', () => {
    const ctx = classicContext((r) => ((r.dice as { defenseMax: number }).defenseMax = 2));
    let s = skipSetup(ctx, newGame(2, 'conquest', 5, ctx));
    const [a, b] = s.order as [string, string];
    s = setTerritories(s, { italia: [a, 10], balcani: [b, 10] });
    s.phase = 'attack';
    const e = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 3 }).events.find((x) => x.type === 'battle');
    if (e?.type !== 'battle') throw new Error('nessuna battaglia');
    expect(e.attack).toHaveLength(3);
    expect(e.defense).toHaveLength(2);
    expect(e.attackerLosses + e.defenderLosses).toBe(2);
  });
});

describe('a colpi', () => {
  it('ogni dado dal 4 in su è un colpo', () => {
    const h = rollHits(scripted([1, 6, 4, 3, 5, 2, 2, 4]), 6, 2, { attackOn: 4, defenseOn: 4 });
    expect(h).toEqual({ attack: [6, 5, 4, 3, 2, 1], defense: [4, 2], hits: { attack: 3, defense: 1 } });
    expect(rollHits(scripted([5, 5, 5]), 2, 1, { attackOn: 6, defenseOn: 5 }).hits).toEqual({ attack: 0, defense: 1 });
  });

  it('perdite: al massimo le armate mandate; se cadono tutti, chi difende ne tiene una', () => {
    expect(hitLosses({ attack: 3, defense: 1 }, 6, 5)).toEqual({ attacker: 1, defender: 3 });
    expect(hitLosses({ attack: 7, defense: 1 }, 9, 4)).toEqual({ attacker: 1, defender: 4 });
    expect(hitLosses({ attack: 2, defense: 6 }, 3, 9)).toEqual({ attacker: 3, defender: 2 });
    expect(hitLosses({ attack: 2, defense: 2 }, 2, 2)).toEqual({ attacker: 2, defender: 1 });
  });

  it('quanti dadi: fino a 9 per parte', () => {
    const dice = classicContext((r) => ((r.dice as { combat: string }).combat = 'hits')).rules.dice;
    expect(maxAttackDice(dice)).toBe(9);
    expect(defenseDice(dice, 4)).toBe(4);
    expect(defenseDice(dice, 14)).toBe(9);
  });

  it('battaglia a colpi: dadi, perdite, conquista con chi sopravvive', () => {
    const ctx = classicContext((r) => ((r.dice as { combat: string }).combat = 'hits'));
    let conquered = 0;
    for (let seed = 1; seed < 80; seed++) {
      let s = skipSetup(ctx, newGame(2, 'conquest', seed, ctx));
      const [a, b] = s.order as [string, string];
      s = setTerritories(s, { italia: [a, 12], balcani: [b, 3] });
      s.phase = 'attack';
      expect(() => applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 10 })).toThrow(/al massimo 9/);
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 9 });
      const e = r.events.find((x) => x.type === 'battle');
      if (e?.type !== 'battle' || !e.hits) throw new Error('nessuna battaglia a colpi');
      expect(e.attack).toHaveLength(9);
      expect(e.defense).toHaveLength(3);
      expect(e.won).toEqual([]);
      expect(e.hits.attack).toBe(e.attack.filter((v) => v >= 4).length);
      expect(hitLosses(e.hits, 9, 3)).toEqual({ attacker: e.attackerLosses, defender: e.defenderLosses });
      expect(r.state.territories.italia!.armies).toBe(12 - e.attackerLosses);
      if (e.conquered) {
        conquered++;
        expect(r.state.turn!.occupation).toEqual({ from: 'italia', to: 'balcani', min: 9 - e.attackerLosses, max: 11 - e.attackerLosses });
      } else expect(r.state.territories.balcani!.armies).toBe(3 - e.defenderLosses);
    }
    // 9 dadi contro 3 armate: quasi sempre si sfonda
    expect(conquered).toBeGreaterThan(60);
  });
});

describe('a colpi, a turno', () => {
  const hitOn = { max: 9, attackOn: 4, defenseOn: 4 };
  const alternate = () => classicContext((r) => ((r.dice as { combat: string }).combat = 'alternate'));

  it('tira prima chi difende, poi si alterna con le armate rimaste, fino in fondo', () => {
    // 3 armate mandate contro 2: chi difende tira 2 dadi (5, 1: un colpo), chi attacca 2 (6, 4: due colpi)
    const b = fightAlternate(scripted([5, 1, 6, 4]), 3, 2, hitOn);
    expect(b.volleys).toEqual([
      { by: 'defense', dice: [5, 1], hits: 1 },
      { by: 'attack', dice: [6, 4], hits: 2 },
    ]);
    expect(b).toMatchObject({ attackerLosses: 1, defenderLosses: 2 });
    // chi attacca resta a zero: 2 contro 3, chi difende colpisce due volte al primo tiro
    const lost = fightAlternate(scripted([6, 6, 1]), 2, 3, hitOn);
    expect(lost.volleys).toEqual([{ by: 'defense', dice: [6, 6, 1], hits: 2 }]);
    expect(lost).toMatchObject({ attackerLosses: 2, defenderLosses: 0 });
  });

  it('i tiri a vuoto passano la mano; i colpi in più non tolgono più armate di quelle che ci sono', () => {
    const b = fightAlternate(scripted([1, 2, 3, 6, 6, 6]), 1, 1, hitOn);
    expect(b.volleys.map((v) => v.by)).toEqual(['defense', 'attack', 'defense', 'attack']);
    expect(b.volleys.at(-1)).toEqual({ by: 'attack', dice: [6], hits: 1 });
    expect(b).toMatchObject({ attackerLosses: 0, defenderLosses: 1 });
  });

  it('al massimo 9 dadi a tiro, anche con più armate', () => {
    const b = fightAlternate({ int: () => 6 }, 14, 12, hitOn);
    expect(b.volleys[0]).toEqual({ by: 'defense', dice: Array(9).fill(6), hits: 9 });
    expect(b.volleys[1]).toEqual({ by: 'attack', dice: Array(5).fill(6), hits: 5 });
    expect(b).toMatchObject({ attackerLosses: 14, defenderLosses: 5 });
  });

  it('ogni tiro ridà tempo: a turno conta ogni tiro della battaglia', () => {
    const volley = { by: 'defense' as const, dice: [6], hits: 1 };
    expect(battleRolls([{ type: 'battle' }, { type: 'occupy' }, { type: 'battle', volleys: [volley, volley, volley] }])).toBe(4);
  });

  it('nella partita: si mandano quante armate si vuole, una resta; si entra con chi sopravvive', () => {
    const ctx = alternate();
    expect(sendsArmies(ctx.rules.dice)).toBe(true);
    let conquered = 0;
    for (let seed = 1; seed < 60; seed++) {
      let s = skipSetup(ctx, newGame(2, 'conquest', seed, ctx));
      const [a, b] = s.order as [string, string];
      s = setTerritories(s, { italia: [a, 15], balcani: [b, 4] });
      s.phase = 'attack';
      expect(() => applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 15 })).toThrow(/al massimo 14 armate/);
      const r = applyAction(ctx, s, a, { kind: 'attack', from: 'italia', to: 'balcani', dice: 12 });
      const e = r.events.find((x) => x.type === 'battle');
      if (e?.type !== 'battle' || !e.volleys) throw new Error('nessuna battaglia a turno');
      expect(e).toMatchObject({ attack: [], defense: [], won: [] });
      expect(e.hits).toBeUndefined();
      // si alterna, a partire da chi difende; ognuno tira con le armate che gli restano
      let att = 12;
      let def = 4;
      e.volleys.forEach((v, i) => {
        expect(v.by).toBe(i % 2 === 0 ? 'defense' : 'attack');
        expect(v.dice).toHaveLength(Math.min(9, v.by === 'defense' ? def : att));
        expect(v.hits).toBe(v.dice.filter((x) => x >= 4).length);
        if (v.by === 'defense') att -= Math.min(v.hits, att);
        else def -= Math.min(v.hits, def);
      });
      expect({ a: 12 - att, d: 4 - def }).toEqual({ a: e.attackerLosses, d: e.defenderLosses });
      // fino in fondo: una delle due parti resta senza armate in campo
      expect(att === 0 || def === 0).toBe(true);
      expect(r.state.territories.italia!.armies).toBe(15 - e.attackerLosses);
      if (e.conquered) {
        conquered++;
        expect(def).toBe(0);
        expect(r.state.turn!.occupation).toEqual({ from: 'italia', to: 'balcani', min: att, max: 14 - e.attackerLosses });
      } else {
        expect(att).toBe(0);
        expect(r.state.territories.balcani!.armies).toBe(def);
        expect(r.state.territories.balcani!.owner).toBe(b);
      }
    }
    // 12 armate contro 4: quasi sempre si sfonda
    expect(conquered).toBeGreaterThan(50);
  });
});

