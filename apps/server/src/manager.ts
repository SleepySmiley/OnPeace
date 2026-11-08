/** Tutte le partite del server: creazione, ingresso, token di rientro, salvataggi, timer. */
import { randomBytes } from 'node:crypto';
import type { GameContext, NavGrid, PlayerId } from '@onpeace/engine';
import type { ClientMsg, LobbySettings, ServerMsg } from '@onpeace/protocol';
import { Room, type RoomSnapshot, type Seat } from './room';

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
  ) {}

  private deps(id: string) {
    return {
      ctx: this.ctx,
      nav: this.nav,
      now: this.now,
      send: (player: PlayerId, msg: ServerMsg) => this.transport.send(id, player, msg),
      changed: (room: Room) => this.scheduleSave(room),
      isConnected: (player: PlayerId) => this.transport.isConnected(id, player),
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
    return { room, seat };
  }

  join(gameId: string, name: string, color?: string): { room: Room; seat: Seat } | string {
    const room = this.rooms.get(gameId.toLowerCase());
    if (!room) return 'Partita non trovata: controlla il link';
    const seat = room.addSeat(name, color);
    if (typeof seat === 'string') return seat;
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

  tick(): void {
    for (const room of this.rooms.values()) {
      try {
        room.tick();
      } catch (err) {
        console.error(`Errore nella partita ${room.id}:`, err);
      }
    }
  }

  private scheduleSave(room: Room): void {
    const prev = this.pendingSave.get(room.id);
    if (prev) clearTimeout(prev);
    this.pendingSave.set(
      room.id,
      setTimeout(() => {
        this.pendingSave.delete(room.id);
        this.store.save(room.snapshot());
      }, this.saveDelayMs),
    );
  }

  /** Salva subito tutto (alla chiusura del server). */
  flush(): void {
    for (const [id, t] of this.pendingSave) {
      clearTimeout(t);
      const room = this.rooms.get(id);
      if (room) this.store.save(room.snapshot());
    }
    this.pendingSave.clear();
  }
}
