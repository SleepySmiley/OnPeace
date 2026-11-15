/**
 * Battaglie finte per le pagine di prova: tra territori veri della partita in corso, con i tiri
 * che arrivano uno alla volta come dal server. Le usano battaglia.html e pesca.html.
 */
import { defenseDice, hitLosses, maxAttackDice, rollBattle, rollHits, type ConquestRules } from '@onpeace/conquista';
import { BLITZ_STEP, feedRoll, fighter, useBattle, type Role, type Roll } from '../play/battle';
import { useSession } from '../store';

export type DemoKind = 'attacco' | 'pari' | 'fino' | 'difesa' | 'altri' | 'perso';

export const DEMOS: { id: DemoKind; name: string }[] = [
  { id: 'attacco', name: 'Attacchi tu, un tiro' },
  { id: 'pari', name: 'Attacchi tu, un tiro con un pari' },
  { id: 'fino', name: 'Attacchi tu, fino in fondo' },
  { id: 'perso', name: 'Attacchi tu e ti respingono' },
  { id: 'difesa', name: 'Ti attaccano' },
  { id: 'altri', name: 'Due avversari tra loro' },
];

const random = { int: (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1)) };

/**
 * Un tiro con le regole della partita di prova (pari, dadi della difesa, a coppie o a colpi).
 * `tie`: il primo lancio ha di sicuro un pari, per vedere che cosa succede.
 */
function fight(dice: ConquestRules['dice'], a: number, d: number, tie = false): Roll {
  const nA = Math.min(maxAttackDice(dice), a - 1);
  const nD = defenseDice(dice, d);
  if (dice.combat === 'hits') {
    const h = rollHits(random, nA, nD, dice.hits);
    const lost = hitLosses(h.hits, nA, d);
    return { attack: h.attack, defense: h.defense, won: [], hits: h.hits, aLoss: lost.attacker, dLoss: lost.defender, conquered: d - lost.defender === 0 };
  }
  let b = rollBattle(random, nA, nD, dice.tiesTo);
  for (let i = 0; tie && i < 200 && b.attack.every((v, k) => k >= b.defense.length || v !== b.defense[k]); i++) {
    b = rollBattle(random, nA, nD, dice.tiesTo);
  }
  const dLoss = b.won.filter(Boolean).length;
  return {
    attack: b.attack,
    defense: b.defense,
    ...(b.rerolls.length > 0 ? { rerolls: b.rerolls } : {}),
    won: b.won,
    aLoss: b.won.length - dLoss,
    dLoss,
    conquered: d - dLoss === 0,
  };
}

/** Una battaglia finta tra territori veri della partita: i tiri arrivano uno alla volta, come dal server. */
export function startDemo(kind: DemoKind): boolean {
  const s = useSession.getState();
  const view = s.view;
  const board = s.board;
  const me = s.online.me;
  if (!view || !board || !me) return false;
  // una coppia di territori confinanti con i padroni giusti per il tipo di prova
  const wantA = (o: string) => (kind === 'difesa' || kind === 'altri' ? o !== me : o === me);
  const wantD = (o: string, a: string) => (kind === 'difesa' ? o === me : kind === 'altri' ? o !== me && o !== a : o !== me);
  const ids = Object.keys(view.territories).sort(() => Math.random() - 0.5);
  let pair: [string, string] | null = null;
  for (const from of ids) {
    const fo = view.territories[from]!.owner;
    if (!wantA(fo)) continue;
    const to = (board.geo.neighbours.get(from) ?? []).find((n) => wantD(view.territories[n]!.owner, fo));
    if (to) {
      pair = [from, to];
      break;
    }
  }
  if (!pair) return false;
  const [from, to] = pair;
  const dice = s.online.lobby?.rules.dice;
  if (!dice) return false;
  const start = { attacco: [7, 3], pari: [9, 6], fino: [11, 6], difesa: [6, 4], altri: [5, 3], perso: [4, 7] }[kind] as [number, number];
  let [a, d] = start;
  const rolls: Roll[] = [];
  const many = kind === 'fino' || kind === 'perso';
  do {
    const r = fight(dice, a, d, kind === 'pari');
    rolls.push(r);
    a -= r.aLoss;
    d -= r.dLoss;
  } while (many && d > 0 && a > 1);
  if (kind === 'difesa' && d > 0 && a > 1) rolls.push(fight(dice, a, d));
  const role: Role = kind === 'difesa' ? 'defender' : kind === 'altri' ? 'spectator' : 'attacker';
  const demo = { blitz: many };
  const base = {
    role,
    a: fighter(view, view.territories[from]!.owner, from, start[0]),
    d: fighter(view, view.territories[to]!.owner, to, start[1]),
    demo,
  };
  // lo stesso passo dell'attacco continuo vero
  const step = BLITZ_STEP[useBattle.getState().blitzMode];
  let left = start[0];
  rolls.forEach((r, i) => {
    setTimeout(
      () => {
        left -= r.aLoss;
        if (i === rolls.length - 1) demo.blitz = false;
        feedRoll(base, r, left);
      },
      i === 0 ? 0 : 60 + i * step,
    );
  });
  return true;
}
