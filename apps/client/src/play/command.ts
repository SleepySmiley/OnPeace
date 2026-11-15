/**
 * Che cosa dice e offre il comando della mossa in ogni momento del turno (cosa fare, il numero
 * da tenere d'occhio, chi contro chi, dadi, armate, bottoni), senza decidere come si disegna:
 * la barra dei comandi in basso lo mostra su una riga.
 */
import { defenseDice, maxAttackDice } from '@onpeace/conquista';
import { useSession } from '../store';
import { PHASES } from './describe';
import { attackTargets, freeTerritories, maxDice, moveTargets, reinforcementsFor, type MyMove } from './logic';
import { useGame } from './useGame';

export interface Side {
  id: string;
  name: string;
  armies: number;
  color: string;
  player: string;
}

export interface Btn {
  label: string;
  run(): void;
  disabled?: boolean;
  /** Tasto che fa la stessa cosa. */
  kbd?: string;
  danger?: boolean;
}

export interface Command {
  kind: MyMove['kind'];
  /** Tocca a me fare qualcosa. */
  mine: boolean;
  /** Fase in corso, come nella barra in alto. */
  phase: string;
  /** Che cosa fare, in poche parole. */
  title: string;
  /** Come si fa (clic, tasti) o che cosa succede. */
  hint: string | null;
  /** Di chi è il turno, quando non è mio. */
  who?: { name: string; color: string } | null;
  /** Il numero da tenere d'occhio: armate da mettere, territori liberi… */
  count?: { left: number; total: number | null; noun: string } | null;
  /** Da dove vengono le armate di rinforzo. */
  breakdown?: string | null;
  placements?: { id: string; name: string; n: number }[];
  from?: Side | null;
  to?: Side | null;
  /** Attacco con il territorio scelto ma senza bersaglio: i nemici confinanti. */
  targets?: (Side & { protectedBy: boolean })[];
  dice?: { value: number; max: number; all: number; defense: number; set(n: number): void } | null;
  amount?: { value: number; min: number; max: number; label: string; set(n: number): void } | null;
  primary?: Btn | null;
  secondary?: Btn | null;
  /** Chiude la fase o il turno (Basta attacchi, Fine turno). */
  end?: Btn | null;
  busy: boolean;
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const phaseLabel = (id: string) => PHASES.find((p) => p.id === id)?.label ?? '';

export function useCommand(): Command {
  const { view, lobby, board, me, move, colorOf, playerName, territory } = useGame();
  const draft = useSession((s) => s.draft);
  const sending = useSession((s) => s.sending);
  const s = useSession.getState();
  const rules = lobby.rules;
  const busy = sending !== null;
  const side = (id: string): Side => {
    const t = view.territories[id]!;
    return { id, name: territory(id), armies: t.armies, color: colorOf(t.owner), player: playerName(t.owner) };
  };
  const base = { kind: move.kind, mine: false, phase: phaseLabel(view.phase), busy } as const;

  switch (move.kind) {
    case 'briefing':
      return { ...base, mine: true, title: 'Leggi il tuo obiettivo', hint: null, primary: { label: 'Ho capito', run: () => s.ready(), kbd: 'Invio' } };
    case 'wait-briefing': {
      const ready = view.players.filter((p) => p.ready).length;
      return { ...base, title: 'Pronto', hint: `Si aspetta che gli altri leggano l'obiettivo (${ready}/${view.players.length}). Poi si scelgono i territori a turno.` };
    }
    case 'pick': {
      const free = freeTerritories(view, board.def.territories).length;
      return {
        ...base,
        mine: true,
        title: 'Scegli un territorio',
        hint: "Clic su un territorio libero: diventa tuo con un'armata",
        count: { left: free, total: board.def.territories.length, noun: free === 1 ? 'libero' : 'liberi' },
      };
    }
    case 'place': {
      const placed = sum(draft.placements);
      const left = move.budget - placed;
      let breakdown: string | null = null;
      if (!move.setup && me) {
        const r = reinforcementsFor(view, rules, board.def.continents, board.geo.continentOf, me);
        const fromSets = move.budget - r.base - r.bonus;
        const parts = [`${r.base} dai territori`];
        if (r.bonus > 0) parts.push(`+${r.bonus} ${r.held.map((c) => board.def.continents.find((x) => x.id === c)?.name).join(', ')}`);
        if (fromSets > 0) parts.push(`+${fromSets} dai tris`);
        // solo se c'è altro oltre ai territori: "3 dai territori" da solo ripeterebbe il totale
        if (parts.length > 1) breakdown = parts.join(' · ');
      }
      return {
        ...base,
        mine: true,
        title: left === 0 ? 'Tutto messo: conferma' : 'Metti le armate',
        hint: 'Clic su un tuo territorio +1 · Maiusc+clic tutte · destro −1',
        count: { left, total: move.budget, noun: left === 1 ? 'armata da mettere' : 'armate da mettere' },
        breakdown,
        placements: Object.entries(draft.placements).map(([id, n]) => ({ id, name: territory(id), n })),
        primary: { label: 'Conferma', run: () => s.confirmPlacement(), disabled: left !== 0 || busy, kbd: 'Invio' },
        secondary: { label: 'Ricomincia', run: () => s.resetPlacements(), disabled: placed === 0 || busy, kbd: 'Esc' },
      };
    }
    case 'occupy': {
      const value = Math.min(move.max, Math.max(move.min, draft.occupy ?? move.max));
      const forced = move.min === move.max;
      return {
        ...base,
        mine: true,
        title: `Hai conquistato ${territory(move.to)}`,
        hint: forced
          ? `Entrano ${value} ${value === 1 ? 'armata' : 'armate'}: una resta in ${territory(move.from)}`
          : `Quante entrano? Da ${move.min} (i dadi tirati) a ${move.max}: una resta in ${territory(move.from)}`,
        from: side(move.from),
        to: side(move.to),
        amount: forced ? null : { value, min: move.min, max: move.max, label: 'Armate che entrano', set: (n) => s.patchDraft({ occupy: n }) },
        primary: { label: `Sposta ${value}`, run: () => s.occupy(value), disabled: busy, kbd: 'Invio' },
      };
    }
    case 'attack': {
      const turn = view.turn!;
      const end: Btn = { label: turn.fortifyLeft > 0 ? 'Basta attacchi' : 'Fine turno', run: () => s.endAttack(), disabled: busy || draft.blitz };
      const fromT = draft.selected ? view.territories[draft.selected] : null;
      if (!draft.selected || !fromT || fromT.owner !== me || fromT.armies < 2) {
        return {
          ...base,
          mine: true,
          title: 'Scegli da dove attaccare',
          hint: 'Un tuo territorio con almeno 2 armate, poi il nemico. Oppure clic diretto su un nemico',
          end,
        };
      }
      if (!draft.target) {
        const targets = attackTargets(view, rules, board.geo.neighbours, draft.selected).map((t) => ({ ...side(t.id), protectedBy: Boolean(t.protectedBy) }));
        return {
          ...base,
          mine: true,
          title: 'Scegli chi attaccare',
          hint: targets.length === 0 ? 'Nessun nemico confina con questo territorio' : 'Clic su un nemico confinante · Esc annulla',
          from: side(draft.selected),
          targets,
          end,
        };
      }
      const toT = view.territories[draft.target]!;
      const max = maxDice(rules, fromT.armies);
      const dice = draft.dice === null ? max : Math.min(draft.dice, max);
      return {
        ...base,
        mine: true,
        title: draft.blitz ? 'Attacco fino in fondo…' : 'Attacca',
        hint: 'Clic di nuovo sul bersaglio: tira ancora · Esc annulla',
        from: side(draft.selected),
        to: side(draft.target),
        dice: { value: dice, max, all: maxAttackDice(rules.dice), defense: defenseDice(rules.dice, toT.armies), set: (n) => s.patchDraft({ dice: n }) },
        primary: draft.blitz
          ? { label: "Ferma l'attacco", run: () => s.stopBlitz(), danger: true }
          : { label: `Tira ${dice} ${dice === 1 ? 'dado' : 'dadi'}`, run: () => s.attack(), disabled: busy || max < 1, kbd: 'Invio' },
        secondary: draft.blitz ? null : { label: 'Fino in fondo', run: () => s.attack(true), disabled: busy || max < 1 },
        end,
      };
    }
    case 'fortify': {
      const fromT = draft.selected ? view.territories[draft.selected] : null;
      const ready = Boolean(draft.selected && draft.target && fromT && fromT.owner === me && fromT.armies >= 2);
      const end: Btn = { label: 'Fine turno', run: () => s.endTurn(), disabled: busy };
      const reach = rules.fortify.reach === 'adjacent' ? 'confinante' : 'collegato da territori tuoi';
      if (!draft.selected || !fromT || fromT.owner !== me) {
        return { ...base, mine: true, title: 'Sposta armate, se vuoi', hint: `Da un tuo territorio a uno ${reach}. Oppure chiudi il turno`, primary: { ...end, kbd: undefined }, end: null };
      }
      if (!ready) {
        const options = moveTargets(view, rules, board.geo.neighbours, draft.selected);
        return {
          ...base,
          mine: true,
          title: 'Scegli dove portarle',
          hint: options.length === 0 ? 'Nessun tuo territorio raggiungibile da qui' : 'Clic su un tuo territorio raggiungibile · Esc annulla',
          from: side(draft.selected),
          end,
        };
      }
      const max = fromT.armies - 1;
      const value = Math.min(max, Math.max(1, draft.move ?? max));
      return {
        ...base,
        mine: true,
        title: 'Sposta e chiudi il turno',
        hint: 'Esc annulla',
        from: side(draft.selected),
        to: side(draft.target!),
        amount: { value, min: 1, max, label: 'Armate da spostare', set: (n) => s.patchDraft({ move: n }) },
        primary: { label: `Sposta ${value}`, run: () => s.fortify(), disabled: busy, kbd: 'Invio' },
        end,
      };
    }
    case 'wait-setup': {
      const done = view.players.filter((p) => p.setupDone || p.pending).length;
      return { ...base, title: 'Piazzamento fatto', hint: `Le tue armate restano coperte finché non hanno finito tutti (${done}/${view.players.length})` };
    }
    case 'wait': {
      const who = move.player;
      const doing =
        view.phase === 'draft'
          ? `Sta scegliendo un territorio (ne restano ${freeTerritories(view, board.def.territories).length})`
          : view.phase === 'setup'
            ? 'Sta piazzando le armate iniziali'
            : view.phase === 'reinforce'
              ? 'Sta mettendo i rinforzi'
              : view.phase === 'attack'
                ? 'Sta attaccando'
                : 'Sta spostando le armate';
      return {
        ...base,
        title: who ? `Tocca a ${playerName(who)}` : 'Si aspetta',
        hint: `${doing}. Intanto puoi guardare il tabellone`,
        who: who ? { name: playerName(who), color: colorOf(who) } : null,
      };
    }
    case 'out':
      return { ...base, title: 'Sei fuori dalla partita', hint: 'Puoi continuare a guardare come va a finire' };
    case 'over':
      return { ...base, title: 'Partita finita', hint: null };
  }
}
