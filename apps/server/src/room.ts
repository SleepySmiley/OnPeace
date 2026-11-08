/**
 * Una partita online: sala d'attesa, scelta dei paesi, turni con timer.
 * Non sa nulla di socket: riceve messaggi già validati e risponde tramite `deps.send`.
 */
import { randomBytes } from 'node:crypto';
import {
  RuleError,
  affordableCountries,
  createGame,
  eliminate,
  eventsFor,
  finishSelection,
  getPlayer,
  nextPicker,
  resolveTurn,
  selectCountry,
  viewFor,
  type Action,
  type GameContext,
  type GameState,
  type NavGrid,
  type PlayerId,
  type TurnEvent,
} from '@onpeace/engine';
import {
  PLAYER_COLORS,
  asActions,
  type ChatLine,
  type ClientMsg,
  type LobbyInfo,
  type LobbySettings,
  type RoomPhase,
  type ServerMsg,
} from '@onpeace/protocol';

export interface Seat {
  id: PlayerId;
  token: string;
  name: string;
  color: string;
  inactiveTurns: number;
}

export interface RoomSnapshot {
  version: 1;
  id: string;
  hostId: PlayerId;
  phase: RoomPhase;
  seats: Seat[];
  settings: LobbySettings;
  state: GameState | null;
  plans: Record<PlayerId, Action[]>;
  done: PlayerId[];
  skipped: PlayerId[];
  deadline: number | null;
  events: TurnEvent[];
  eventsTurn: number;
  chat: ChatLine[];
  nextSeat: number;
  updatedAt: number;
}

export interface RoomDeps {
  ctx: GameContext;
  nav: NavGrid;
  now: () => number;
  send: (player: PlayerId, msg: ServerMsg) => void;
  /** Lo stato della stanza è cambiato: va salvato. */
  changed: (room: Room) => void;
  isConnected: (player: PlayerId) => boolean;
}

export const MAX_PLAYERS = 8;
const CHAT_KEEP = 200;

export const newToken = () => randomBytes(18).toString('base64url');

export class Room {
  private s: RoomSnapshot;

