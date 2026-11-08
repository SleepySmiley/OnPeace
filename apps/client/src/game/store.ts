/**
 * Stato della sessione di gioco, in due modalità:
 * - "local": a turno sullo stesso PC (il motore gira nel browser);
 * - "online": il server decide tutto, il browser manda ordini e riceve la propria vista.
 */
import { create } from 'zustand';
import {
  NavGrid,
  createContext,
  createGame,
  finishSelection,
  nextPicker,
  resolveTurn,
  selectCountry,
  setDoctrine,
  RuleError,
  type Action,
  type Doctrine,
  type GameSettings,
  type GameState,
  type PlayerId,
  type Point,
  type StackRef,
  type TurnEvent,
  type UnitSelection,
} from '@onpeace/engine';
import {
  PLAYER_COLORS as COLORS,
  toWirePlan,
  type ChatLine,
  type ClientMsg,
  type LobbyInfo,
  type LobbySettings,
  type RoomPhase,
  type ServerMsg,
} from '@onpeace/protocol';
import { rules, testMap } from '../data';
import { Net, gameFromUrl, loadSession, saveSession, setGameInUrl } from './net';

export const ctx = createContext(testMap, rules);
export const nav = new NavGrid(testMap);
export const PLAYER_COLORS = COLORS;

export type Mode = 'local' | 'online';
export type Screen = 'setup' | 'lobby' | 'selection' | 'handoff' | 'planning' | 'results';
export type Selected = { kind: 'city'; id: string } | { kind: 'stack'; id: string } | { kind: 'finance' } | null;
export type BattleEvent = Extract<TurnEvent, { kind: 'battle' }>;

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

export interface OnlineState {
  game: string | null;
  me: PlayerId | null;
  lobby: LobbyInfo | null;
  /** Scadenza del turno o della scelta, già convertita sull'orologio locale. */
  deadline: number | null;
  waiting: PlayerId[];
  picker: PlayerId | null;
  connected: boolean;
  chat: ChatLine[];
  unread: number;
}

interface Session {
  mode: Mode;
  screen: Screen;
  game: GameState | null;
  plans: Record<PlayerId, Action[]>;
  /** Solo locale: indice, tra i giocatori attivi, di chi sta pianificando. */
  plannerIndex: number;
  events: TurnEvent[];
  eventsTurn: number;
  /** Cresce a ogni nuovo resoconto (per aprire la scheda Resoconto). */
  reportSeq: number;
  selected: Selected;
  draft: MoveDraft | null;
  notice: string | null;
  online: OnlineState;
  /** Battaglia mostrata nel replay. */
  replay: BattleEvent | null;
  /** Richiesta di centrare la mappa su un punto (seq cambia a ogni richiesta). */
  focus: { pos: Point; seq: number } | null;

  openReplay(battle: BattleEvent | null): void;
  focusOn(pos: Point): void;

  // partita locale
  newGame(players: { name: string; color: string }[], settings?: Partial<GameSettings>): void;
  beginPlanning(): void;
  continueAfterResults(): void;
  // partita online
  createOnline(name: string, color: string, settings: LobbySettings): void;
  joinOnline(game: string, name: string, color?: string): void;
  resumeOnline(): boolean;
  send(msg: ClientMsg): void;
  leaveOnline(): void;
  markChatRead(): void;
  // comuni
  pickCountry(countryId: string): void;
  /** Strategia e Generale di chi sceglie ora (online: io; in locale: chi sta scegliendo il paese). */
  chooseDoctrine(doctrine: Doctrine): void;
  select(sel: Selected): void;
  addAction(action: Action): void;
  removeAction(index: number): void;
  startDraft(draft: Omit<MoveDraft, 'waypoints' | 'hover' | 'target'>): void;
  updateDraft(patch: Partial<MoveDraft>): void;
  cancelDraft(): void;
  endTurn(): void;
  setNotice(text: string | null): void;
  reset(): void;
}

export const activePlayers = (game: GameState) => game.players.filter((p) => p.status === 'active');

/** Chi sceglie il prossimo paese (in locale lo calcola il client, online lo dice il server). */
export function currentPicker(s: Pick<Session, 'mode' | 'game' | 'online'>): PlayerId | null {
  if (s.mode === 'online') return s.online.picker;
  return s.game ? nextPicker(s.game, ctx) : null;
}

