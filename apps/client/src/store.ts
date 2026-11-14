/**
 * Stato della sessione: collegamento al server, sala d'attesa, partita come la vede chi gioca,
 * registro degli eventi e le scelte in corso sul tabellone (territorio scelto, armate da
 * piazzare, dadi…). Il server decide tutto: qui si prepara la mossa e la si manda.
 */
import { create } from 'zustand';
import { BoardDef } from '@onpeace/engine';
import type { Action, GameView } from '@onpeace/conquista';
import type { BoardSummary, ChatLine, ClientMsg, LobbyInfo, LobbySettings, LoggedEvent, ServerMsg } from '@onpeace/protocol';
import { sfx } from './audio/sfx';
import { buildGeometry, type BoardGeometry } from './board/geometry';
import { Net, gameFromUrl, loadSession, saveSession, setGameInUrl } from './net';
import { attackTargets, maxDice, moveTargets, myMove, type MyMove } from './play/logic';

export type PauseInfo = NonNullable<Extract<ServerMsg, { t: 'status' }>['paused']>;

export interface OnlineState {
  game: string | null;
  me: string | null;
  lobby: LobbyInfo | null;
  /** Indirizzo pubblico del server (tunnel), per il link d'invito. */
  publicUrl: string | null;
  connected: boolean;
  /** Scadenza del tempo in corso, già portata sull'orologio locale. */
  deadline: number | null;
  paused: PauseInfo | null;
  /** Durata intera del tempo in corso (ms). */
  total: number | null;
  chat: ChatLine[];
  unread: number;
}

/** Le scelte in corso sul tabellone: restano in questo browser finché non si conferma. */
export interface Draft {
  selected: string | null;
  target: string | null;
  /** Armate messe ma non ancora confermate (piazzamento, rinforzi). */
  placements: Record<string, number>;
  /** Dadi d'attacco (null: il massimo possibile). */
  dice: number | null;
  /** Armate da far entrare nel territorio conquistato (null: il massimo). */
  occupy: number | null;
  /** Armate da spostare a fine turno (null: tutte meno una). */
  move: number | null;
  /** Attacco continuo: si ritira da solo finché si conquista o non si può più. */
  blitz: boolean;
}

export interface LoadedBoard {
  id: string;
  hash: string;
  def: BoardDef;
  geo: BoardGeometry;
}

interface Session {
  online: OnlineState;
  board: LoadedBoard | null;
  view: GameView | null;
  log: LoggedEvent[];
  /** Ultimi eventi arrivati come novità (non al rientro): per suoni, lampi e dadi. */
  fresh: { events: LoggedEvent[]; at: number } | null;
  notice: string | null;
  /** Numero della mossa mandata e non ancora confermata dal server. */
  sending: number | null;
  draft: Draft;
  hover: string | null;

  create(name: string, color: string, settings: LobbySettings): void;
  join(game: string, name: string, color?: string): void;
  /** All'avvio: rientra nella partita salvata nel browser (se il link non ne indica un'altra). */
  resume(): boolean;
  send(msg: ClientMsg): void;
  leave(): void;
  markChatRead(): void;
  reportProblem(text: string): void;
  setNotice(text: string | null): void;
  setHover(id: string | null): void;
  clickTerritory(id: string | null, how: { shift: boolean; right: boolean }): void;
  patchDraft(patch: Partial<Draft>): void;
  /** Toglie le armate messe e non confermate. */
  resetPlacements(): void;
  confirmPlacement(): void;
  /** Inizio partita: obiettivo letto. */
  ready(): void;
  playSet(cards: [string, string, string]): void;
  attack(blitz?: boolean): void;
  stopBlitz(): void;
  occupy(armies: number): void;
  fortify(): void;
  endAttack(): void;
  endTurn(): void;
}

const emptyOnline: OnlineState = {
  game: null,
  me: null,
  lobby: null,
  publicUrl: null,
  connected: false,
  deadline: null,
  paused: null,
  total: null,
  chat: [],
  unread: 0,
};

const emptyDraft: Draft = { selected: null, target: null, placements: {}, dice: null, occupy: null, move: null, blitz: false };

const LOG_KEEP = 300;
/** Se il server non risponde a una mossa entro tanto, si sblocca comunque l'interfaccia. */
const SEND_TIMEOUT_MS = 8000;
/** Pausa tra un tiro e l'altro dell'attacco continuo: il tempo di vedere i dadi. */
const BLITZ_STEP_MS = 420;

