/**
 * Risoluzione di una battaglia tra due gruppi di unità (fedele ad atWar, ricerca 02 §4).
 *
 * - Attacco e difesa sono il danno MASSIMO di un colpo: si tira da 1 al massimo.
 * - Critico: con probabilità crit% si somma al tiro il valore massimo.
 * - Colpisce per prima l'unità con l'attacco più alto; incassa per prima quella con la
 *   difesa (effettiva contro l'attaccante) più alta. Il danno in eccesso passa alla successiva.
 * - Colpi simultanei, scambio dopo scambio, finché una parte è eliminata.
 * - Distruzione reciproca finale: vince il difensore.
 * - "Stack bonus": il lato più debole tira con un dado sbilanciato verso i valori bassi.
 */
import type { Catalog } from './catalog';
import type { Rng } from './rng';
import type { RulesDefaults } from './schema/rules';

export interface Fighter {
  /** Id dell'unità nella partita. */
  uid: string;
  type: string;
  hp: number;
  maxHp: number;
  attack: number;
  defence: number;
  crit: number;
  /** Bonus di difesa contro tipi di attaccante specifici. */
  bonusVs: Readonly<Record<string, number>>;
}

/** Sorgente di casualità del combattimento, sostituibile nei test. */
export interface Dice {
  /** Tiro da 1 a max; con reducer < 1 la distribuzione favorisce i valori bassi. */
  roll(max: number, reducer: number): number;
  crit(pct: number): boolean;
}

export function rngDice(rng: Rng): Dice {
  return {
    roll(max, reducer) {
      if (max <= 0) return 0;
      if (reducer >= 1) return 1 + Math.floor(rng.next() * max);
      // geometrica troncata: P(k) ∝ reducer^(k-1), k = 1..max
      let total = 0;
      for (let k = 0; k < max; k++) total += reducer ** k;
      let r = rng.next() * total;
      for (let k = 0; k < max; k++) {
        r -= reducer ** k;
        if (r < 0) return k + 1;
      }
      return max;
    },
    crit(pct) {
      return pct > 0 && rng.next() * 100 < pct;
    },
  };
}

export interface Exchange {
  /** true se in questo scambio attacca chi in origine difendeva (attacco reciproco). */
  swapped: boolean;
  attacker: string;
  defender: string;
  attackRoll: number;
  attackCrit: boolean;
  defenceRoll: number;
  defenceCrit: boolean;
  killed: string[];
  /** HP dopo lo scambio delle unità colpite (per il replay). */
  hits: { uid: string; hp: number }[];
}

export interface BattleResult {
  winner: 'attacker' | 'defender';
  /** Superstiti, con gli HP rimasti (o pieni se healAfterBattle). */
  attackers: Fighter[];
  defenders: Fighter[];
  exchanges: Exchange[];
}

export interface BattleOptions {
  rules: RulesDefaults['combat'];
  dice: Dice;
  /** Le due parti si sono attaccate a vicenda: i ruoli si alternano a ogni scambio. */
  mutual?: boolean;
  /** Difesa extra per tutti i difensori (es. fortificazioni della città). */
  defenderExtraDefence?: number;
  /** Limite di sicurezza contro battaglie infinite (es. nessuno può fare danno). */
  maxExchanges?: number;
}

/** Crea i combattenti a partire da tipi e HP delle unità. */
export function makeFighter(catalog: Catalog, uid: string, type: string, hp?: number): Fighter {
  const s = catalog.typeStats(type);
  return {
    uid,
    type,
    hp: hp ?? s.hp,
    maxHp: s.hp,
    attack: s.attack,
    defence: s.defence,
    crit: s.crit,
    bonusVs: s.bonusVs,
  };
}

const bonusAgainst = (f: Fighter, attackerType: string) => f.bonusVs[attackerType] ?? 0;

/** Rapporto di forza e riduttori dei tiri (formula ricostruita, ricerca 02 §4.5). */
export function stackReducers(
  attackers: readonly Fighter[],
  defenders: readonly Fighter[],
  frontDefenderBonus: number,
  defenderExtra = 0,
): { ratio: number; attacker: number; defender: number } {
  const att = attackers.reduce((s, f) => s + f.attack, 0) + attackers.length;
  const def =
    defenders.reduce((s, f) => s + f.defence + defenderExtra, 0) + defenders.length + frontDefenderBonus;
  const ratio = def <= 0 ? Infinity : att / def;
  if (ratio > 1) return { ratio, attacker: 1, defender: ratio === Infinity ? 0.5 : (ratio + 1) / (2 * ratio) };
  return { ratio, attacker: (ratio + 1) / 2, defender: 1 };
}

