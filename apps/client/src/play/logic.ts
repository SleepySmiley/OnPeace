/**
 * Che cosa può fare adesso chi guarda la partita: la mossa che gli tocca, dove può attaccare o
 * spostare, quante armate deve piazzare. Le stesse regole del motore, viste dal giocatore: il
 * server comunque ricontrolla tutto.
 */
import { maxAttackDice, type ConquestRules, type GameView, type PlayerView } from '@onpeace/conquista';

export type MyMove =
  /** Inizio partita: leggere il proprio obiettivo e dire che si è pronti. */
  | { kind: 'briefing' }
  /** Obiettivo letto: si aspetta che lo leggano gli altri. */
  | { kind: 'wait-briefing' }
  /** Scelta a turno: tocca a me prendere un territorio libero. */
  | { kind: 'pick' }
  /** Piazzamento iniziale o rinforzi: `budget` armate da distribuire sui propri territori. */
  | { kind: 'place'; setup: boolean; budget: number }
  /** Appena conquistato: quante armate far entrare. */
  | { kind: 'occupy'; from: string; to: string; min: number; max: number }
  | { kind: 'attack' }
  | { kind: 'fortify' }
  /** Piazzamento tutti insieme: ho confermato, si aspettano gli altri. */
  | { kind: 'wait-setup' }
  /** Tocca a qualcun altro. */
  | { kind: 'wait'; player: string | null }
  | { kind: 'over' }
  /** Fuori dalla partita (eliminato o uscito): si guarda soltanto. */
  | { kind: 'out' };

export function myMove(view: GameView, me: string | null, rules: ConquestRules, left = false): MyMove {
  if (view.phase === 'over') return { kind: 'over' };
  const p = view.players.find((x) => x.id === me);
  if (!p || !p.alive || left) return { kind: 'out' };
  if (view.phase === 'briefing') return p.ready ? { kind: 'wait-briefing' } : { kind: 'briefing' };
  if (view.phase === 'draft') return view.setupPlayer === me ? { kind: 'pick' } : { kind: 'wait', player: view.setupPlayer };
  if (view.phase === 'setup') {
    if (rules.setup.placement === 'rounds') {
      if (view.setupPlayer !== me) return { kind: 'wait', player: view.setupPlayer };
      return { kind: 'place', setup: true, budget: Math.min(rules.setup.perRound, p.setupLeft) };
    }
    if (p.setupDone || p.pending) return { kind: 'wait-setup' };
    return { kind: 'place', setup: true, budget: p.setupLeft };
  }
  const turn = view.turn;
  if (!turn || turn.player !== me) return { kind: 'wait', player: turn?.player ?? null };
  if (turn.occupation) return { kind: 'occupy', ...turn.occupation };
  if (view.phase === 'reinforce') return { kind: 'place', setup: false, budget: turn.reinforcements };
  if (view.phase === 'attack') return { kind: 'attack' };
  return { kind: 'fortify' };
}

/**
 * Che cosa sto facendo adesso: quando cambia, le scelte non confermate (armate messe, territorio
 * scelto) ripartono da capo. Conta solo quante armate restano a me: nel piazzamento tutti insieme
 * gli altri confermano mentre io sto ancora piazzando, e non devono farmi perdere le mie.
 */
export function moveKey(view: GameView, move: MyMove, me: string | null): string {
  const setupLeft = view.players.find((p) => p.id === me)?.setupLeft ?? 0;
  return `${view.phase}:${view.turn?.number ?? 0}:${view.setupPlayer ?? ''}:${move.kind}:${setupLeft}`;
}

/** Chi deve muoversi adesso (per "tocca a…"): chi sceglie, chi piazza a giri o chi ha il turno; null se tutti insieme. */
export function actingPlayer(view: GameView): string | null {
  if (view.phase === 'draft' || view.phase === 'setup') return view.setupPlayer;
  if (view.phase === 'over' || view.phase === 'briefing') return null;
  return view.turn?.player ?? null;
}

