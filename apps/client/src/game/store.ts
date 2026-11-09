/**
 * Stato della sessione di gioco, in due modalità:
 * - "local": a turno sullo stesso PC (il motore gira nel browser);
 * - "online": il server decide tutto, il browser manda ordini e riceve la propria vista.
 */
import { create } from 'zustand';
import {
  MapDef,
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
  type MapSummary,
  type RoomPhase,
  type ServerMsg,
} from '@onpeace/protocol';

export type PauseInfo = NonNullable<Extract<ServerMsg, { t: 'status' }>['paused']>;
import { rules, testMap } from '../data';
import { Net, gameFromUrl, loadSession, saveSession, setGameInUrl } from './net';

/**
 * Contesto delle regole e griglia di navigazione della mappa in uso. Cambiano quando si passa a
 * un'altra mappa: chi li importa vede sempre quelli attuali (binding "vivi" dei moduli ES).
 */
export let ctx = createContext(testMap, rules);
export let nav = new NavGrid(testMap);

const mapCache = new Map<string, Promise<MapDef>>([[testMap.id, Promise.resolve(testMap)]]);

/** Scarica dal server (una volta sola) e valida una mappa. */
export function fetchMap(id: string): Promise<MapDef> {
  let pending = mapCache.get(id);
  if (!pending) {
    pending = fetch(`/mappe/${id}.json`).then(async (res) => {
      if (!res.ok) throw new Error(`Mappa ${id}: risposta ${res.status} dal server`);
      return MapDef.parse(await res.json());
    });
    mapCache.set(id, pending);
    pending.catch(() => mapCache.delete(id));
  }
  return pending;
}

/** Le mappe che il server mette a disposizione. */
export async function fetchMapList(): Promise<MapSummary[]> {
  const res = await fetch('/mappe');
  if (!res.ok) throw new Error(`Elenco delle mappe: risposta ${res.status} dal server`);
  return (await res.json()) as MapSummary[];
}

/** Rende attiva una mappa (contesto e griglia si ricalcolano solo se cambia). */
function activateMap(map: MapDef): void {
  if (ctx.map === map) return;
  ctx = createContext(map, rules);
  nav = new NavGrid(map);
}
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
  /** Pila sotto il cursore: nemica = bersaglio dell'attacco, propria = ci si unisce. */
  target: string | null;
  /** Si sta trascinando la pila (altrimenti la freccia segue il mouse e si conferma con un clic). */
  dragging: boolean;
}

/** Unità scelte nel pannello di una pila (per tipo). Senza scelta si muovono tutte quelle libere. */
export interface UnitPick {
  stack: string;
  counts: Record<string, number>;
}

export interface OnlineState {
  game: string | null;
  me: PlayerId | null;
  lobby: LobbyInfo | null;
  /** Scadenza del turno o della scelta, già convertita sull'orologio locale. */
  deadline: number | null;
  /** Tempo fermo (dall'host o per un errore del server). */
  paused: PauseInfo | null;
  /** Indirizzo pubblico del server (tunnel), per il link d'invito. */
  publicUrl: string | null;
  waiting: PlayerId[];
  picker: PlayerId | null;
  connected: boolean;
  chat: ChatLine[];
  unread: number;
}

interface Session {
  /** Id della mappa in uso (cambia quando se ne carica un'altra: serve a ridisegnare). */
  mapId: string;
  /** Si sta scaricando una mappa. */
  mapLoading: boolean;
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
  unitPick: UnitPick | null;
  notice: string | null;
  online: OnlineState;
  /** Battaglia mostrata nel replay. */
  replay: BattleEvent | null;
  /** Richiesta di centrare la mappa su un punto (seq cambia a ogni richiesta). */
  focus: { pos: Point; seq: number } | null;

  openReplay(battle: BattleEvent | null): void;
  focusOn(pos: Point): void;

  // partita locale
  newGame(players: { name: string; color: string }[], settings?: Partial<GameSettings>, mapId?: string): Promise<void>;
  /** Mostra una mappa (per esempio quella scelta prima di cominciare). */
  showMap(mapId: string): Promise<void>;
  beginPlanning(): void;
  continueAfterResults(): void;
  // partita online
  createOnline(name: string, color: string, settings: LobbySettings): void;
  joinOnline(game: string, name: string, color?: string): void;
  resumeOnline(): boolean;
  send(msg: ClientMsg): void;
  leaveOnline(): void;
  markChatRead(): void;
  /** "Segnala un problema": manda al server il testo e il contesto della partita. */
  reportProblem(text: string): void;
  // comuni
  pickCountry(countryId: string): void;
  /** Strategia e Generale di chi sceglie ora (online: io; in locale: chi sta scegliendo il paese). */
  chooseDoctrine(doctrine: Doctrine): void;
  select(sel: Selected): void;
  addAction(action: Action): void;
  removeAction(index: number): void;
  startDraft(draft: Omit<MoveDraft, 'waypoints' | 'hover' | 'target' | 'dragging'>, dragging?: boolean): void;
  setUnitPick(pick: UnitPick | null): void;
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
  paused: null,
  publicUrl: null,
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
  unitPick: null,
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

/** Quanto serve a capire una segnalazione: schermata, turno, ordini, ultimo avviso, browser. */
function clientContext(s: Session): string {
  const me = s.online.me;
  return JSON.stringify({
    mode: s.mode,
    screen: s.screen,
    game: s.online.game,
    me,
    turn: s.game?.turn ?? null,
    phase: s.game?.phase ?? null,
    orders: me ? (s.plans[me]?.length ?? 0) : null,
    selected: s.selected,
    draft: s.draft ? { mode: s.draft.mode, units: s.draft.units } : null,
    notice: s.notice,
    connected: s.online.connected,
    viewport: `${innerWidth}x${innerHeight}`,
    browser: navigator.userAgent,
  });
}

const sentErrors = new Set<string>();
const MAX_ERROR_REPORTS = 10;

/** Manda al server un errore dell'interfaccia (solo online, senza doppioni, al massimo 10 per sessione). */
export function reportClientError(err: unknown, extra = ''): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const key = `${error.message}\n${error.stack?.split('\n')[1] ?? ''}`;
  if (!net || sentErrors.has(key) || sentErrors.size >= MAX_ERROR_REPORTS) return;
  sentErrors.add(key);
  const detail = `${error.stack ?? error.message}\n${extra}\n${clientContext(useSession.getState())}`;
  net.send({ t: 'report', kind: 'error', text: error.message.slice(0, 2000) || 'Errore senza messaggio', detail: detail.slice(0, 8000) });
}

