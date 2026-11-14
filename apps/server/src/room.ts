/**
 * Una partita online: sala d'attesa, scelta dei paesi, turni con timer.
 * Non sa nulla di socket: riceve messaggi già validati e risponde tramite `deps.send`.
 */
import { randomBytes } from 'node:crypto';
import {
  RuleError,
  affordableCountries,
  checkDoctrine,
  createGame,
  defaultSettings,
  eliminate,
  eventsFor,
  finishSelection,
  getPlayer,
  nextPicker,
  resolveTurn,
  selectCountry,
  setDoctrine,
  viewFor,
  type Action,
  type Doctrine,
  type GameState,
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
  type PauseReason,
  type RoomPhase,
  type ServerMsg,
} from '@onpeace/protocol';
import { describeError, type Logger } from './log';
import type { MapProvider, MapWorld } from './maps';

export interface Seat {
  id: PlayerId;
  token: string;
  name: string;
  color: string;
  inactiveTurns: number;
  /** Strategia e Generale scelti in sala d'attesa (assente nei salvataggi vecchi). */
  doctrine?: Doctrine;
}

const NO_DOCTRINE: Doctrine = { strategy: null, general: [] };

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
  /** Tempo fermo (assente nei salvataggi vecchi): perché, e quanto ne resterà alla ripresa. */
  paused?: { reason: PauseReason; remainingMs: number } | null;
  events: TurnEvent[];
  eventsTurn: number;
  chat: ChatLine[];
  nextSeat: number;
  updatedAt: number;
}

export interface RoomDeps {
  /** Le mappe: ogni stanza usa quella scelta dall'host. */
  maps: MapProvider;
  now: () => number;
  send: (player: PlayerId, msg: ServerMsg) => void;
  /** Lo stato della stanza è cambiato: va salvato. */
  changed: (room: Room) => void;
  isConnected: (player: PlayerId) => boolean;
  log: Logger;
}

