/**
 * Battaglie finte per le pagine di prova: tra territori veri della partita in corso, con i tiri
 * che arrivano uno alla volta come dal server. Le usano battaglia.html e pesca.html.
 */
import { feedRoll, fighter, useBattle, type Role, type Roll } from '../play/battle';
import { useSession } from '../store';

export type DemoKind = 'attacco' | 'fino' | 'difesa' | 'altri' | 'perso';

export const DEMOS: { id: DemoKind; name: string }[] = [
  { id: 'attacco', name: 'Attacchi tu, un tiro' },
  { id: 'fino', name: 'Attacchi tu, fino in fondo' },
  { id: 'perso', name: 'Attacchi tu e ti respingono' },
  { id: 'difesa', name: 'Ti attaccano' },
  { id: 'altri', name: 'Due avversari tra loro' },
];

function rollDice(n: number) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)).sort((x, y) => y - x);
}

function fight(a: number, d: number): Roll {
  const attack = rollDice(Math.min(3, a - 1));
  const defense = rollDice(Math.min(3, d));
  let aLoss = 0;
  let dLoss = 0;
  for (let i = 0; i < Math.min(attack.length, defense.length); i++) {
    if (attack[i]! > defense[i]!) dLoss++;
    else aLoss++;
  }
  return { attack, defense, aLoss, dLoss, conquered: d - dLoss === 0 };
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
  const start = { attacco: [7, 3], fino: [11, 6], difesa: [6, 4], altri: [5, 3], perso: [4, 7] }[kind] as [number, number];
  let [a, d] = start;
  const rolls: Roll[] = [];
  const many = kind === 'fino' || kind === 'perso';
  do {
    const r = fight(a, d);
    rolls.push(r);
    a -= r.aLoss;
    d -= r.dLoss;
  } while (many && d > 0 && a > 1);
  if (kind === 'difesa' && d > 0 && a > 1) rolls.push(fight(a, d));
  const role: Role = kind === 'difesa' ? 'defender' : kind === 'altri' ? 'spectator' : 'attacker';
  const demo = { blitz: many };
  const base = {
    role,
    a: fighter(view, view.territories[from]!.owner, from, start[0]),
    d: fighter(view, view.territories[to]!.owner, to, start[1]),
    demo,
  };
  const step = useBattle.getState().blitzMode === 'conto' ? 380 : 1000;
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
