/** Tutte le partite del server: creazione, ingresso, token di rientro, salvataggi, timer. */
import { randomBytes } from 'node:crypto';
import type { GameContext, NavGrid, PlayerId } from '@onpeace/engine';
import type { ClientMsg, LobbySettings, ServerMsg } from '@onpeace/protocol';
import { consoleLogger, type Logger } from './log';
import { Room, type RoomSnapshot, type Seat } from './room';

/** Se un salvataggio fallisce (es. file bloccato da OneDrive o dall'antivirus) si riprova dopo questo tempo. */
const SAVE_RETRY_MS = 1500;

export interface Persistence {
  save(snapshot: RoomSnapshot): void;
  loadAll(): RoomSnapshot[];
}

export interface Transport {
  send(room: string, player: PlayerId, msg: ServerMsg): void;
  isConnected(room: string, player: PlayerId): boolean;
}

/** Codici partita corti e leggibili (niente lettere ambigue). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function gameCode(): string {
  const bytes = randomBytes(6);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly pendingSave = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly ctx: GameContext,
    private readonly nav: NavGrid,
    private readonly store: Persistence,
    private readonly transport: Transport,
    private readonly now: () => number = Date.now,
    private readonly saveDelayMs = 400,
    readonly log: Logger = consoleLogger,
  ) {}

  private deps(id: string) {
    return {
      ctx: this.ctx,
      nav: this.nav,
      now: this.now,
      send: (player: PlayerId, msg: ServerMsg) => this.transport.send(id, player, msg),
      changed: (room: Room) => this.scheduleSave(room, this.saveDelayMs),
      isConnected: (player: PlayerId) => this.transport.isConnected(id, player),
      log: this.log,
    };
  }

  /** Ricarica le partite salvate (dopo un riavvio del PC). */
  loadSaved(): number {
    for (const snap of this.store.loadAll()) {
      if (snap.phase === 'ended' && this.now() - snap.updatedAt > 7 * 24 * 3600 * 1000) continue;
      // il tempo del turno riparte: chi era a metà turno non lo perde per il riavvio
      if (snap.deadline !== null) snap.deadline = Math.max(snap.deadline, this.now() + 60_000);
      this.rooms.set(snap.id, new Room(snap.id, this.deps(snap.id), snap));
    }
    return this.rooms.size;
  }

  create(name: string, color: string, settings: LobbySettings): { room: Room; seat: Seat } {
    let id = gameCode();
    while (this.rooms.has(id)) id = gameCode();
    const room = new Room(id, this.deps(id));
    this.rooms.set(id, room);
    // la stanza nasce vuota: il primo posto è dell'host
    const seat = room.addSeat(name, color) as Seat;
    room.handle(seat.id, { t: 'settings', settings });
    this.log.info(`Partita ${id}: creata da ${name}`);
    return { room, seat };
  }

  join(gameId: string, name: string, color?: string): { room: Room; seat: Seat } | string {
    const room = this.rooms.get(gameId.toLowerCase());
    if (!room) return 'Partita non trovata: controlla il link';
    const seat = room.addSeat(name, color);
    if (typeof seat === 'string') return seat;
    this.log.info(`Partita ${room.id}: entra ${name}`);
    return { room, seat };
  }

  byToken(token: string): { room: Room; seat: Seat } | null {
    for (const room of this.rooms.values()) {
      const seat = room.seatByToken(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  handle(roomId: string, player: PlayerId, msg: ClientMsg): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return 'Partita non trovata';
    return room.handle(player, msg);
  }

  /** Segnalazione di un giocatore: va nel registro, con lo stato della partita se l'ha scritta lui. */
  report(roomId: string | null, player: PlayerId | null, msg: Extract<ClientMsg, { t: 'report' }>): void {
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const name = room?.seats.find((x) => x.id === player)?.name ?? null;
    const turn = room?.state?.turn ?? null;
    const snapshot =
      msg.kind === 'feedback' && room ? this.log.dump(`segnalazione-${room.id}-turno${turn ?? 0}`, room.snapshot()) : null;
    this.log.report({
      kind: msg.kind,
      game: roomId,
      player,
      name,
      phase: room?.phase ?? null,
      turn,
      text: msg.text,
      detail: msg.detail ?? null,
      snapshot,
    });
    const who = name ?? 'un giocatore non ancora in partita';
    this.log.info(`Segnalazione (${msg.kind}) da ${who}${roomId ? ` nella partita ${roomId}` : ''}: ${msg.text.slice(0, 160)}`);
  }

  tick(): void {
    for (const room of this.rooms.values()) {
      try {
        room.tick();
      } catch (err) {
        this.log.error(`Partita ${room.id}: errore nel timer`, err);
      }
    }
  }

  private scheduleSave(room: Room, delayMs: number): void {
    const prev = this.pendingSave.get(room.id);
    if (prev) clearTimeout(prev);
    this.pendingSave.set(
      room.id,
      setTimeout(() => {
        this.pendingSave.delete(room.id);
        if (!this.saveNow(room)) this.scheduleSave(room, SAVE_RETRY_MS);
      }, delayMs),
    );
  }

  private saveNow(room: Room): boolean {
    try {
      this.store.save(room.snapshot());
      return true;
    } catch (err) {
      this.log.error(`Partita ${room.id}: salvataggio non riuscito, riprovo`, err);
      return false;
    }
  }

  /** Salva subito tutto (alla chiusura del server). */
  flush(): void {
    for (const [id, t] of this.pendingSave) {
      clearTimeout(t);
      const room = this.rooms.get(id);
      if (room) this.saveNow(room);
    }
    this.pendingSave.clear();
  }
}
