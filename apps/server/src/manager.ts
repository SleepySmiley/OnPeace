/** Tutte le partite del server: creazione, ingresso, token di rientro, salvataggi, timer. */
import { randomBytes } from 'node:crypto';
import type { ClientMsg, LobbySettings, ServerMsg } from '@onpeace/protocol';
import type { BoardProvider } from './boards';
import { consoleLogger, type Logger } from './log';
import { Room, type RoomSnapshot, type Seat } from './room';

type PlayerId = string;

/** Se un salvataggio fallisce (es. file bloccato da OneDrive o dall'antivirus) si riprova dopo questo tempo. */
const SAVE_RETRY_MS = 1500;
/** Tetto alle partite sul server: chiunque abbia il link del tunnel può crearne, e ognuna è un file. */
const MAX_ROOMS = 200;
/** Tetto agli stati di partita allegati alle segnalazioni, per avvio del server (il disco non è infinito). */
const MAX_REPORT_DUMPS = 100;
/** Partite finite, o sale d'attesa mai partite, ferme da più di così: si cancellano al riavvio. */
const STALE_MS = 7 * 24 * 3600 * 1000;

export interface Persistence {
  save(snapshot: RoomSnapshot): void;
  loadAll(): RoomSnapshot[];
  remove(id: string): void;
}

export interface Transport {
  send(room: string, player: PlayerId, msg: ServerMsg): void;
  isConnected(room: string, player: PlayerId): boolean;
  /** Chiude le connessioni di un giocatore (es. espulso). */
  disconnect(room: string, player: PlayerId): void;
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
  private reportDumps = 0;

  constructor(
    private readonly boards: BoardProvider,
    private readonly store: Persistence,
    private readonly transport: Transport,
    private readonly now: () => number = Date.now,
    private readonly saveDelayMs = 400,
    readonly log: Logger = consoleLogger,
  ) {}

  private deps(id: string) {
    return {
      boards: this.boards,
      now: this.now,
      send: (player: PlayerId, msg: ServerMsg) => this.transport.send(id, player, msg),
      changed: (room: Room) => this.scheduleSave(room, this.saveDelayMs),
      isConnected: (player: PlayerId) => this.transport.isConnected(id, player),
      disconnect: (player: PlayerId) => this.transport.disconnect(id, player),
      log: this.log,
    };
  }

  /** Ricarica le partite salvate (dopo un riavvio del PC). */
  loadSaved(): number {
    for (const snap of this.store.loadAll()) {
      // partite finite o sale d'attesa ferme da tempo, sale rimaste vuote: via anche il file
      const stale = (snap.phase === 'ended' || snap.phase === 'lobby') && this.now() - snap.updatedAt > STALE_MS;
      if (stale || snap.seats.length === 0) {
        this.removeFile(snap.id);
        continue;
      }
      // partita cominciata con un tabellone che nel frattempo ha cambiato territori: non si può riprendere
      // (il file resta dov'è: se il tabellone torna com'era, la partita riparte)
      if (snap.state && !this.sameTerritories(snap)) {
        this.log.error(`Partita ${snap.id}: il tabellone "${snap.board}" è cambiato o non c'è più, la partita non si può riprendere`);
        continue;
      }
      // il tempo del turno riparte: chi era a metà turno non lo perde per il riavvio
      if (snap.deadline !== null) snap.deadline = Math.max(snap.deadline, this.now() + 60_000);
      this.rooms.set(snap.id, new Room(snap.id, this.deps(snap.id), snap));
    }
    return this.rooms.size;
  }

  private sameTerritories(snap: RoomSnapshot): boolean {
    if (!snap.state || !snap.board || !this.boards.has(snap.board)) return false;
    const ids = new Set(this.boards.territoryIds(snap.board));
    const saved = Object.keys(snap.state.territories);
    return saved.length === ids.size && saved.every((t) => ids.has(t));
  }

  /**
   * Si può creare una partita? Al tetto si fa posto togliendo la sala d'attesa più vecchia senza
   * nessuno collegato: così le sale abbandonate (o create a raffica) non bloccano il server per sempre.
   */
  canCreate(): boolean {
    if (this.rooms.size < MAX_ROOMS) return true;
    const idle = [...this.rooms.values()]
      .filter((r) => r.phase === 'lobby' && r.seats.every((s) => !this.transport.isConnected(r.id, s.id)))
      .sort((a, b) => a.snapshot().updatedAt - b.snapshot().updatedAt)[0];
    if (idle) this.remove(idle);
    return this.rooms.size < MAX_ROOMS;
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
    const error = room.handle(player, msg);
    // se ne sono andati tutti dalla sala d'attesa: la partita sparisce, file compreso
    if (room.seats.length === 0) this.remove(room);
    return error;
  }

  private remove(room: Room): void {
    clearTimeout(this.pendingSave.get(room.id));
    this.pendingSave.delete(room.id);
    this.rooms.delete(room.id);
    this.removeFile(room.id);
    this.log.info(`Partita ${room.id}: chiusa, non c'è più nessuno`);
  }

  private removeFile(id: string): void {
    try {
      this.store.remove(id);
    } catch (err) {
      this.log.error(`Partita ${id}: file non cancellato`, err);
    }
  }

  /** Segnalazione di un giocatore: va nel registro, con lo stato della partita se l'ha scritta lui. */
  report(roomId: string | null, player: PlayerId | null, msg: Extract<ClientMsg, { t: 'report' }>): void {
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const name = room?.seats.find((x) => x.id === player)?.name ?? null;
    const turn = room?.state?.turn?.number ?? null;
    const snapshot =
      msg.kind === 'feedback' && room && this.reportDumps++ < MAX_REPORT_DUMPS
        ? this.log.dump(`segnalazione-${room.id}-turno${turn ?? 0}`, room.snapshot())
        : null;
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
    // già in programma: non si rimanda, così un via vai continuo di messaggi non blocca il salvataggio
    // (al momento di salvare si prende lo stato più recente)
    if (this.pendingSave.has(room.id)) return;
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
