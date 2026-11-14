/**
 * Una partita online del gioco di conquista: sala d'attesa, mosse una alla volta con il tempo
 * che scorre per chi deve giocare, chi esce resta sul tabellone e il server muove al posto suo.
 * Non sa nulla di socket: riceve messaggi già validati e risponde tramite `deps.send`.
 */
import { randomBytes } from 'node:crypto';
import { RuleError } from '@onpeace/engine';
import {
  applyAction,
  createGame,
  eventsFor,
  passFor,
  playersToAct,
  timeout,
  viewFor,
  type Action,
  type ActionResult,
  type GameContext,
  type GameEvent,
  type GameState,
} from '@onpeace/conquista';
import {
  PLAYER_COLORS,
  type ChatLine,
  type ClientMsg,
  type LobbyInfo,
  type LobbySettings,
  type LoggedEvent,
  type PauseReason,
  type RoomPhase,
  type RoomSettings,
  type ServerMsg,
} from '@onpeace/protocol';
import type { BoardProvider } from './boards';
import { describeError, type Logger } from './log';

export interface Seat {
  id: string;
  token: string;
  name: string;
  color: string;
  /** Turni di fila in cui gli è scaduto il tempo senza che facesse nulla. */
  idleTurns: number;
  /** Uscito dalla partita o tolto dall'host: le sue armate restano, il server muove al posto suo. */
  left?: boolean;
}

export interface RoomSnapshot {
  version: 2;
  id: string;
  hostId: string;
  phase: RoomPhase;
  seats: Seat[];
  settings: LobbySettings;
  /** Tabellone della partita e impronta del suo file quando è cominciata (null in sala d'attesa). */
  board: string | null;
  boardHash: string | null;
  state: GameState | null;
  /** Ultimi eventi della partita, tutti: a ciascuno si mandano filtrati al momento dell'invio. */
  log: LoggedEvent[];
  nextSeq: number;
  deadline: number | null;
  paused: { reason: PauseReason; remainingMs: number } | null;
  /** Durata intera del tempo in corso (ms). */
  clockTotal: number | null;
  /** Che cosa misura il tempo in corso: cambia a ogni turno o giro di piazzamento. */
  clock: string | null;
  /** Chi ha fatto almeno una mossa da quando è partito il tempo in corso. */
  acted: string[];
  chat: ChatLine[];
  nextSeat: number;
  updatedAt: number;
}

export interface RoomDeps {
  /** I tabelloni con regole e obiettivi. */
  boards: BoardProvider;
  now: () => number;
  send: (player: string, msg: ServerMsg) => void;
  /** Lo stato della stanza è cambiato: va salvato. */
  changed: (room: Room) => void;
  isConnected: (player: string) => boolean;
  /** Chiude le connessioni del giocatore. */
  disconnect: (player: string) => void;
  log: Logger;
}

const CHAT_KEEP = 200;
/** Eventi tenuti nella partita (per chi rientra e per le segnalazioni). */
const LOG_KEEP = 300;
/** Eventi mandati a chi entra o rientra. */
const LOG_SYNC = 120;
/** Alla ripresa dopo una pausa restano almeno questi millisecondi. */
const RESUME_MIN_MS = 15_000;
/** L'host può togliere dalla partita chi ha saltato tanti turni di fila. */
export const KICK_AFTER_IDLE = 2;

export const newToken = () => randomBytes(18).toString('base64url');

/** Che cosa misura il tempo: un giro di piazzamento (a giri), tutto il piazzamento (tutti insieme) o un turno. */
function clockKey(ctx: GameContext, state: GameState): string {
  if (state.phase === 'setup') {
    if (ctx.rules.setup.placement !== 'rounds') return 'setup';
    const left = state.players.reduce((n, p) => n + p.setupLeft, 0);
    return `setup:${state.setupPlayer}:${left}`;
  }
  return `turn:${state.turn?.number ?? 0}`;
}

export class Room {
  private s: RoomSnapshot;

  constructor(
    readonly id: string,
    private readonly deps: RoomDeps,
    snapshot?: RoomSnapshot,
  ) {
    this.s = snapshot ?? {
      version: 2,
      id,
      hostId: '',
      phase: 'lobby',
      seats: [],
      settings: {},
      board: null,
      boardHash: null,
      state: null,
      log: [],
      nextSeq: 1,
      deadline: null,
      paused: null,
      clockTotal: null,
      clock: null,
      acted: [],
      chat: [],
      nextSeat: 1,
      updatedAt: deps.now(),
    };
  }