export const owned = (view: GameView, id: string) => Object.keys(view.territories).filter((t) => view.territories[t]!.owner === id);

/** Mosse in cui tocca a me fare qualcosa (per "tocca a te", suoni e titolo della scheda). */
export const isMyMove = (move: MyMove) =>
  move.kind === 'briefing' || move.kind === 'pick' || move.kind === 'place' || move.kind === 'attack' || move.kind === 'fortify' || move.kind === 'occupy';

/** Territori ancora liberi (scelta a turno). */
export const freeTerritories = (view: GameView, all: readonly { id: string }[]) => all.filter((t) => !view.territories[t.id]).map((t) => t.id);

/** Regola Prestige: prima della fine del giro protetto nessuno si può eliminare. */
export function eliminationAllowed(view: GameView, rules: ConquestRules): boolean {
  return !view.turn || view.turn.number > rules.elimination.protectedRounds * view.order.length;
}

/** Giro in corso (1 = il primo giro di turni) e turno dentro il giro. */
export function roundOf(view: GameView): { round: number; inRound: number } {
  const n = view.turn?.number ?? 0;
  const k = Math.max(1, view.order.length);
  return { round: Math.max(1, Math.ceil(n / k)), inRound: ((n - 1) % k) + 1 };
}

export interface AttackTarget {
  id: string;
  /** Non si può attaccare per la regola Prestige (è l'ultimo territorio del difensore). */
  protectedBy: string | null;
}

/** Dove si può attaccare da `from`: confinanti nemici (quelli protetti con il motivo). */
export function attackTargets(view: GameView, rules: ConquestRules, neighbours: Map<string, string[]>, from: string): AttackTarget[] {
  const src = view.territories[from];
  if (!src) return [];
  const free = eliminationAllowed(view, rules);
  return (neighbours.get(from) ?? [])
    .filter((n) => view.territories[n]!.owner !== src.owner)
    .map((n) => {
      const owner = view.territories[n]!.owner;
      const last = owned(view, owner).length <= 1;
      return { id: n, protectedBy: !free && last ? owner : null };
    });
}

/** Dove si possono spostare armate da `from` a fine turno (confinanti propri, o collegati da territori propri). */
export function moveTargets(view: GameView, rules: ConquestRules, neighbours: Map<string, string[]>, from: string): string[] {
  const src = view.territories[from];
  if (!src) return [];
  const own = (id: string) => view.territories[id]?.owner === src.owner;
  if (rules.fortify.reach === 'adjacent') return (neighbours.get(from) ?? []).filter(own);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    for (const n of neighbours.get(queue.pop()!) ?? []) {
      if (!seen.has(n) && own(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  seen.delete(from);
  return [...seen];
}

/** Dadi d'attacco possibili da un territorio: almeno un'armata resta a casa. */
export const maxDice = (rules: ConquestRules, armies: number) => Math.max(0, Math.min(maxAttackDice(rules.dice), armies - 1));

/** Armate di rinforzo che spettano a un giocatore: territori / divisore (con il minimo) + bonus dei continenti. */
export function reinforcementsFor(view: GameView, rules: ConquestRules, continents: { id: string; bonus: number }[], continentOf: Map<string, string>, id: string) {
  const mine = owned(view, id);
  const base = Math.max(rules.reinforcements.minimum, Math.floor(mine.length / rules.reinforcements.divisor));
  const held = continents.filter((c) => [...continentOf].every(([t, cid]) => cid !== c.id || view.territories[t]!.owner === id));
  return { base, bonus: held.reduce((s, c) => s + c.bonus, 0), held: held.map((c) => c.id) };
}

/** Totali di un giocatore. */
export function totals(view: GameView, p: PlayerView) {
  const mine = owned(view, p.id);
  return { territories: mine.length, armies: mine.reduce((s, t) => s + view.territories[t]!.armies, 0) };
}
