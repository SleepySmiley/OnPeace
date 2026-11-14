/**
 * Messaggi tra browser e server (JSON su WebSocket) per il gioco di conquista.
 * I messaggi del client sono validati con zod dal server: non ci si fida mai del client.
 */
import { z } from 'zod';
import { ActionS, type ConquestRules, type GameEvent, type GameView } from '@onpeace/conquista';

/**
 * Colori dei giocatori (client e server usano la stessa tavolozza): blu, rosso, verde, giallo,
 * viola, arancione, azzurro, rosa. Sul tabellone due giocatori qualsiasi possono confinare, quindi
 * conta la distanza tra TUTTE le coppie: in visione normale ogni coppia è ad almeno ΔE 16 (OKLab
 * ×100), con deuteranopia e protanopia ad almeno 7,5. L'ordine (i primi colori sono quelli
 * proposti per primi) fa parte della scelta. Ogni stile del tabellone li ridisegna nella sua
 * tavolozza (stesso ordine), il colore scelto qui resta l'identità del giocatore.
 */
export const PLAYER_COLORS = ['#4a8ff0', '#c42f2f', '#2f9e6a', '#eccf3e', '#7a44c8', '#f58a2a', '#5fd3e6', '#e266b8'];

const Id = z.string().min(1).max(64);

/** Opzioni che l'host sceglie nella sala d'attesa (quelle non indicate vengono dalle regole). */
export const SettingsS = z
  .object({
    /** Tabellone (data/territori/<id>.json). */
    board: Id,
    /** Obiettivi segreti o conquista del mondo. */
    mode: z.enum(['objectives', 'conquest']),
    /** Piazzamento iniziale: a giri come al tavolo, o tutti insieme alla cieca. */
    placement: z.enum(['rounds', 'simultaneous']),
    /** Durata di un turno. */
    turnSeconds: z.number().int().min(30).max(900),
  })
  .partial();
export type LobbySettings = z.infer<typeof SettingsS>;
export type RoomSettings = Required<LobbySettings>;

const Name = z.string().trim().min(1).max(18);
// in minuscolo: "#4A8FF0" e "#4a8ff0" sono lo stesso colore anche per il controllo "già preso"
const Color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((c) => c.toLowerCase());

export const ClientMsgS = z.discriminatedUnion('t', [
  /** Primo messaggio: con il token si rientra nella propria partita. */
  z.object({ t: z.literal('hello'), token: z.string().max(100).optional() }),
  z.object({ t: z.literal('create'), name: Name, color: Color, settings: SettingsS }),
  z.object({ t: z.literal('join'), game: Id, name: Name, color: Color.optional() }),
  z.object({ t: z.literal('color'), color: Color }),
  z.object({ t: z.literal('settings'), settings: SettingsS }),
  z.object({ t: z.literal('start') }),
  /**
   * Una mossa della partita (piazzare, tris, attacco, occupazione, spostamento, fine turno).
   * `n`: numero scelto dal client, il server lo rimanda nella risposta (`ack`) per dire a quale mossa risponde.
   */
  z.object({ t: z.literal('act'), action: ActionS, n: z.number().int().min(0).max(2 ** 31).optional() }),
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(300) }),
  z.object({ t: z.literal('kick'), player: Id }),
  z.object({ t: z.literal('leave') }),
  /** Solo l'host: ferma o fa ripartire il tempo. */
  z.object({ t: z.literal('pause'), paused: z.boolean() }),
  /**
   * Segnalazione per chi sviluppa: scritta dal giocatore ("feedback") o mandata dal browser quando
   * l'interfaccia va in errore ("error"). Il server la scrive in logs/segnalazioni.jsonl.
   */
  z.object({
    t: z.literal('report'),
    kind: z.enum(['feedback', 'error']),
    text: z.string().trim().min(1).max(2000),
    /** Pila dell'errore e contesto del browser (schermata, fase, ultimo avviso…). */
    detail: z.string().max(8000).optional(),
  }),
]);
export type ClientMsg = z.infer<typeof ClientMsgS>;

export type RoomPhase = 'lobby' | 'playing' | 'ended';

/** Perché il tempo è fermo: l'ha fermato l'host, o il server non riesce ad andare avanti. */
export type PauseReason = 'host' | 'error';

export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  /** Uscito dalla partita (o tolto dall'host): le sue armate restano, il server muove al posto suo. */
  left: boolean;
  /** Turni di fila in cui non ha fatto nulla (gli è scaduto il tempo). */
  idleTurns: number;
}

/** Un tabellone tra cui scegliere nella sala d'attesa. */
export interface BoardSummary {
  id: string;
  name: string;
  description: string;
  territories: number;
  continents: number;
}

export interface LobbyInfo {
  id: string;
  hostId: string;
  phase: RoomPhase;
  /** Il tabellone della partita, con l'impronta del file (il client lo scarica da /tabelloni/<id>.json). */
  board: BoardSummary & { hash: string };
  /** I tabelloni disponibili sul server. */
  boards: BoardSummary[];
  players: LobbyPlayer[];
  /** Opzioni in vigore (quelle scelte dall'host, il resto dalle regole). */
  settings: RoomSettings;
  /** Regole della partita, già con le opzioni dell'host. */
  rules: ConquestRules;
  /** Dopo quanti turni saltati di fila l'host può togliere un giocatore dalla partita. */
  kickAfterIdle: number;
}

/** Evento della partita con il suo numero progressivo (per non mostrarlo due volte) e l'ora. */
export interface LoggedEvent {
  seq: number;
  at: number;
  event: GameEvent;
}

export interface ChatLine {
  from: string;
  name: string;
  color: string;
  text: string;
  at: number;
}

export type ServerMsg =
  /**
   * Appena collegati (e quando cambia): l'indirizzo pubblico del server (il tunnel), da usare
   * nel link d'invito anche se l'host gioca da localhost. Null se il server è raggiungibile solo in locale.
   */
  | { t: 'server'; publicUrl: string | null }
  | { t: 'welcome'; token: string; game: string; you: string }
  | { t: 'lobby'; lobby: LobbyInfo }
  | {
      t: 'game';
      /** La partita come la vede questo giocatore (carte e obiettivi altrui coperti). */
      view: GameView;
      /** Eventi nuovi (o, se `sync`, gli ultimi della partita) che il giocatore può conoscere. */
      log: LoggedEvent[];
      /** Messaggio di riallineamento (ingresso, rientro): gli eventi sono storia, non novità da animare. */
      sync: boolean;
      /** Solo a chi ha fatto la mossa: il suo numero (`n` del messaggio "act"). */
      ack?: number;
    }
  | {
      t: 'status';
      /** Scadenza del tempo in corso (ms epoch), o null (anche quando il tempo è fermo). */
      deadline: number | null;
      /** Tempo fermo: perché, e quanto ne resterà alla ripresa (ms). */
      paused: { reason: PauseReason; remainingMs: number } | null;
      /** Durata intera del tempo in corso (ms), per la barra che si accorcia. */
      total: number | null;
      /** Ora del server, per correggere l'orologio del client. */
      now: number;
    }
  | { t: 'chat'; lines: ChatLine[] }
  /** `ack`: la mossa rifiutata (`n` del messaggio "act"). */
  | { t: 'error'; message: string; ack?: number }
  /** Avviso non di errore (es. "segnalazione ricevuta"). */
  | { t: 'notice'; message: string }
  | { t: 'kicked'; reason: string };

export function parseClientMsg(raw: string): ClientMsg | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: 'Messaggio non valido' };
  }
  const r = ClientMsgS.safeParse(data);
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Messaggio non valido' };
  return r.data;
}
