import { describe, expect, it } from 'vitest';
import { createRng, makeFighter, resolveBattle, rngDice, stackReducers } from '../src';
import { loadCatalog, loadRules, scriptedDice } from './helpers';

const catalog = loadCatalog();
const combatRules = loadRules().defaults.combat;
const noBonus = { ...combatRules, stackBonus: false };
const f = (uid: string, type: string, hp?: number) => makeFighter(catalog, uid, type, hp);

describe('combattimento', () => {
  it("esempio ufficiale: 1 Carro contro Fanteria + Milizia (ricerca 02 §4.3)", () => {
    // scambio 1: Carro tira 6, Fanteria 4 → Carro 3 HP, Fanteria 1 HP
    // scambio 2: Carro tira 3, Fanteria 5 → muoiono entrambi, 2 danni passano alla Milizia
    const dice = scriptedDice([6, 4, 3, 5]);
    const result = resolveBattle([f('t', 'tanks')], [f('i', 'infantry'), f('m', 'militia')], {
      rules: { ...noBonus, healAfterBattle: false },
      dice,
    });
    expect(result.winner).toBe('defender');
    expect(result.attackers).toEqual([]);
    expect(result.defenders.map((d) => [d.uid, d.hp])).toEqual([['m', 5]]);
    expect(result.exchanges).toHaveLength(2);
    expect(result.exchanges[0]).toMatchObject({ attacker: 't', defender: 'i', attackRoll: 6, defenceRoll: 4 });
    expect(result.exchanges[1]!.killed.sort()).toEqual(['i', 't']);
  });

  it('incassa per prima l’unità con la difesa più alta, attacca quella con l’attacco più alto', () => {
    const dice = scriptedDice([1, 1, 7, 6, 7, 6]);
    const result = resolveBattle(
      [f('mil', 'militia'), f('tank', 'tanks')],
      [f('tank2', 'tanks'), f('inf', 'infantry')],
      { rules: noBonus, dice },
    );
    expect(result.exchanges[0]).toMatchObject({ attacker: 'tank', defender: 'inf' });
  });

  it('distruzione reciproca finale: vince il difensore', () => {
    const dice = scriptedDice([7, 7]);
    const result = resolveBattle([f('a', 'infantry')], [f('d', 'infantry')], { rules: noBonus, dice });
    expect(result.winner).toBe('defender');
    expect(result.defenders.map((d) => d.uid)).toEqual(['d']);
  });

  it('i superstiti tornano a pieni HP', () => {
    const dice = scriptedDice([7, 2]);
    const result = resolveBattle([f('a', 'tanks')], [f('d', 'militia')], { rules: noBonus, dice });
    expect(result.winner).toBe('attacker');
    expect(result.attackers[0]!.hp).toBe(7);
  });

  it('bonus "contro X": la Contraerea difende con +8 contro il Bombardiere', () => {
    const dice = scriptedDice([1, 11, 1, 11]);
    const result = resolveBattle([f('b', 'bomber')], [f('aa', 'antiair')], { rules: noBonus, dice });
    // difesa massima 3 + 8 = 11: il tiro 11 è ammesso e abbatte il bombardiere al primo scambio
    expect(result.exchanges[0]!.defenceRoll).toBe(11);
    expect(result.winner).toBe('defender');
  });

  it('il critico somma il valore massimo al tiro', () => {
    const dice = scriptedDice([3, 1], [true, false]);
    const result = resolveBattle([f('t', 'tanks')], [f('m', 'militia', 7)], {
      rules: { ...noBonus, healAfterBattle: false },
      dice,
    });
    expect(result.exchanges[0]).toMatchObject({ attackRoll: 11, attackCrit: true });
    expect(result.winner).toBe('attacker');
  });

  it('danno medio del Carro senza stack bonus ≈ 4,90 (ricerca 02 §4.4)', () => {
    const dice = rngDice(createRng(7));
    let sum = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      let r = dice.roll(8, 1);
      if (dice.crit(5)) r += 8;
      sum += r;
    }
    expect(sum / n).toBeCloseTo(4.9, 1);
  });

  it('stack bonus: 10 Carri contro 10 Fanterie (ricerca 02 §4.5)', () => {
    const tanks = Array.from({ length: 10 }, (_, i) => f(`t${i}`, 'tanks'));
    const inf = Array.from({ length: 10 }, (_, i) => f(`i${i}`, 'infantry'));
    const r = stackReducers(tanks, inf, 0);
    expect(r.ratio).toBeCloseTo(90 / 70, 5);
    expect(r.attacker).toBe(1);
    expect(r.defender).toBeCloseTo(0.89, 2);
    // la media del tiro della Fanteria scende da 3,5 a circa 3,2
    const dice = rngDice(createRng(11));
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += dice.roll(6, r.defender);
    expect(sum / n).toBeCloseTo(3.16, 1);
  });

  it('le pile più grandi vincono più spesso a parità di unità', () => {
    const rng = createRng(3);
    const dice = rngDice(rng);
    let bigWins = 0;
    const trials = 400;
    for (let t = 0; t < trials; t++) {
      const big = Array.from({ length: 6 }, (_, i) => f(`a${i}`, 'infantry'));
      const small = Array.from({ length: 4 }, (_, i) => f(`d${i}`, 'infantry'));
      if (resolveBattle(big, small, { rules: combatRules, dice }).winner === 'attacker') bigWins++;
    }
    expect(bigWins / trials).toBeGreaterThan(0.6);
  });

  it('nessun attaccante in grado di colpire: vince il difensore senza scambi', () => {
    const result = resolveBattle([f('r', 'recon', 7)].map((x) => ({ ...x, attack: 0 })), [f('m', 'militia')], {
      rules: noBonus,
      dice: scriptedDice([]),
    });
    expect(result.winner).toBe('defender');
    expect(result.exchanges).toEqual([]);
  });
});