export const useSession = create<Session>((set, get) => {
  const patchOnline = (patch: Partial<OnlineState>) => set({ online: { ...get().online, ...patch } });

  /** Carica e attiva una mappa; true se è pronta. */
  async function switchMap(id: string): Promise<boolean> {
    if (ctx.map.id === id) return true;
    set({ mapLoading: true });
    try {
      activateMap(await fetchMap(id));
      set({ mapId: id, mapLoading: false });
      return true;
    } catch (err) {
      set({ mapLoading: false, notice: 'Non riesco a scaricare la mappa: controlla la connessione e ricarica la pagina' });
      reportClientError(err);
      return false;
    }
  }

  // i messaggi si gestiscono in ordine; quelli che usano un'altra mappa aspettano che sia pronta
  let inbox: Promise<void> = Promise.resolve();
  function onServer(msg: ServerMsg) {
    inbox = inbox.then(async () => {
      const need = msg.t === 'lobby' ? msg.lobby.mapId : msg.t === 'game' ? msg.view.mapId : null;
      if (need && !(await switchMap(need))) return;
      handleServer(msg);
    });
  }

  function handleServer(msg: ServerMsg) {
    const s = get();
    switch (msg.t) {
      case 'server':
        patchOnline({ publicUrl: msg.publicUrl });
        return;
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
          unitPick: sameTurn ? s.unitPick : null,
        });
        return;
      }
      case 'status':
        patchOnline({
          deadline: msg.deadline === null ? null : msg.deadline - msg.now + Date.now(),
          paused: msg.paused ?? null,
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
      case 'notice':
        set({ notice: msg.message });
        return;
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
    net = new Net(onServer, (connected) => patchOnline({ connected }), greeting);
  }

  function sendPlan() {
    const s = get();
    const me = s.online.me;
    if (s.mode === 'online' && me) net?.send({ t: 'plan', actions: toWirePlan(s.plans[me] ?? []) });
  }

  return {
    ...initial,
    mapId: ctx.map.id,
    mapLoading: false,

    async showMap(mapId) {
      await switchMap(mapId);
    },

    // ---------------------------------------------------------------- locale
    async newGame(players, settings, mapId) {
      if (mapId && !(await switchMap(mapId))) return;
      const game = createGame(ctx, {
        id: `locale-${Date.now()}`,
        seed: Math.floor(Math.random() * 2 ** 31),
        players: players.map((p, i) => ({ id: `p${i + 1}`, name: p.name, color: p.color })),
        ...(settings ? { settings } : {}),
      });
      set({ ...initial, mode: 'local', screen: 'selection', game });
    },

    beginPlanning() {
      set({ screen: 'planning', selected: null, draft: null, unitPick: null, notice: null });
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

    reportProblem(text) {
      net?.send({ t: 'report', kind: 'feedback', text, detail: clientContext(get()).slice(0, 8000) });
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
      const pick = get().unitPick;
      set({ selected: sel, draft: null, unitPick: sel?.kind === 'stack' && pick?.stack === sel.id ? pick : null });
    },

    addAction(action) {
      const player = currentPlanner(get());
      if (!player) return;
      const plans = get().plans;
      set({ plans: { ...plans, [player]: [...(plans[player] ?? []), action] }, draft: null, unitPick: null, notice: null });
      sendPlan();
    },

    removeAction(index) {
      const player = currentPlanner(get());
      if (!player) return;
      const plans = get().plans;
      set({ plans: { ...plans, [player]: (plans[player] ?? []).filter((_, i) => i !== index) } });
      sendPlan();
    },

    startDraft(draft, dragging = false) {
      set({ draft: { ...draft, waypoints: [], hover: null, target: null, dragging }, notice: null });
    },

    setUnitPick(pick) {
      set({ unitPick: pick });
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
        set({ plannerIndex: s.plannerIndex + 1, screen: 'handoff', selected: null, draft: null, unitPick: null });
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
        unitPick: null,
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