let net: Net | null = null;
let token: string | null = null;
let actCounter = 0;
let sendTimer: ReturnType<typeof setTimeout> | null = null;
let blitzTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------- tabellone

const boards = new Map<string, Promise<LoadedBoard>>();

/** Scarica dal server (una volta per versione) e prepara un tabellone. */
export function fetchBoard(id: string, hash: string): Promise<LoadedBoard> {
  const key = `${id}:${hash}`;
  let p = boards.get(key);
  if (!p) {
    p = fetch(`/tabelloni/${id}.json?v=${encodeURIComponent(hash)}`).then(async (res) => {
      if (!res.ok) throw new Error(`Tabellone ${id}: risposta ${res.status} dal server`);
      const def = BoardDef.parse(await res.json());
      return { id, hash, def, geo: buildGeometry(def) };
    });
    boards.set(key, p);
    p.catch(() => boards.delete(key));
  }
  return p;
}

/** Il tabellone predefinito del server, per lo sfondo della pagina iniziale. */
export async function fetchDefaultBoard(): Promise<LoadedBoard | null> {
  try {
    const res = await fetch('/tabelloni');
    if (!res.ok) return null;
    const list = (await res.json()) as (BoardSummary & { hash: string })[];
    const first = list[0];
    return first ? await fetchBoard(first.id, first.hash) : null;
  } catch {
    return null;
  }
}

/** Nome di un territorio del tabellone caricato. */
export function territoryName(board: LoadedBoard | null, id: string): string {
  return board?.def.territories.find((t) => t.id === id)?.name ?? id;
}

// ---------------------------------------------------------------- segnalazioni

/** Quanto serve a capire una segnalazione: fase, mossa in preparazione, ultimo avviso, browser. */
function clientContext(s: Session): string {
  return JSON.stringify({
    game: s.online.game,
    me: s.online.me,
    phase: s.view?.phase ?? s.online.lobby?.phase ?? null,
    turn: s.view?.turn?.number ?? null,
    draft: s.draft,
    sending: s.sending,
    notice: s.notice,
    connected: s.online.connected,
    viewport: `${innerWidth}x${innerHeight}`,
    browser: navigator.userAgent,
  });
}

const sentErrors = new Set<string>();
const MAX_ERROR_REPORTS = 10;

/** Manda al server un errore dell'interfaccia (senza doppioni, al massimo 10 per sessione). */
export function reportClientError(err: unknown, extra = ''): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const key = `${error.message}\n${error.stack?.split('\n')[1] ?? ''}`;
  if (!net || sentErrors.has(key) || sentErrors.size >= MAX_ERROR_REPORTS) return;
  sentErrors.add(key);
  const detail = `${error.stack ?? error.message}\n${extra}\n${clientContext(useSession.getState())}`;
  net.send({ t: 'report', kind: 'error', text: error.message.slice(0, 2000) || 'Errore senza messaggio', detail: detail.slice(0, 8000) });
}

// ---------------------------------------------------------------- sessione

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Cosa sto facendo adesso: quando cambia, le scelte in corso ripartono da capo. */
function moveKey(view: GameView, move: MyMove): string {
  const setupLeft = view.players.reduce((n, p) => n + p.setupLeft, 0);
  return `${view.phase}:${view.turn?.number ?? 0}:${view.setupPlayer ?? ''}:${move.kind}:${setupLeft}`;
}