/** Ordina per chi colpisce/incassa per primo, mantenendo l'ordine a parità (sort stabile). */
function byDesc<T>(items: T[], key: (t: T) => number): T[] {
  return [...items].sort((a, b) => key(b) - key(a));
}

/** Toglie `damage` HP a partire dal primo dell'elenco; il resto passa al successivo. */
function applyDamage(ordered: Fighter[], damage: number, hits: { uid: string; hp: number }[]): string[] {
  const killed: string[] = [];
  let left = damage;
  for (const f of ordered) {
    if (left <= 0) break;
    const taken = Math.min(f.hp, left);
    f.hp -= taken;
    left -= taken;
    hits.push({ uid: f.uid, hp: f.hp });
    if (f.hp <= 0) killed.push(f.uid);
  }
  return killed;
}

export function resolveBattle(
  attackers: readonly Fighter[],
  defenders: readonly Fighter[],
  opts: BattleOptions,
): BattleResult {
  const { rules, dice } = opts;
  const extra = opts.defenderExtraDefence ?? 0;
  const maxExchanges = opts.maxExchanges ?? 500;
  let A = attackers.map((f) => ({ ...f }));
  let D = defenders.map((f) => ({ ...f }));
  const exchanges: Exchange[] = [];

  for (let i = 0; A.length > 0 && D.length > 0 && i < maxExchanges; i++) {
    // nell'attacco reciproco i ruoli si alternano, se chi difende è in grado di attaccare
    const swapped = Boolean(opts.mutual) && i % 2 === 1 && D.some((f) => f.attack > 0);
    const hitters = swapped ? D : A;
    const targets = swapped ? A : D;
    const targetExtra = swapped ? 0 : extra;

    const hittersOrder = byDesc(hitters, (f) => f.attack);
    const front = hittersOrder[0]!;
    if (front.attack <= 0) break; // nessuno può attaccare: la battaglia finisce
    const effDef = (f: Fighter) =>
      Math.max(0, f.defence + targetExtra + (rules.defenceBonusAddsToMax ? bonusAgainst(f, front.type) : 0));
    const targetsOrder = byDesc(targets, effDef);
    const guard = targetsOrder[0]!;

    let reducerHit = 1;
    let reducerGuard = 1;
    if (rules.stackBonus) {
      const r = stackReducers(hitters, targets, bonusAgainst(guard, front.type), targetExtra);
      reducerHit = r.attacker;
      reducerGuard = r.defender;
    }

    const attackMax = front.attack;
    const defenceMax = effDef(guard);
    let attackRoll = dice.roll(attackMax, reducerHit);
    const attackCrit = attackRoll > 0 && dice.crit(front.crit);
    if (attackCrit) attackRoll += attackMax;
    let defenceRoll = dice.roll(defenceMax, reducerGuard);
    const defenceCrit = defenceRoll > 0 && dice.crit(guard.crit);
    if (defenceCrit) defenceRoll += defenceMax;

    // colpi simultanei
    const hits: { uid: string; hp: number }[] = [];
    const killedTargets = applyDamage(targetsOrder, attackRoll, hits);
    const killedHitters = applyDamage(hittersOrder, defenceRoll, hits);
    const killed = [...killedTargets, ...killedHitters];

    A = A.filter((f) => f.hp > 0);
    D = D.filter((f) => f.hp > 0);

    // distruzione reciproca finale: sopravvive l'ultimo difensore (quello originale)
    if (A.length === 0 && D.length === 0 && rules.defenderWinsMutualKill) {
      const lastDefenderUid = (swapped ? killedHitters : killedTargets).at(-1);
      const survivor = defenders.find((f) => f.uid === lastDefenderUid);
      if (survivor) {
        D = [{ ...survivor, hp: 1 }];
        killed.splice(killed.indexOf(survivor.uid), 1);
        hits.push({ uid: survivor.uid, hp: 1 });
      }
    }

    exchanges.push({
      swapped,
      attacker: front.uid,
      defender: guard.uid,
      attackRoll,
      attackCrit,
      defenceRoll,
      defenceCrit,
      killed,
      hits,
    });
  }

  const winner = A.length > 0 && D.length === 0 ? 'attacker' : 'defender';
  if (rules.healAfterBattle) {
    for (const f of [...A, ...D]) f.hp = f.maxHp;
  }
  return { winner, attackers: A, defenders: D, exchanges };
}