/** Il giocatore che sta dando ordini in questo momento su questo schermo. */
export function currentPlanner(s: Pick<Session, 'mode' | 'game' | 'plannerIndex' | 'online'>): PlayerId | null {
  if (!s.game) return null;
  if (s.mode === 'online') {
    const me = s.online.me;
    const active = s.game.phase === 'playing' && s.game.players.some((p) => p.id === me && p.status === 'active');
    return active ? me : null;
  }
  return activePlayers(s.game)[s.plannerIndex]?.id ?? null;
}

const emptyOnline: OnlineState = {
  game: null,
  me: null,
  lobby: null,
  deadline: null,
  waiting: [],
  picker: null,
  connected: false,
  chat: [],
  unread: 0,
};

const initial = {
  mode: 'local' as Mode,
  screen: 'setup' as Screen,
  game: null,
  plans: {},
  plannerIndex: 0,
  events: [],
  eventsTurn: 0,
  reportSeq: 0,
  selected: null,
  draft: null,
  notice: null,
  online: emptyOnline,
  replay: null,
  focus: null,
};

const phaseScreen: Record<RoomPhase, Screen> = {
  lobby: 'lobby',
  selection: 'selection',
  playing: 'planning',
  ended: 'results',
};

let net: Net | null = null;

export const useSession = create<Session>((set, get) => {
  const patchOnline = (patch: Partial<OnlineState>) => set({ online: { ...get().online, ...patch } });

  function handleServer(msg: ServerMsg) {
    const s = get();
    switch (msg.t) {
      case 'welcome':
        saveSession({ game: msg.game, token: msg.token });
        setGameInUrl(msg.game);
        patchOnline({ game: msg.game, me: msg.you });
        return;
      case 'lobby':
        patchOnline({ lobby: msg.lobby });
        set({ screen: phaseScreen[msg.lobby.phase] });
        return;
      case 'game': {
        const prev = s.game;
        const me = s.online.me;
        const sameTurn = prev && prev.turn === msg.view.turn && prev.phase === msg.view.phase;
        const newReport = msg.eventsTurn !== s.eventsTurn;
        const sel = s.selected;
        const stillThere = sel?.kind !== 'stack' || msg.view.stacks.some((x) => x.id === sel.id) ? sel : null;
        set({
          game: msg.view,
          plans: sameTurn || !me ? s.plans : { [me]: msg.plan },
          events: msg.events,
          eventsTurn: msg.eventsTurn,
          reportSeq: newReport && msg.eventsTurn > 0 ? s.reportSeq + 1 : s.reportSeq,
          selected: stillThere,
          draft: sameTurn ? s.draft : null,
        });
        return;
      }
      case 'status':
        patchOnline({
          deadline: msg.deadline === null ? null : msg.deadline - msg.now + Date.now(),
          waiting: msg.waiting,
          picker: msg.picker,
        });
        return;
      case 'chat': {
        const known = new Set(s.online.chat.map((l) => `${l.at}:${l.from}`));
        const fresh = msg.lines.filter((l) => !known.has(`${l.at}:${l.from}`));
        if (fresh.length === 0) return;
        patchOnline({
          chat: [...s.online.chat, ...fresh].slice(-200),
          unread: s.online.unread + fresh.filter((l) => l.from !== s.online.me).length,
        });
        return;
      }
      case 'error':
        set({ notice: msg.message });
        if (/Sessione scaduta|Partita non trovata/.test(msg.message) && !s.online.me) {
          saveSession(null);
        }
        return;
      case 'kicked':
        saveSession(null);
        net?.close();
        net = null;
        set({ ...initial, notice: msg.reason });
        setGameInUrl(null);
        return;
    }
  }

  function connect(greeting: () => ClientMsg | null) {
    net?.close();
    net = new Net(handleServer, (connected) => patchOnline({ connected }), greeting);
  }

  function sendPlan() {
    const s = get();
    const me = s.online.me;
    if (s.mode === 'online' && me) net?.send({ t: 'plan', actions: toWirePlan(s.plans[me] ?? []) });
  }

  return {
    ...initial,

    // ---------------------------------------------------------------- locale
    newGame(players, settings) {
      const game = createGame(ctx, {
        id: `locale-${Date.now()}`,
        seed: Math.floor(Math.random() * 2 ** 31),
        players: players.map((p, i) => ({ id: `p${i + 1}`, name: p.name, color: p.color })),
        ...(settings ? { settings } : {}),
      });
      set({ ...initial, mode: 'local', screen: 'selection', game });
    },

    beginPlanning() {
      set({ screen: 'planning', selected: null, draft: null, notice: null });
    },

    continueAfterResults() {
      const { game } = get();
      if (!game || game.phase === 'ended') return;
      // il resoconto resta consultabile durante il turno successivo
      set({ screen: 'handoff', selected: null });
    },

    // ---------------------------------------------------------------- online
    createOnline(name, color, settings) {
      set({ ...initial, mode: 'online', screen: 'lobby', online: { ...emptyOnline } });
      let created = false;
      connect(() => {
        if (created) {
          // riconnessione: si rientra con il token ricevuto alla creazione
          const game = get().online.game;
          const saved = loadSession();
          return game && saved?.game === game ? { t: 'hello', token: saved.token } : null;
        }
        created = true;
        return { t: 'create', name, color, settings };
      });
    },

    joinOnline(game, name, color) {
      set({ ...initial, mode: 'online', screen: 'lobby', online: { ...emptyOnline } });
      let joined = false;
      connect(() => {
        const saved = loadSession();
        if (joined && saved?.game === game) return { t: 'hello', token: saved.token };
        joined = true;
        return { t: 'join', game, name, ...(color ? { color } : {}) };
      });
    },

    resumeOnline() {
      const saved = loadSession();
      const fromUrl = gameFromUrl();
      if (!saved || (fromUrl && fromUrl !== saved.game)) return false;
      set({ ...initial, mode: 'online', screen: 'lobby', online: { ...emptyOnline, game: saved.game } });
      connect(() => {
        const s = loadSession();
        return s ? { t: 'hello', token: s.token } : null;
      });
      return true;
    },

    send(msg) {
      net?.send(msg);
    },

    leaveOnline() {
      net?.send({ t: 'leave' });
      setTimeout(() => {
        net?.close();
        net = null;
      }, 200);
      saveSession(null);
      setGameInUrl(null);
      set({ ...initial });
    },

    markChatRead() {
      if (get().online.unread > 0) patchOnline({ unread: 0 });
    },

    // ---------------------------------------------------------------- comuni
    pickCountry(countryId) {
      const s = get();
      if (!s.game || s.game.phase !== 'selection') return;
      if (s.mode === 'online') {
        if (s.online.picker !== s.online.me) return set({ notice: 'Non tocca a te scegliere' });
        net?.send({ t: 'pick', country: countryId });
        return;
      }
      const picker = nextPicker(s.game, ctx);
      if (!picker) return;
      const next = structuredClone(s.game);
      try {
        selectCountry(next, ctx, picker, countryId);
      } catch (err) {
        if (err instanceof RuleError) return set({ notice: err.message });
        throw err;
      }
      if (nextPicker(next, ctx) === null) {
        finishSelection(next, ctx);
        return set({ game: next, screen: 'handoff', plannerIndex: 0, notice: null });
      }
      set({ game: next, notice: null });
    },

    chooseDoctrine(doctrine) {
      const s = get();
      if (s.mode === 'online') {
        net?.send({ t: 'doctrine', strategy: doctrine.strategy, general: doctrine.general });
        return;
      }
      if (!s.game || s.game.phase !== 'selection') return;
      const picker = nextPicker(s.game, ctx);
      if (!picker) return;
      const next = structuredClone(s.game);
      try {
        setDoctrine(next, ctx, picker, doctrine);
      } catch (err) {
        if (err instanceof RuleError) return set({ notice: err.message });
        throw err;
      }
      set({ game: next, notice: null });
    },

    select(sel) {
      set({ selected: sel, draft: null });
    },

    addAction(action) {
      const player = currentPlanner(get());
      if (!player) return;
      const plans = get().plans;
      set({ plans: { ...plans, [player]: [...(plans[player] ?? []), action] }, draft: null, notice: null });
      sendPlan();
    },

    removeAction(index) {
      const player = currentPlanner(get());
      if (!player) return;
      const plans = get().plans;
      set({ plans: { ...plans, [player]: (plans[player] ?? []).filter((_, i) => i !== index) } });
      sendPlan();
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
      if (s.mode === 'online') {
        const me = s.online.me;
        if (!me) return;
        const done = s.online.waiting.includes(me);
        sendPlan();
        net?.send({ t: 'ready', done });
        return;
      }
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
        reportSeq: s.reportSeq + 1,
        plans: {},
        plannerIndex: 0,
        screen: 'results',
        selected: null,
        draft: null,
      });
    },

    setNotice(text) {
      set({ notice: text });
    },

    openReplay(battle) {
      set({ replay: battle });
    },

    focusOn(pos) {
      set({ focus: { pos, seq: (get().focus?.seq ?? 0) + 1 } });
    },

    reset() {
      if (get().mode === 'online') {
        net?.close();
        net = null;
      }
      set({ ...initial });
    },
  };
});
