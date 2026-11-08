/**
 * Sessione di gioco locale "a turno sullo stesso PC" (prova in locale, M2).
 * Ogni giocatore pianifica il proprio turno a schermo, poi passa il mouse al successivo;
 * quando tutti hanno finito il motore risolve il turno.
 */
import { create } from 'zustand';
import {
  NavGrid,
  createContext,
  createGame,
  finishSelection,
  resolveTurn,
  selectCountry,
  RuleError,
  type Action,
  type GameSettings,
  type GameState,
  type PlayerId,
  type Point,
  type StackRef,
  type TurnEvent,
  type UnitSelection,
} from '@onpeace/engine';
import { rules, testMap } from '../data';

export const ctx = createContext(testMap, rules);
export const nav = new NavGrid(testMap);

export const PLAYER_COLORS = ['#e05a4f', '#3f86e0', '#e6a632', '#3fae6e', '#a066d6', '#22b3b3', '#e0679f', '#8fa3b3'];

export type Screen = 'setup' | 'selection' | 'handoff' | 'planning' | 'results';
export type Selected = { kind: 'city'; id: string } | { kind: 'stack'; id: string } | null;

export interface MoveDraft {
  mode: 'move' | 'unload';
  from: StackRef;
  sourcePos: Point;
  units: UnitSelection;
  /** Raggio in unità mappa. */
  range: number;
  waypoints: Point[];
  hover: Point | null;
  /** Pila nemica sotto il cursore (bersaglio dell'attacco). */
  target: string | null;
}

interface Session {
  screen: Screen;
  game: GameState | null;
  plans: Record<PlayerId, Action[]>;
  /** Indice, tra i giocatori attivi, di chi sta pianificando. */
  plannerIndex: number;
  events: TurnEvent[];
  /** Turno a cui si riferiscono gli eventi mostrati. */
  eventsTurn: number;
  selected: Selected;
  draft: MoveDraft | null;
  notice: string | null;

  newGame(players: { name: string; color: string }[], settings?: Partial<GameSettings>): void;
  pickCountry(countryId: string): void;
  beginPlanning(): void;
  select(sel: Selected): void;
  addAction(action: Action): void;
  removeAction(index: number): void;
  startDraft(draft: Omit<MoveDraft, 'waypoints' | 'hover' | 'target'>): void;
  updateDraft(patch: Partial<MoveDraft>): void;
  cancelDraft(): void;
  endTurn(): void;
  continueAfterResults(): void;
  setNotice(text: string | null): void;
  reset(): void;
}

export const activePlayers = (game: GameState) => game.players.filter((p) => p.status === 'active');

/** Chi sceglie il prossimo paese: il primo, in ordine, che ne ha meno degli altri. */
export function currentPicker(game: GameState): PlayerId | null {
  const owned = (id: PlayerId) => ctx.map.countries.filter((c) => game.cities[c.capital]?.owner === id).length;
  const pending = game.players.filter((p) => owned(p.id) < game.settings.initialCountries);
  if (pending.length === 0) return null;
  const min = Math.min(...pending.map((p) => owned(p.id)));
  return pending.find((p) => owned(p.id) === min)!.id;
}

export function currentPlanner(s: Pick<Session, 'game' | 'plannerIndex'>): PlayerId | null {
  if (!s.game) return null;
  return activePlayers(s.game)[s.plannerIndex]?.id ?? null;
}

const initial = {
  screen: 'setup' as Screen,
  game: null,
  plans: {},
  plannerIndex: 0,
  events: [],
  eventsTurn: 0,
  selected: null,
  draft: null,
  notice: null,
};

export const useSession = create<Session>((set, get) => ({
  ...initial,

  newGame(players, settings) {
    const game = createGame(ctx, {
      id: `locale-${Date.now()}`,
      seed: Math.floor(Math.random() * 2 ** 31),
      players: players.map((p, i) => ({ id: `p${i + 1}`, name: p.name, color: p.color })),
      ...(settings ? { settings } : {}),
    });
    set({ ...initial, screen: 'selection', game });
  },

  pickCountry(countryId) {
    const { game } = get();
    if (!game || game.phase !== 'selection') return;
    const picker = currentPicker(game);
    if (!picker) return;
    const next = structuredClone(game);
    try {
      selectCountry(next, ctx, picker, countryId);
    } catch (err) {
      if (err instanceof RuleError) return set({ notice: err.message });
      throw err;
    }
    if (currentPicker(next) === null) {
      finishSelection(next);
      return set({ game: next, screen: 'handoff', plannerIndex: 0, notice: null });
    }
    set({ game: next, notice: null });
  },

  beginPlanning() {
    set({ screen: 'planning', selected: null, draft: null, notice: null });
  },

  select(sel) {
    set({ selected: sel, draft: null });
  },

  addAction(action) {
    const player = currentPlanner(get());
    if (!player) return;
    const plans = get().plans;
    set({ plans: { ...plans, [player]: [...(plans[player] ?? []), action] }, draft: null, notice: null });
  },

  removeAction(index) {
    const player = currentPlanner(get());
    if (!player) return;
    const plans = get().plans;
    const list = (plans[player] ?? []).filter((_, i) => i !== index);
    set({ plans: { ...plans, [player]: list } });
  },

  startDraft(draft) {
    set({ draft: { ...draft, waypoints: [], hover: null, target: null }, notice: null });
  },

  updateDraft(patch) {
    const d = get().draft;
    if (d) set({ draft: { ...d, ...patch } });
  },

  cancelDraft() {
    set({ draft: null });
  },

  endTurn() {
    const s = get();
    if (!s.game) return;
    const planners = activePlayers(s.game);
    if (s.plannerIndex < planners.length - 1) {
      set({ plannerIndex: s.plannerIndex + 1, screen: 'handoff', selected: null, draft: null });
      return;
    }
    const resolvedTurn = s.game.turn;
    const result = resolveTurn(s.game, ctx, nav, s.plans);
    set({
      game: result.state,
      events: result.events,
      eventsTurn: resolvedTurn,
      plans: {},
      plannerIndex: 0,
      screen: 'results',
      selected: null,
      draft: null,
    });
  },

  continueAfterResults() {
    const { game } = get();
    if (!game || game.phase === 'ended') return;
    // il resoconto resta consultabile durante il turno successivo
    set({ screen: 'handoff', selected: null });
  },

  setNotice(text) {
    set({ notice: text });
  },

  reset() {
    set({ ...initial });
  },
}));