  get phase(): RoomPhase {
    return this.s.phase;
  }

  get seats(): readonly Seat[] {
    return this.s.seats;
  }

  get state(): GameState | null {
    return this.s.state;
  }

  snapshot(): RoomSnapshot {
    return this.s;
  }

  /** Opzioni in vigore: quelle dell'host, il resto dalle regole; in partita il tabellone è quello con cui è cominciata. */
  get settings(): RoomSettings {
    const { boards } = this.deps;
    const s = this.s.settings;
    return {
      board: this.s.board ?? (s.board && boards.has(s.board) ? s.board : boards.defaultId),
      mode: s.mode && boards.rules.modes.includes(s.mode) ? s.mode : boards.rules.modes[0]!,
      placement: s.placement ?? boards.rules.setup.placement,
      turnSeconds: s.turnSeconds ?? boards.rules.timers.turnSeconds,
    };
  }

  /** Tabellone, regole (con le opzioni dell'host) e obiettivi della partita. */
  private get ctx(): GameContext {
    return this.deps.boards.context(this.settings);
  }

  private seat(id: string): Seat | undefined {
    return this.s.seats.find((x) => x.id === id);
  }

  // ---------------------------------------------------------------- posti

  /** Nuovo giocatore nella sala d'attesa. Restituisce il posto o un messaggio d'errore. */
  addSeat(name: string, color?: string): Seat | string {
    if (this.s.phase !== 'lobby') return 'La partita è già cominciata';
    if (this.s.seats.length >= this.deps.boards.rules.players.max) return 'La partita è piena';
    if (this.s.seats.some((x) => x.name.toLowerCase() === name.toLowerCase())) return 'Nome già usato in questa partita';
    const used = new Set(this.s.seats.map((x) => x.color));
    const chosen = color && !used.has(color) ? color : (PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0]!);
    const seat: Seat = { id: `p${this.s.nextSeat++}`, token: newToken(), name, color: chosen, idleTurns: 0 };
    this.s.seats.push(seat);
    if (!this.s.hostId) this.s.hostId = seat.id;
    this.touch();
    this.broadcastLobby();
    return seat;
  }

  seatByToken(token: string): Seat | undefined {
    return this.s.seats.find((x) => x.token === token);
  }

  // ---------------------------------------------------------------- messaggi

  /** Gestisce un messaggio del giocatore. Restituisce un errore da mostrargli, o null. */
  handle(player: string, msg: ClientMsg): string | null {
    const seat = this.seat(player);
    if (!seat) return 'Non fai parte di questa partita';
    try {
      switch (msg.t) {
        case 'color':
          return this.setColor(seat, msg.color);
        case 'settings':
          return this.setSettings(player, msg.settings);
        case 'start':
          return this.start(player);
        case 'act':
          return this.act(seat, msg.action, msg.n);
        case 'chat':
          this.s.chat.push({ from: player, name: seat.name, color: seat.color, text: msg.text, at: this.deps.now() });
          if (this.s.chat.length > CHAT_KEEP) this.s.chat.splice(0, this.s.chat.length - CHAT_KEEP);
          this.touch();
          for (const x of this.s.seats) this.deps.send(x.id, { t: 'chat', lines: this.s.chat.slice(-1) });
          return null;
        case 'kick':
          return this.kick(player, msg.player);
        case 'leave':
          return this.leave(player);
        case 'pause':
          return this.setPaused(player, msg.paused);
        default:
          return 'Messaggio non previsto qui';
      }
    } catch (err) {
      if (err instanceof RuleError) return err.message;
      throw err;
    }
  }

  private setColor(seat: Seat, color: string): string | null {
    if (this.s.phase !== 'lobby') return 'Il colore si sceglie prima di cominciare';
    if (this.s.seats.some((x) => x !== seat && x.color === color)) return 'Colore già preso';
    seat.color = color;
    this.touch();
    this.broadcastLobby();
    return null;
  }

  private setSettings(player: string, settings: LobbySettings): string | null {
    if (player !== this.s.hostId) return 'Solo chi ha creato la partita può cambiare le opzioni';
    if (this.s.phase !== 'lobby') return 'Le opzioni si cambiano solo prima di cominciare';
    const { boards } = this.deps;
    if (settings.board !== undefined && !boards.has(settings.board)) return 'Tabellone sconosciuto';
    if (settings.mode !== undefined && !boards.rules.modes.includes(settings.mode)) return 'Modalità non disponibile';
    this.s.settings = { ...this.s.settings, ...settings };
    this.touch();
    this.broadcastLobby();
    return null;
  }

  private start(player: string): string | null {
    if (player !== this.s.hostId) return 'Solo chi ha creato la partita può cominciare';
    if (this.s.phase !== 'lobby') return 'La partita è già cominciata';
    const settings = this.settings;
    const ctx = this.ctx;
    const { players } = ctx.rules;
    if (this.s.seats.length < players.min) return `Servono almeno ${players.min} giocatori`;
    if (settings.mode === 'objectives' && this.s.seats.length < players.objectivesMin) {
      return `Con gli obiettivi segreti servono almeno ${players.objectivesMin} giocatori: in meno si gioca alla conquista del mondo.`;
    }
    // 128 bit veri: dalla distribuzione iniziale, che è pubblica, non si ricavano obiettivi, mazzo e dadi
    const bytes = randomBytes(16);
    const seed = [0, 4, 8, 12].map((o) => bytes.readUInt32LE(o));
    const state = createGame(
      ctx,
      this.s.seats.map(({ id, name, color }) => ({ id, name, color })),
      settings.mode,
      seed,
    );
    this.s.board = settings.board;
    this.s.boardHash = this.deps.boards.hash(settings.board);
    this.s.phase = 'playing';
    this.s.log = [];
    this.s.clock = null;
    this.s.acted = [];
    for (const x of this.s.seats) x.idleTurns = 0;
    this.deps.log.info(`Partita ${this.id}: comincia con ${this.s.seats.map((x) => x.name).join(', ')}`);
    const from = this.s.nextSeq;
    this.advance({ state, events: [] });
    this.touch();
    this.broadcastAll(from);
    return null;
  }

  private act(seat: Seat, action: Action, n?: number): string | null {
    if (this.s.phase !== 'playing' || !this.s.state) return 'La partita non è in corso';
    if (seat.left) return 'Sei uscito dalla partita';
    const result = applyAction(this.ctx, this.s.state, seat.id, action);
    seat.idleTurns = 0;
    if (!this.s.acted.includes(seat.id)) this.s.acted.push(seat.id);
    const from = this.s.nextSeq;
    this.advance(result);
    this.touch();
    this.broadcastGame(from, n === undefined ? undefined : { player: seat.id, n });
    this.broadcastStatus();
    return null;
  }

  /**
   * Applica il risultato di una mossa: stato, registro, fine partita, tempo. Se adesso deve
   * muoversi qualcuno che è uscito, il server fa al posto suo quello che farebbe il tempo scaduto.
   */
  private advance(result: ActionResult): void {
    let r = result;
    for (let guard = 0; ; guard++) {
      this.s.state = r.state;
      this.record(r.events);
      if (r.state.phase === 'over') return this.finish();
      const gone = new Set(this.s.seats.filter((x) => x.left).map((x) => x.id));
      if (r.state.players.every((p) => !p.alive || gone.has(p.id))) return this.finish();
      const ctx = this.ctx;
      const due = playersToAct(ctx, r.state).filter((id) => gone.has(id));
      if (due.length === 0) break;
      if (guard > 1000) {
        this.deps.log.error(`Partita ${this.id}: le mosse automatiche per chi è uscito non finiscono`);
        break;
      }
      let state = r.state;
      const events: GameEvent[] = [];
      try {
        for (const id of due) {
          const p = passFor(ctx, state, id);
          state = p.state;
          events.push(...p.events);
        }
      } catch (err) {
        this.stuck(err, 'la mossa automatica per chi è uscito è fallita');
        break;
      }
      r = { state, events };
    }
    this.syncClock();
  }

  private record(events: readonly GameEvent[]): void {
    const at = this.deps.now();
    for (const event of events) this.s.log.push({ seq: this.s.nextSeq++, at, event });
    if (this.s.log.length > LOG_KEEP) this.s.log.splice(0, this.s.log.length - LOG_KEEP);
  }

  private finish(): void {
    this.s.phase = 'ended';
    this.s.deadline = null;
    this.s.paused = null;
    this.s.clock = null;
    this.s.clockTotal = null;
    const state = this.s.state;
    const winner = state?.players.find((p) => p.id === state.winner)?.name;
    this.deps.log.info(`Partita ${this.id}: ${winner ? `vince ${winner}` : 'chiusa, sono usciti tutti'}`);
  }

  private kick(by: string, target: string): string | null {
    if (by !== this.s.hostId) return 'Solo chi ha creato la partita può togliere un giocatore';
    if (by === target) return 'Non puoi toglierti da solo';
    const seat = this.seat(target);
    if (!seat) return 'Giocatore inesistente';
    const from = this.s.nextSeq;
    if (this.s.phase === 'lobby') {
      this.s.seats = this.s.seats.filter((x) => x !== seat);
    } else {
      if (this.s.phase === 'ended') return 'La partita è finita';
      if (seat.left) return 'Ha già lasciato la partita';
      if (seat.idleTurns < KICK_AFTER_IDLE) return `Si può togliere solo chi ha saltato ${KICK_AFTER_IDLE} turni di fila`;
      seat.token = newToken(); // il vecchio token non fa più rientrare
      this.markLeft(seat);
      this.advance({ state: this.s.state!, events: [] });
    }
    this.deps.send(target, { t: 'kicked', reason: 'Sei stato tolto dalla partita' });
    this.deps.disconnect(target); // non aspetta che sia il suo browser a chiudere
    this.deps.log.info(`Partita ${this.id}: tolto ${seat.name}`);
    this.touch();
    this.broadcastAll(from);
    return null;
  }

  private leave(player: string): string | null {
    const seat = this.seat(player)!;
    const from = this.s.nextSeq;
    if (this.s.phase === 'lobby') {
      this.s.seats = this.s.seats.filter((x) => x !== seat);
      if (this.s.hostId === player) this.s.hostId = this.s.seats[0]?.id ?? '';
    } else if (this.s.phase === 'playing' && !seat.left) {
      this.markLeft(seat);
      this.advance({ state: this.s.state!, events: [] });
    } else {
      return null; // a partita finita (o già uscito) non cambia più nulla
    }
    this.deps.log.info(`Partita ${this.id}: esce ${seat.name}`);
    this.touch();
    this.broadcastAll(from);
    return null;
  }

  private markLeft(seat: Seat): void {
    seat.left = true;
    if (this.s.hostId === seat.id) this.s.hostId = this.s.seats.find((x) => !x.left)?.id ?? this.s.hostId;
  }

  // ---------------------------------------------------------------- tempo

  /** Il tempo riparte quando cambia quello che misura (nuovo turno, nuovo giro di piazzamento). */
  private syncClock(): void {
    const state = this.s.state;
    if (!state || this.s.phase !== 'playing') return;
    const ctx = this.ctx;
    const key = clockKey(ctx, state);
    if (key === this.s.clock) return;
    this.s.clock = key;
    this.s.acted = [];
    const { timers } = ctx.rules;
    this.setTimer((state.phase === 'setup' ? timers.setupSeconds : timers.turnSeconds) * 1000);
  }

  /** Fa partire il tempo; se il tempo è fermo, lo mette da parte per la ripresa. */
  private setTimer(ms: number): void {
    this.s.clockTotal = ms;
    if (this.s.paused) {
      this.s.paused.remainingMs = ms;
      this.s.deadline = null;
    } else {
      this.s.deadline = this.deps.now() + ms;
    }
  }

  private setPaused(player: string, paused: boolean): string | null {
    if (player !== this.s.hostId) return 'Solo chi ha creato la partita può fermare il tempo';
    if (this.s.phase !== 'playing') return 'Non c’è un tempo da fermare';
    const { now } = this.deps;
    if (paused === Boolean(this.s.paused)) return null;
    if (paused) {
      this.s.paused = { reason: 'host', remainingMs: Math.max(0, (this.s.deadline ?? now()) - now()) };
      this.s.deadline = null;
    } else {
      this.s.deadline = now() + Math.max(this.s.paused!.remainingMs, RESUME_MIN_MS);
      this.s.paused = null;
    }
    this.deps.log.info(`Partita ${this.id}: tempo ${paused ? 'fermato' : 'ripartito'}`);
    this.touch();
    this.broadcastStatus();
    return null;
  }

  /** Da chiamare ogni secondo: tempo scaduto per chi doveva muoversi. */
  tick(): void {
    const { now } = this.deps;
    const state = this.s.state;
    if (this.s.phase !== 'playing' || !state || this.s.paused || this.s.deadline === null || now() < this.s.deadline) return;
    const ctx = this.ctx;
    let result: ActionResult;
    try {
      result = timeout(ctx, state);
    } catch (err) {
      this.stuck(err, 'il tempo scaduto non si riesce a chiudere');
      this.touch();
      this.broadcastStatus();
      return;
    }
    // chi doveva muoversi e non ha fatto nulla: un turno saltato in più
    for (const id of playersToAct(ctx, state)) {
      const seat = this.seat(id);
      if (seat && !seat.left && !this.s.acted.includes(id)) seat.idleTurns++;
    }
    const from = this.s.nextSeq;
    this.advance(result);
    // per sicurezza: se il tempo non è ripartito, altrimenti scatterebbe a ogni secondo
    if (this.s.phase === 'playing' && this.s.deadline !== null && now() >= this.s.deadline) {
      this.s.clock = null;
      this.syncClock();
    }
    this.touch();
    this.broadcastAll(from);
  }

  /**
   * Il motore è andato in errore: la partita si ferma (tempo in pausa) invece di cadere, con
   * tutto il necessario per riprodurre l'errore. L'host può riprovare facendo ripartire il tempo.
   */
  private stuck(err: unknown, what: string): void {
    const { log } = this.deps;
    log.error(`Partita ${this.id}: ${what}`, err);
    const file = log.dump(`${this.id}-bloccata`, { error: describeError(err), state: this.s.state });
    if (file) log.info(`Dati per riprodurre l'errore: ${file}`);
    this.s.paused = { reason: 'error', remainingMs: (this.s.clockTotal ?? 60_000) };
    this.s.deadline = null;
    for (const x of this.s.seats) {
      this.deps.send(x.id, {
        t: 'error',
        message: 'Il server non riesce ad andare avanti: partita ferma. L’errore è stato registrato.',
      });
    }
  }

  // ---------------------------------------------------------------- invii

  private touch(): void {
    this.s.updatedAt = this.deps.now();
    this.deps.changed(this);
  }

  /** Le informazioni della sala d'attesa (valgono anche durante la partita). */
  lobbyInfo(): LobbyInfo {
    const { boards } = this.deps;
    const settings = this.settings;
    const summary = boards.summaries().find((b) => b.id === settings.board)!;
    return {
      id: this.id,
      hostId: this.s.hostId,
      phase: this.s.phase,
      board: { ...summary, hash: boards.hash(settings.board) },
      boards: boards.summaries(),
      players: this.s.seats.map((x) => ({
        id: x.id,
        name: x.name,
        color: x.color,
        connected: this.deps.isConnected(x.id),
        left: Boolean(x.left),
        idleTurns: x.idleTurns,
      })),
      settings,
      rules: this.ctx.rules,
      kickAfterIdle: KICK_AFTER_IDLE,
    };
  }

  private statusMsg(): ServerMsg {
    return {
      t: 'status',
      deadline: this.s.deadline,
      paused: this.s.paused,
      total: this.s.clockTotal,
      now: this.deps.now(),
    };
  }

  /** La partita vista da un giocatore, con gli eventi da `since` in poi (null: gli ultimi, per riallinearsi). */
  private gameMsg(player: string, since: number | null): Extract<ServerMsg, { t: 'game' }> | null {
    const state = this.s.state;
    if (!state) return null;
    const entries = since === null ? this.s.log.slice(-LOG_SYNC) : this.s.log.filter((e) => e.seq >= since);
    const log = entries.flatMap((e) => eventsFor([e.event], player).map((event) => ({ seq: e.seq, at: e.at, event })));
    return { t: 'game', view: viewFor(this.ctx, state, player), log, sync: since === null };
  }

  broadcastLobby(): void {
    const lobby = this.lobbyInfo();
    for (const x of this.s.seats) this.deps.send(x.id, { t: 'lobby', lobby });
  }

  broadcastStatus(): void {
    const status = this.statusMsg();
    for (const x of this.s.seats) this.deps.send(x.id, status);
  }

  /** La partita a tutti; a chi ha fatto la mossa con il numero della mossa (`ack`). */
  private broadcastGame(since: number, ack?: { player: string; n: number }): void {
    for (const x of this.s.seats) {
      const game = this.gameMsg(x.id, since);
      if (game) this.deps.send(x.id, ack?.player === x.id ? { ...game, ack: ack.n } : game);
    }
  }

  private broadcastAll(since: number): void {
    this.broadcastLobby();
    this.broadcastGame(since);
    this.broadcastStatus();
  }

  /** Tutto ciò che serve a un giocatore che si (ri)collega. */
  syncPlayer(player: string): void {
    this.deps.send(player, { t: 'lobby', lobby: this.lobbyInfo() });
    const game = this.gameMsg(player, null);
    if (game) this.deps.send(player, game);
    this.deps.send(player, this.statusMsg());
    this.deps.send(player, { t: 'chat', lines: this.s.chat.slice(-50) });
  }
}
