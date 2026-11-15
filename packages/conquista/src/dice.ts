/**
 * Dadi della battaglia. A coppie: lancio, confronto dal più alto e, secondo le regole, che cosa
 * succede ai pari. A colpi: un dado per armata, ogni dado alto è un colpo. Funzioni pure: il caso
 * arriva da fuori.
 */
import type { ConquestRules, TieRule } from './schema';

type Dice = ConquestRules['dice'];

/** Dadi massimi di chi attacca (oltre a questo, sempre uno in meno delle armate). */
export function maxAttackDice(dice: Dice): number {
  return dice.combat === 'hits' ? dice.hits.max : dice.attackMax;
}

/** Dadi di chi difende, con tante armate. */
export function defenseDice(dice: Dice, armies: number): number {
  return Math.min(dice.combat === 'hits' ? dice.hits.max : dice.defenseMax, armies);
}

/**
 * Un lancio rifatto per un pari. Con `pairs` si ritirano solo quelle coppie, un dado per parte
 * (attack[k] e defense[k] sono la coppia pairs[k]); senza, si ritira tutto il lancio (dal più alto).
 */
export interface Reroll {
  pairs?: number[];
  attack: number[];
  defense: number[];
}

export interface BattleDice {
  /** Primo lancio, dal più alto. */
  attack: number[];
  defense: number[];
  /** Lanci rifatti per i pari, in ordine (vuoto se non ce ne sono stati). */
  rerolls: Reroll[];
  /** Per ogni coppia confrontata, se l'ha vinta chi attacca (dopo i lanci rifatti). */
  won: boolean[];
}

/** Dopo tanti lanci rifatti di fila (non capita mai: 1 su 6⁵⁰) il pari va a chi difende, così non si gira all'infinito. */
const MAX_REROLLS = 50;

/** Coppie confrontate (la più alta con la più alta…) in cui i due dadi sono uguali. */
export function tiedPairs(attack: readonly number[], defense: readonly number[]): number[] {
  const n = Math.min(attack.length, defense.length);
  return Array.from({ length: n }, (_, i) => i).filter((i) => attack[i] === defense[i]);
}

function compare(attack: readonly number[], defense: readonly number[], ties: TieRule): boolean[] {
  const n = Math.min(attack.length, defense.length);
  return Array.from({ length: n }, (_, i) => attack[i]! > defense[i]! || (attack[i] === defense[i] && ties === 'attacker'));
}

/** Tira i dadi di una battaglia e decide ogni coppia, ritirando i pari se le regole lo dicono. */
export function rollBattle(rng: { int(min: number, max: number): number }, attackDice: number, defenseDice: number, ties: TieRule): BattleDice {
  const roll = (n: number) => Array.from({ length: n }, () => rng.int(1, 6)).sort((a, b) => b - a);
  const attack = roll(attackDice);
  const defense = roll(defenseDice);
  const rerolls: Reroll[] = [];
  if (ties === 'reroll-all') {
    let cur = { attack, defense };
    while (tiedPairs(cur.attack, cur.defense).length > 0 && rerolls.length < MAX_REROLLS) {
      cur = { attack: roll(attackDice), defense: roll(defenseDice) };
      rerolls.push(cur);
    }
    return { attack, defense, rerolls, won: compare(cur.attack, cur.defense, 'defender') };
  }
  if (ties === 'reroll-pair') {
    const a = [...attack];
    const d = [...defense];
    let tied = tiedPairs(a, d);
    while (tied.length > 0 && rerolls.length < MAX_REROLLS) {
      const r: Reroll = { pairs: tied, attack: tied.map(() => rng.int(1, 6)), defense: tied.map(() => rng.int(1, 6)) };
      tied.forEach((p, k) => {
        a[p] = r.attack[k]!;
        d[p] = r.defense[k]!;
      });
      rerolls.push(r);
      tied = tied.filter((p) => a[p] === d[p]);
    }
    return { attack, defense, rerolls, won: compare(a, d, 'defender') };
  }
  return { attack, defense, rerolls, won: compare(attack, defense, ties) };
}

/** I dadi dopo i primi `steps` lanci rifatti (tutti, se non si dice): quelli che decidono, all'ultimo passo. */
export function diceAfter(
  dice: { attack: readonly number[]; defense: readonly number[]; rerolls?: readonly Reroll[] },
  steps = dice.rerolls?.length ?? 0,
): { attack: number[]; defense: number[] } {
  let attack = [...dice.attack];
  let defense = [...dice.defense];
  for (const r of (dice.rerolls ?? []).slice(0, steps)) {
    if (!r.pairs) {
      attack = [...r.attack];
      defense = [...r.defense];
      continue;
    }
    r.pairs.forEach((p, k) => {
      attack[p] = r.attack[k]!;
      defense[p] = r.defense[k]!;
    });
  }
  return { attack, defense };
}

/**
 * Chi ha vinto ogni coppia di una battaglia registrata. Le battaglie salvate prima delle regole sui
 * pari non hanno `won`: allora il pari era sempre di chi difende.
 */
export function pairWins(e: { attack: readonly number[]; defense: readonly number[]; won?: readonly boolean[] }): boolean[] {
  return e.won ? [...e.won] : compare(e.attack, e.defense, 'defender');
}

// ---------------------------------------------------------------- a colpi
export interface HitDice {
  /** Dadi di chi attacca e di chi difende, dal più alto: i colpi sono i primi. */
  attack: number[];
  defense: number[];
  /** Quanti colpi ha fatto ognuno. */
  hits: { attack: number; defense: number };
}

/** A colpi: ogni dado da `attackOn` (o `defenseOn`) in su colpisce. */
export function rollHits(
  rng: { int(min: number, max: number): number },
  attackDice: number,
  defenseDiceN: number,
  hitOn: { attackOn: number; defenseOn: number },
): HitDice {
  const roll = (n: number) => Array.from({ length: n }, () => rng.int(1, 6)).sort((a, b) => b - a);
  const attack = roll(attackDice);
  const defense = roll(defenseDiceN);
  return {
    attack,
    defense,
    hits: { attack: attack.filter((v) => v >= hitOn.attackOn).length, defense: defense.filter((v) => v >= hitOn.defenseOn).length },
  };
}

/**
 * Perdite di un tiro a colpi: ogni colpo toglie un'armata all'altro, ma chi attacca perde al massimo
 * le armate che ha mandato (i dadi tirati). Se cadono tutti da tutte e due le parti, il territorio
 * resta a chi difende con un'armata: nessuno può entrarci.
 */
export function hitLosses(hits: { attack: number; defense: number }, attackDice: number, defenderArmies: number): { attacker: number; defender: number } {
  let defender = Math.min(hits.attack, defenderArmies);
  const attacker = Math.min(hits.defense, attackDice);
  if (defender === defenderArmies && attacker === attackDice) defender--;
  return { attacker, defender };
}