export const useSession = create<Session>((set, get) => {
  const patchOnline = (patch: Partial<OnlineState>) => set({ online: { ...get().online, ...patch } });
  const notice = (text: string) => {
    sfx.play('error');
    set({ notice: text });
  };
  const rules = () => get().online.lobby?.rules ?? null;
  const currentMove = (): MyMove | null => {
    const { view, online } = get();
    const r = rules();
    if (!view || !r) return null;
    const left = online.lobby?.players.find((p) => p.id === online.me)?.left ?? false;
    return myMove(view, online.me, r, left);
  };

  function connect() {
    net?.close();
    // contano solo i messaggi della connessione in uso: quella lasciata può ancora rispondere per un attimo
    const conn: Net = new Net(
      (msg) => net === conn && onServer(msg),
      (connected) => net === conn && patchOnline({ connected }),
      () => (token ? { t: 'hello', token } : null),
    );
    net = conn;
  }

  function onServer(msg: ServerMsg) {
    const s = get();
    switch (msg.t) {
      case 'server':
        patchOnline({ publicUrl: msg.publicUrl });
        return;
      case 'welcome':
        token = msg.token;
        saveSession({ game: msg.game, token: msg.token });
        setGameInUrl(msg.game);
        patchOnline({ game: msg.game, me: msg.you });
        return;
      case 'lobby': {
        const prev = s.online.lobby;
        patchOnline({ lobby: msg.lobby });
        if (prev && msg.lobby.players.length > prev.players.length && msg.lobby.phase === 'lobby') sfx.play('join');
        const want = msg.lobby.board;
        if (s.board?.id !== want.id || s.board.hash !== want.hash) {
          fetchBoard(want.id, want.hash)
            .then((board) => set({ board }))
            .catch((err: unknown) => {
              set({ notice: 'Non riesco a scaricare il tabellone: controlla la connessione e ricarica la pagina' });
              reportClientError(err);
            });
        }
        return;
      }
      case 'game':
        return onGame(msg);
      case 'status': {
        // l'orologio del server può essere avanti o indietro: conta solo quanto manca
        const skew = Date.now() - msg.now;
        patchOnline({ deadline: msg.deadline === null ? null : msg.deadline + skew, paused: msg.paused, total: msg.total });
        return;
      }
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
        if (msg.ack !== undefined && msg.ack === s.sending) {
          clearTimeout(sendTimer!);
          set({ sending: null, draft: { ...get().draft, blitz: false } });
        }
        // token di una partita che non c'è più: si torna all'inizio
        if (/Sessione scaduta|Partita non trovata/.test(msg.message) && !s.online.me) {
          saveSession(null);
          token = null;
          net?.close();
          net = null;
          set({ online: { ...emptyOnline }, view: null, log: [], notice: msg.message });
          return;
        }
        notice(msg.message);
        return;
      case 'kicked':
        saveSession(null);
        token = null;
        net?.close();
        net = null;
        setGameInUrl(null);
        set({ online: { ...emptyOnline }, view: null, log: [], draft: emptyDraft, notice: msg.reason });
        return;
    }
  }

  function onGame(msg: Extract<ServerMsg, { t: 'game' }>) {
    const s = get();
    const before = s.view;
    const r = rules();
    // registro: al rientro si riparte dagli ultimi eventi, altrimenti si aggiungono quelli nuovi
    const last = s.log.at(-1)?.seq ?? 0;
    const added = msg.sync ? [] : msg.log.filter((e) => e.seq > last);
    const log = msg.sync ? msg.log : [...s.log, ...added].slice(-LOG_KEEP);
    const answered = msg.sync || (msg.ack !== undefined && msg.ack === s.sending);
    if (answered && sendTimer) clearTimeout(sendTimer);

    let draft = s.draft;
    if (r && s.online.me) {
      const left = s.online.lobby?.players.find((p) => p.id === s.online.me)?.left ?? false;
      const now = myMove(msg.view, s.online.me, r, left);
      const was = before ? myMove(before, s.online.me, r, left) : null;
      if (!before || moveKey(before, was!) !== moveKey(msg.view, now)) {
        // dopo un'occupazione si resta pronti ad attaccare dal territorio appena preso (se si può)
        let selected: string | null = null;
        if (was?.kind === 'occupy' && now.kind === 'attack') {
          const strong = (id: string) => (msg.view.territories[id]?.armies ?? 0) >= 2;
          selected = strong(was.to) ? was.to : strong(was.from) ? was.from : null;
        }
        draft = { ...emptyDraft, selected };
      } else if (draft.selected) {
        // il territorio scelto non è più mio, o non ha più armate per attaccare: si lascia
        const sel = msg.view.territories[draft.selected];
        const mine = sel?.owner === s.online.me;
        if (now.kind === 'attack' && (!mine || sel.armies < 2)) draft = { ...draft, selected: mine ? draft.selected : null, target: null, blitz: false };
        if (draft.target && msg.view.territories[draft.target]?.owner === s.online.me && now.kind !== 'fortify') draft = { ...draft, target: null };
      }
    }
    set({
      view: msg.view,
      log,
      fresh: added.length > 0 ? { events: added, at: performance.now() } : s.fresh,
      draft,
      ...(answered ? { sending: null } : {}),
    });
    if (answered && !msg.sync) continueBlitz();
  }

  /** Attacco continuo: se si può, il prossimo tiro parte da solo. */
  function continueBlitz() {
    const s = get();
    const d = s.draft;
    if (!d.blitz || !s.view) return;
    const move = currentMove();
    const from = d.selected ? s.view.territories[d.selected] : null;
    const to = d.target ? s.view.territories[d.target] : null;
    const r = rules()!;
    if (move?.kind !== 'attack' || !from || !to || to.owner === s.online.me || maxDice(r, from.armies) < 1) {
      set({ draft: { ...d, blitz: false } });
      return;
    }
    if (blitzTimer) clearTimeout(blitzTimer);
    blitzTimer = setTimeout(() => {
      if (get().draft.blitz) get().attack(true);
    }, BLITZ_STEP_MS);
  }

  function act(action: Action): boolean {
    if (!net || get().sending !== null) return false;
    const n = ++actCounter;
    set({ sending: n });
    net.send({ t: 'act', action, n });
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
      // nessuna risposta (linea caduta?): si sblocca, al rientro arriva comunque la partita aggiornata
      if (get().sending === n) set({ sending: null, draft: { ...get().draft, blitz: false } });
    }, SEND_TIMEOUT_MS);
    return true;
  }

  const setDraft = (patch: Partial<Draft>) => set({ draft: { ...get().draft, ...patch } });

  return {
    online: emptyOnline,
    board: null,
    view: null,
    log: [],
    fresh: null,
    notice: null,
    sending: null,
    draft: emptyDraft,
    hover: null,

    create(name, color, settings) {
      token = null;
      set({ online: { ...emptyOnline }, view: null, log: [], draft: emptyDraft });
      connect();
      net!.send({ t: 'create', name, color, settings });
    },
    join(game, name, color) {
      token = null;
      set({ online: { ...emptyOnline, game }, view: null, log: [], draft: emptyDraft });
      connect();
      net!.send({ t: 'join', game, name, ...(color ? { color } : {}) });
    },
    resume() {
      // già collegati (in sviluppo React esegue due volte gli effetti dell'avvio)
      if (net) return true;
      const saved = loadSession();
      const linked = gameFromUrl();
      if (!saved || (linked && linked !== saved.game)) return false;
      token = saved.token;
      set({ online: { ...emptyOnline, game: saved.game } });
      connect();
      return true;
    },
    send(msg) {
      net?.send(msg);
    },
    leave() {
      // la connessione si chiude poco dopo (il messaggio deve partire), ma le sue risposte non contano più:
      // altrimenti la partita appena lasciata ricomparirebbe con "sei fuori"
      const old = net;
      net = null;
      old?.send({ t: 'leave' });
      setTimeout(() => old?.close(), 300);
      token = null;
      saveSession(null);
      setGameInUrl(null);
      set({ online: { ...emptyOnline }, view: null, log: [], draft: emptyDraft, fresh: null });
    },
    markChatRead() {
      if (get().online.unread > 0) patchOnline({ unread: 0 });
    },
    reportProblem(text) {
      net?.send({ t: 'report', kind: 'feedback', text, detail: clientContext(get()).slice(0, 8000) });
    },
    setNotice(text) {
      set({ notice: text });
    },
    setHover(id) {
      if (get().hover !== id) set({ hover: id });
    },
    patchDraft: setDraft,
    resetPlacements() {
      setDraft({ placements: {} });
    },

    clickTerritory(id, { shift, right }) {
      const s = get();
      const { view, board } = s;
      const r = rules();
      const move = currentMove();
      if (!view || !r || !board || !move) return;
      const d = s.draft;
      if (id === null) {
        if (d.selected || d.target) setDraft({ selected: null, target: null, blitz: false });
        return;
      }
      const me = s.online.me;
      const name = (x: string) => territoryName(board, x);
      const neighbours = board.geo.neighbours;

      if (move.kind === 'pick') {
        if (right) return;
        const t = view.territories[id];
        if (t) return notice(`${name(id)} è già ${t.owner === me ? 'tuo' : `di ${view.players.find((p) => p.id === t.owner)?.name ?? ''}`}: scegline uno libero.`);
        if (act({ kind: 'pick', territory: id })) sfx.play('pickup');
        return;
      }

      const t = view.territories[id];
      if (!t) return;
      const mine = t.owner === me;

      if (move.kind === 'place') {
        if (!mine) return notice('Le armate si mettono solo sui tuoi territori.');
        const cur = d.placements[id] ?? 0;
        if (right) {
          if (cur === 0) return;
          const placements = { ...d.placements };
          if (cur === 1) delete placements[id];
          else placements[id] = cur - 1;
          sfx.play('remove');
          return setDraft({ placements, selected: id });
        }
        const room = move.budget - sum(d.placements);
        if (room <= 0) return notice('Hai già messo tutte le armate: conferma, o togline qualcuna con il tasto destro.');
        sfx.play('pickup');
        return setDraft({ placements: { ...d.placements, [id]: cur + (shift ? room : 1) }, selected: id });
      }

      if (move.kind === 'attack') {
        if (right) return setDraft({ selected: null, target: null, blitz: false });
        if (mine) {
          if (d.selected === id) return setDraft({ selected: null, target: null });
          if (t.armies < 2) {
            setDraft({ selected: id, target: null });
            return notice(`Da ${name(id)} non si può attaccare: serve almeno 2 armate.`);
          }
          sfx.play('select');
          return setDraft({ selected: id, target: null, dice: null, blitz: false });
        }
        // territorio nemico: se il mio scelto non ci confina, si prende il mio confinante più forte
        let from = d.selected;
        if (!from || !attackTargets(view, r, neighbours, from).some((x) => x.id === id)) {
          const best = (neighbours.get(id) ?? [])
            .filter((n) => view.territories[n]?.owner === me && view.territories[n]!.armies >= 2)
            .sort((a, b) => view.territories[b]!.armies - view.territories[a]!.armies)[0];
          if (!best) return notice(`Nessun tuo territorio confinante con ${name(id)} ha abbastanza armate per attaccare.`);
          from = best;
        }
        const target = attackTargets(view, r, neighbours, from).find((x) => x.id === id)!;
        if (target.protectedBy) {
          const who = view.players.find((p) => p.id === target.protectedBy)?.name ?? '';
          return notice(`${who} ha un solo territorio: nessuno può essere eliminato prima della fine del ${r.elimination.protectedRounds}° giro.`);
        }
        // secondo clic sullo stesso bersaglio: si tira
        if (d.selected === from && d.target === id) return get().attack();
        sfx.play('select');
        return setDraft({ selected: from, target: id, blitz: false, ...(from !== d.selected ? { dice: null } : {}) });
      }

      if (move.kind === 'fortify') {
        if (right) return setDraft({ selected: null, target: null });
        if (!mine) return notice('A fine turno si spostano armate solo tra i tuoi territori.');
        if (d.selected && d.selected !== id && moveTargets(view, r, neighbours, d.selected).includes(id)) {
          sfx.play('select');
          return setDraft({ target: id, move: null });
        }
        if (d.selected === id) return setDraft({ selected: null, target: null });
        if (t.armies < 2) {
          setDraft({ selected: id, target: null });
          return notice(`Da ${name(id)} non si può spostare: almeno un'armata deve restare.`);
        }
        sfx.play('select');
        return setDraft({ selected: id, target: null, move: null });
      }

      // non tocca a me: si guarda soltanto
      setDraft({ selected: d.selected === id ? null : id, target: null });
    },

    ready() {
      if (currentMove()?.kind === 'briefing' && act({ kind: 'ready' })) sfx.play('ready');
    },
    confirmPlacement() {
      const move = currentMove();
      const d = get().draft;
      if (move?.kind !== 'place') return;
      const placed = sum(d.placements);
      if (placed !== move.budget) return notice(`Mancano ${move.budget - placed} armate da mettere.`);
      if (act({ kind: move.setup ? 'setup-place' : 'reinforce', placements: d.placements })) sfx.play('ready');
    },
    playSet(cards) {
      if (act({ kind: 'play-set', cards })) sfx.play('buy');
    },
    attack(blitz) {
      const s = get();
      const { selected, target, dice } = s.draft;
      const r = rules();
      if (!s.view || !r || !selected || !target) return;
      const max = maxDice(r, s.view.territories[selected]?.armies ?? 0);
      if (max < 1) return notice('Serve almeno un’armata in più dei dadi che tiri.');
      if (act({ kind: 'attack', from: selected, to: target, dice: dice === null ? max : Math.min(dice, max) })) {
        sfx.play('attack');
        if (blitz !== undefined) setDraft({ blitz });
      }
    },
    stopBlitz() {
      if (blitzTimer) clearTimeout(blitzTimer);
      setDraft({ blitz: false });
    },
    occupy(armies) {
      if (act({ kind: 'occupy', armies })) sfx.play('move');
    },
    fortify() {
      const s = get();
      const { selected, target, move } = s.draft;
      if (!s.view || !selected || !target) return;
      const max = (s.view.territories[selected]?.armies ?? 1) - 1;
      if (act({ kind: 'fortify', from: selected, to: target, armies: Math.min(move ?? max, max) })) sfx.play('move');
    },
    endAttack() {
      if (act({ kind: 'end-attack' })) sfx.play('ready');
    },
    endTurn() {
      if (act({ kind: 'end-turn' })) sfx.play('ready');
    },
  };
});