export const MAX_PLAYERS = 8;
const CHAT_KEEP = 200;
/** Alla ripresa dopo una pausa restano almeno questi millisecondi. */
const RESUME_MIN_MS = 15_000;

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
      paused: null,
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

  /** Mappa della partita: quella della partita in corso, altrimenti quella scelta nella sala d'attesa. */
  get mapId(): string {
    const id = this.s.state?.mapId ?? this.s.settings.map;
    return id && this.deps.maps.has(id) ? id : this.deps.maps.defaultId;
  }

  /** Contesto delle regole e griglia di navigazione della mappa della partita. */
  private get world(): MapWorld {
    return this.deps.maps.get(this.mapId);
  }

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
          if (msg.settings.map !== undefined && !this.deps.maps.has(msg.settings.map)) return 'Mappa sconosciuta';
          this.s.settings = { ...this.s.settings, ...msg.settings };
          this.touch();
          this.broadcastLobby();
          return null;
        case 'start':
          return this.start(player);
        case 'pick':
          return this.pick(player, msg.country);
        case 'doctrine':
          return this.setDoctrine(seat, { strategy: msg.strategy, general: msg.general });
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

  /** In sala d'attesa la dottrina resta nel posto; durante la scelta dei paesi va nello stato. */
  private setDoctrine(seat: Seat, doctrine: Doctrine): string | null {
    const { ctx } = this.world;
    if (this.s.phase === 'lobby') {
      const errors = checkDoctrine(ctx, { ...defaultSettings(ctx), ...this.s.settings }, doctrine);
      if (errors.length > 0) return errors.join('; ');
      seat.doctrine = doctrine;
      this.touch();
      this.deps.send(seat.id, { t: 'lobby', lobby: this.lobbyInfo(seat.id) });
      return null;
    }
    if (this.s.phase !== 'selection' || !this.s.state) return 'Strategia e Generale si scelgono prima del turno 1';
    setDoctrine(this.s.state, ctx, seat.id, doctrine);
    seat.doctrine = doctrine;
    this.touch();
    this.deps.send(seat.id, { t: 'lobby', lobby: this.lobbyInfo(seat.id) });
    const game = this.gameMsg(seat.id);
    if (game) this.deps.send(seat.id, game);
    return null;
  }

  private start(player: PlayerId): string | null {
    if (player !== this.s.hostId) return 'Solo chi ha creato la partita può cominciare';
    if (this.s.phase !== 'lobby') return 'La partita è già cominciata';
    if (this.s.seats.length < 2) return 'Servono almeno due giocatori';
    const { ctx } = this.world;
    const { map: _map, ...settings } = this.s.settings;
    this.s.state = createGame(ctx, {
      id: this.id,
      seed: randomBytes(4).readUInt32LE(0),
      players: this.s.seats.map((x) => ({
        id: x.id,
        name: x.name,
        color: x.color,
        ...(x.doctrine ? { doctrine: x.doctrine } : {}),
      })),
      settings,
    });
    this.s.phase = 'selection';
    this.s.skipped = [];
    this.setTimer(ctx.rules.game.countrySelectSeconds * 1000);
    this.deps.log.info(`Partita ${this.id}: comincia con ${this.s.seats.map((x) => x.name).join(', ')}`);
    this.touch();
    this.broadcastAll();
    return null;
  }

  private picker(): PlayerId | null {
    if (this.s.phase !== 'selection' || !this.s.state) return null;
    return nextPicker(this.s.state, this.world.ctx, new Set(this.s.skipped));
  }

  private pick(player: PlayerId, country: string): string | null {
    if (this.s.phase !== 'selection' || !this.s.state) return 'Non è il momento di scegliere i paesi';
    if (this.picker() !== player) return 'Non tocca a te scegliere';
    selectCountry(this.s.state, this.world.ctx, player, country);
    this.afterPick();
    return null;
  }

  private afterPick(): void {
    const { ctx } = this.world;
    if (this.picker() === null) {
      finishSelection(this.s.state!, ctx);
      this.s.phase = 'playing';
      this.setTimer(this.turnSeconds() * 1000);
    } else {
      this.setTimer(ctx.rules.game.countrySelectSeconds * 1000);
    }
    this.touch();
    this.broadcastAll();
  }

  private turnSeconds(): number {
    return this.s.state?.settings.turnSeconds ?? this.world.ctx.rules.turn.defaultSeconds;
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
    if (!this.resolveIfAllDone()) this.broadcastStatus();
    return null;
  }

  /** Se tutti quelli ancora in gioco hanno finito, il turno si risolve subito. */
  private resolveIfAllDone(): boolean {
    const active = this.activePlayers();
    if (this.s.phase !== 'playing' || active.length === 0) return false;
    const done = new Set(this.s.done);
    if (!active.every((p) => done.has(p))) return false;
    this.resolve();
    return true;
  }

  private kick(by: PlayerId, target: PlayerId): string | null {
    if (by !== this.s.hostId) return "Solo chi ha creato la partita può espellere";
    if (by === target) return 'Non puoi espellere te stesso';
    const seat = this.s.seats.find((x) => x.id === target);
    if (!seat) return 'Giocatore inesistente';
    if (this.s.phase === 'lobby') {
      this.s.seats = this.s.seats.filter((x) => x !== seat);
    } else {
      const need = this.world.ctx.rules.game.kickAfterInactiveTurns;
      if (seat.inactiveTurns < need) return `Si può espellere solo chi è inattivo da ${need} turni`;
      this.removeFromGame(target);
      seat.token = newToken(); // il vecchio token non fa più rientrare
    }
    this.deps.send(target, { t: 'kicked', reason: 'Sei stato espulso dalla partita' });
    this.deps.log.info(`Partita ${this.id}: espulso ${seat.name}`);
    this.touch();
    this.broadcastAll();
    this.resolveIfAllDone();
    return null;
  }

  private leave(player: PlayerId): string | null {
    const name = this.s.seats.find((x) => x.id === player)?.name ?? player;
    if (this.s.phase === 'lobby') {
      this.s.seats = this.s.seats.filter((x) => x.id !== player);
      if (this.s.hostId === player) this.s.hostId = this.s.seats[0]?.id ?? '';
    } else {
      this.removeFromGame(player);
      if (this.s.hostId === player) {
        this.s.hostId = this.s.state!.players.find((p) => p.status === 'active')?.id ?? this.s.hostId;
      }
    }
    this.deps.log.info(`Partita ${this.id}: esce ${name}`);
    this.touch();
    this.broadcastAll();
    this.resolveIfAllDone();
    return null;
  }

  private removeFromGame(player: PlayerId): void {
    const state = this.s.state;
    // a partita finita uscire non cambia più nulla
    if (!state || this.s.phase === 'ended' || getPlayer(state, player).status !== 'active') return;
    const wasPicking = this.picker() === player;
    const events: TurnEvent[] = [];
    eliminate(state, player, events);
    getPlayer(state, player).status = 'left';
    delete this.s.plans[player];
    this.s.done = this.s.done.filter((x) => x !== player);
    if (this.s.phase === 'selection') {
      this.s.skipped.push(player);
      // se toccava a lui (o non resta nessuno da aspettare) la scelta va avanti, col tempo che riparte
      if (wasPicking || this.picker() === null) this.afterPick();
    }
  }

  // ---------------------------------------------------------------- tempo

  /** Fa partire il tempo della fase in corso; se il tempo è fermo, lo mette da parte per la ripresa. */
  private setTimer(ms: number): void {
    if (this.s.paused) {
      this.s.paused.remainingMs = ms;
      this.s.deadline = null;
    } else {
      this.s.deadline = this.deps.now() + ms;
    }
  }

  private setPaused(player: PlayerId, paused: boolean): string | null {
    if (player !== this.s.hostId) return 'Solo chi ha creato la partita può fermare il tempo';
    if (this.s.phase !== 'selection' && this.s.phase !== 'playing') return 'Non c’è un tempo da fermare';
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

  /** Da chiamare ogni secondo: scadenze della scelta e dei turni. */
  tick(): void {
    const { now } = this.deps;
    const { ctx } = this.world;
    if (this.s.paused || this.s.deadline === null || now() < this.s.deadline) return;
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
    const { log } = this.deps;
    const started = performance.now();
    const outcome = this.tryResolve(state);
    if (!outcome) {
      // non si risolve nemmeno senza ordini: la partita resta ferma finché non si corregge il motore
      this.s.paused = { reason: 'error', remainingMs: this.turnSeconds() * 1000 };
      this.s.deadline = null;
      this.touch();
      for (const x of this.s.seats) {
        this.deps.send(x.id, {
          t: 'error',
          message: 'Il server non riesce a risolvere il turno: partita ferma. L’errore è stato registrato.',
        });
      }
      this.broadcastStatus();
      return;
    }
    const { result, dropped } = outcome;
    const done = new Set(this.s.done);
    for (const id of this.activePlayers()) {
      const seat = this.s.seats.find((x) => x.id === id);
      if (!seat) continue;
      const idle = (this.s.plans[id]?.length ?? 0) === 0 && !done.has(id);
      seat.inactiveTurns = idle ? seat.inactiveTurns + 1 : 0;
    }
    for (const p of dropped) {
      this.deps.send(p, {
        t: 'error',
        message: `Errore del server: i tuoi ordini del turno ${state.turn} sono stati annullati. Il problema è stato registrato.`,
      });
    }
    this.s.events = result.events;
    this.s.eventsTurn = state.turn;
    this.s.state = result.state;
    this.s.plans = {};
    this.s.done = [];
    if (this.s.paused?.reason === 'error') this.s.paused = null;
    if (result.state.phase === 'ended') {
      this.s.phase = 'ended';
      this.s.deadline = null;
      this.s.paused = null;
      log.info(`Partita ${this.id}: finita al turno ${state.turn}`);
    } else {
      this.setTimer(this.turnSeconds() * 1000);
    }
    log.info(`Partita ${this.id}: turno ${state.turn} risolto in ${Math.round(performance.now() - started)} ms`);
    this.touch();
    this.broadcastAll();
  }

  /**
   * Risolve il turno. Se il motore va in errore, salva tutto per riprodurlo e riprova togliendo
   * gli ordini di un giocatore alla volta, poi senza ordini: un errore del motore costa al massimo
   * gli ordini di un turno, non la serata.
   */
  private tryResolve(state: GameState): { result: ReturnType<typeof resolveTurn>; dropped: PlayerId[] } | null {
    const { log } = this.deps;
    const { ctx, nav } = this.world;
    const run = (plans: Record<PlayerId, Action[]>) => resolveTurn(state, ctx, nav, plans);
    try {
      return { result: run(this.s.plans), dropped: [] };
    } catch (err) {
      log.error(`Partita ${this.id}: la risoluzione del turno ${state.turn} è fallita`, err);
      const file = log.dump(`${this.id}-turno${state.turn}`, { error: describeError(err), state, plans: this.s.plans });
      if (file) log.info(`Dati per riprodurre l'errore: ${file}`);
    }
    const withOrders = Object.keys(this.s.plans).filter((p) => (this.s.plans[p]?.length ?? 0) > 0);
    for (const p of withOrders) {
      const rest = { ...this.s.plans };
      delete rest[p];
      try {
        const result = run(rest);
        log.info(`Partita ${this.id}: turno ${state.turn} risolto senza gli ordini di ${p}`);
        return { result, dropped: [p] };
      } catch {
        // non erano i suoi ordini: si prova con il prossimo
      }
    }
    try {
      const result = run({});
      log.info(`Partita ${this.id}: turno ${state.turn} risolto senza ordini`);
      return { result, dropped: withOrders };
    } catch (err) {
      log.error(`Partita ${this.id}: il turno ${state.turn} non si risolve neanche senza ordini`, err);
      return null;
    }
  }

  // ---------------------------------------------------------------- invii

  private touch(): void {
    this.s.updatedAt = this.deps.now();
    this.deps.changed(this);
  }

  /** Le informazioni della sala d'attesa come le vede il giocatore (con la sua dottrina). */
  lobbyInfo(player?: PlayerId): LobbyInfo {
    const seat = this.s.seats.find((x) => x.id === player);
    const statePlayer = this.s.state?.players.find((p) => p.id === player);
    const doctrine: Doctrine = statePlayer
      ? { strategy: statePlayer.strategy, general: statePlayer.generalUpgrades ?? [] }
      : (seat?.doctrine ?? NO_DOCTRINE);
    return {
      id: this.id,
      hostId: this.s.hostId,
      phase: this.s.phase,
      mapId: this.mapId,
      mapName: this.world.ctx.map.name,
      maps: this.deps.maps.summaries(),
      players: this.s.seats.map((x) => ({
        id: x.id,
        name: x.name,
        color: x.color,
        connected: this.deps.isConnected(x.id),
        inactiveTurns: x.inactiveTurns,
      })),
      settings: this.s.state?.settings ?? this.s.settings,
      doctrine,
    };
  }

  private statusMsg(): ServerMsg {
    const done = new Set(this.s.done);
    return {
      t: 'status',
      deadline: this.s.deadline,
      paused: this.s.paused ?? null,
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
      view: viewFor(state, this.world.ctx, player),
      plan: this.s.plans[player] ?? [],
      events: eventsFor(this.s.events, state, this.world.ctx, player),
      eventsTurn: this.s.eventsTurn,
    };
  }

  broadcastLobby(): void {
    for (const x of this.s.seats) this.deps.send(x.id, { t: 'lobby', lobby: this.lobbyInfo(x.id) });
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
    this.deps.send(player, { t: 'lobby', lobby: this.lobbyInfo(player) });
    const game = this.gameMsg(player);
    if (game) this.deps.send(player, game);
    this.deps.send(player, this.statusMsg());
    this.deps.send(player, { t: 'chat', lines: this.s.chat.slice(-50) });
  }
}