  constructor(
    readonly id: string,
    private readonly deps: RoomDeps,
    snapshot?: RoomSnapshot,
  ) {
    this.s = snapshot ?? {
      version: 1,
      id,
      hostId: '',
      phase: 'lobby',
      seats: [],
      settings: {},
      state: null,
      plans: {},
      done: [],
      skipped: [],
      deadline: null,
      events: [],
      eventsTurn: 0,
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

  // ---------------------------------------------------------------- posti

  /** Nuovo giocatore nella sala d'attesa. Restituisce il posto o un messaggio d'errore. */
  addSeat(name: string, color?: string): Seat | string {
    if (this.s.phase !== 'lobby') return 'La partita è già cominciata';
    if (this.s.seats.length >= MAX_PLAYERS) return 'La partita è piena';
    if (this.s.seats.some((x) => x.name.toLowerCase() === name.toLowerCase())) return 'Nome già usato in questa partita';
    const used = new Set(this.s.seats.map((x) => x.color));
    const chosen = color && !used.has(color) ? color : PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0]!;
    const seat: Seat = { id: `p${this.s.nextSeat++}`, token: newToken(), name, color: chosen, inactiveTurns: 0 };
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
  handle(player: PlayerId, msg: ClientMsg): string | null {
    const seat = this.s.seats.find((x) => x.id === player);
    if (!seat) return 'Non fai parte di questa partita';
    try {
      switch (msg.t) {
        case 'color':
          return this.setColor(seat, msg.color);
        case 'settings':
          if (player !== this.s.hostId) return "Solo chi ha creato la partita può cambiare le opzioni";
          if (this.s.phase !== 'lobby') return 'Le opzioni si cambiano solo prima di cominciare';
          this.s.settings = { ...this.s.settings, ...msg.settings };
          this.touch();
          this.broadcastLobby();
          return null;
        case 'start':
          return this.start(player);
        case 'pick':
          return this.pick(player, msg.country);
        case 'plan':
          return this.setPlan(player, asActions(msg.actions));
        case 'ready':
          return this.setReady(player, msg.done);
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

  private start(player: PlayerId): string | null {
    if (player !== this.s.hostId) return 'Solo chi ha creato la partita può cominciare';
    if (this.s.phase !== 'lobby') return 'La partita è già cominciata';
    if (this.s.seats.length < 2) return 'Servono almeno due giocatori';
    const { ctx } = this.deps;
    this.s.state = createGame(ctx, {
      id: this.id,
      seed: randomBytes(4).readUInt32LE(0),
      players: this.s.seats.map((x) => ({ id: x.id, name: x.name, color: x.color })),
      settings: this.s.settings,
    });
    this.s.phase = 'selection';
    this.s.skipped = [];
    this.s.deadline = this.deps.now() + ctx.rules.game.countrySelectSeconds * 1000;
    this.touch();
    this.broadcastAll();
    return null;
  }

  private picker(): PlayerId | null {
    if (this.s.phase !== 'selection' || !this.s.state) return null;
    return nextPicker(this.s.state, this.deps.ctx, new Set(this.s.skipped));
  }

  private pick(player: PlayerId, country: string): string | null {
    if (this.s.phase !== 'selection' || !this.s.state) return 'Non è il momento di scegliere i paesi';
    if (this.picker() !== player) return 'Non tocca a te scegliere';
    selectCountry(this.s.state, this.deps.ctx, player, country);
    this.afterPick();
    return null;
  }

  private afterPick(): void {
    const { ctx, now } = this.deps;
    if (this.picker() === null) {
      finishSelection(this.s.state!);
      this.s.phase = 'playing';
      this.s.deadline = now() + this.turnSeconds() * 1000;
    } else {
      this.s.deadline = now() + ctx.rules.game.countrySelectSeconds * 1000;
    }
    this.touch();
    this.broadcastAll();
  }

  private turnSeconds(): number {
    return this.s.state?.settings.turnSeconds ?? this.deps.ctx.rules.turn.defaultSeconds;
  }

  private activePlayers(): PlayerId[] {
    return this.s.state ? this.s.state.players.filter((p) => p.status === 'active').map((p) => p.id) : [];
  }

  private setPlan(player: PlayerId, actions: Action[]): string | null {
    if (this.s.phase !== 'playing') return 'La partita non è in corso';
    if (!this.activePlayers().includes(player)) return 'Non sei più in gioco';
    this.s.plans[player] = actions;
    this.touch();
    return null;
  }

  private setReady(player: PlayerId, done: boolean): string | null {
    if (this.s.phase !== 'playing') return 'La partita non è in corso';
    if (!this.activePlayers().includes(player)) return 'Non sei più in gioco';
    const set = new Set(this.s.done);
    if (done) set.add(player);
    else set.delete(player);
    this.s.done = [...set];
    this.touch();
    if (this.activePlayers().every((p) => set.has(p))) this.resolve();
    else this.broadcastStatus();
    return null;
  }

  private kick(by: PlayerId, target: PlayerId): string | null {
    if (by !== this.s.hostId) return "Solo chi ha creato la partita può espellere";
    if (by === target) return 'Non puoi espellere te stesso';
    const seat = this.s.seats.find((x) => x.id === target);
    if (!seat) return 'Giocatore inesistente';
    if (this.s.phase === 'lobby') {
      this.s.seats = this.s.seats.filter((x) => x !== seat);
    } else {
      const need = this.deps.ctx.rules.game.kickAfterInactiveTurns;
      if (seat.inactiveTurns < need) return `Si può espellere solo chi è inattivo da ${need} turni`;
      this.removeFromGame(target);
    }
    this.deps.send(target, { t: 'kicked', reason: 'Sei stato espulso dalla partita' });
    this.touch();
    this.broadcastAll();
    return null;
  }

  private leave(player: PlayerId): string | null {
    if (this.s.phase === 'lobby') {
      this.s.seats = this.s.seats.filter((x) => x.id !== player);
      if (this.s.hostId === player) this.s.hostId = this.s.seats[0]?.id ?? '';
    } else {
      this.removeFromGame(player);
      if (this.s.hostId === player) {
        this.s.hostId = this.s.state!.players.find((p) => p.status === 'active')?.id ?? this.s.hostId;
      }
    }
    this.touch();
    this.broadcastAll();
    return null;
  }

  private removeFromGame(player: PlayerId): void {
    const state = this.s.state;
    // a partita finita uscire non cambia più nulla
    if (!state || this.s.phase === 'ended' || getPlayer(state, player).status !== 'active') return;
    const events: TurnEvent[] = [];
    eliminate(state, player, events);
    getPlayer(state, player).status = 'left';
    delete this.s.plans[player];
    this.s.done = this.s.done.filter((x) => x !== player);
    if (this.s.phase === 'selection') this.s.skipped.push(player);
  }

  // ---------------------------------------------------------------- tempo

  /** Da chiamare ogni secondo: scadenze della scelta e dei turni. */
  tick(): void {
    const { now, ctx } = this.deps;
    if (this.s.deadline === null || now() < this.s.deadline) return;
    if (this.s.phase === 'selection' && this.s.state) {
      const who = this.picker();
      if (!who) return;
      const options = affordableCountries(this.s.state, ctx, who);
      if (options.length === 0) {
        this.s.skipped.push(who);
      } else {
        // scelta automatica: un paese a caso tra quelli alla sua portata
        selectCountry(this.s.state, ctx, who, options[Math.floor(Math.random() * options.length)]!);
      }
      this.afterPick();
    } else if (this.s.phase === 'playing') {
      this.resolve();
    }
  }

  private resolve(): void {
    const state = this.s.state;
    if (!state || this.s.phase !== 'playing') return;
    const done = new Set(this.s.done);
    for (const id of this.activePlayers()) {
      const seat = this.s.seats.find((x) => x.id === id);
      if (!seat) continue;
      const idle = (this.s.plans[id]?.length ?? 0) === 0 && !done.has(id);
      seat.inactiveTurns = idle ? seat.inactiveTurns + 1 : 0;
    }
    const result = resolveTurn(state, this.deps.ctx, this.deps.nav, this.s.plans);
    this.s.events = result.events;
    this.s.eventsTurn = state.turn;
    this.s.state = result.state;
    this.s.plans = {};
    this.s.done = [];
    if (result.state.phase === 'ended') {
      this.s.phase = 'ended';
      this.s.deadline = null;
    } else {
      this.s.deadline = this.deps.now() + this.turnSeconds() * 1000;
    }
    this.touch();
    this.broadcastAll();
  }

  // ---------------------------------------------------------------- invii

  private touch(): void {
    this.s.updatedAt = this.deps.now();
    this.deps.changed(this);
  }

  lobbyInfo(): LobbyInfo {
    return {
      id: this.id,
      hostId: this.s.hostId,
      phase: this.s.phase,
      mapName: this.deps.ctx.map.name,
      players: this.s.seats.map((x) => ({
        id: x.id,
        name: x.name,
        color: x.color,
        connected: this.deps.isConnected(x.id),
        inactiveTurns: x.inactiveTurns,
      })),
      settings: this.s.state?.settings ?? this.s.settings,
    };
  }

  private statusMsg(): ServerMsg {
    const done = new Set(this.s.done);
    return {
      t: 'status',
      deadline: this.s.deadline,
      waiting: this.s.phase === 'playing' ? this.activePlayers().filter((p) => !done.has(p)) : [],
      picker: this.picker(),
      now: this.deps.now(),
    };
  }

  private gameMsg(player: PlayerId): ServerMsg | null {
    const state = this.s.state;
    if (!state) return null;
    return {
      t: 'game',
      view: viewFor(state, this.deps.ctx, player),
      plan: this.s.plans[player] ?? [],
      events: eventsFor(this.s.events, state, this.deps.ctx, player),
      eventsTurn: this.s.eventsTurn,
    };
  }

  broadcastLobby(): void {
    const lobby = this.lobbyInfo();
    for (const x of this.s.seats) this.deps.send(x.id, { t: 'lobby', lobby });
  }

  broadcastStatus(): void {
    const status = this.statusMsg();
    for (const x of this.s.seats) this.deps.send(x.id, status);
  }

  broadcastAll(): void {
    this.broadcastLobby();
    for (const x of this.s.seats) {
      const game = this.gameMsg(x.id);
      if (game) this.deps.send(x.id, game);
    }
    this.broadcastStatus();
  }

  /** Tutto ciò che serve a un giocatore che si (ri)collega. */
  syncPlayer(player: PlayerId): void {
    this.deps.send(player, { t: 'lobby', lobby: this.lobbyInfo() });
    const game = this.gameMsg(player);
    if (game) this.deps.send(player, game);
    this.deps.send(player, this.statusMsg());
    this.deps.send(player, { t: 'chat', lines: this.s.chat.slice(-50) });
  }
}
