/** Collegamento WebSocket al server, con riconnessione automatica e coda dei messaggi. */
import type { ClientMsg, ServerMsg } from '@onpeace/protocol';

const SESSION_KEY = 'onpeace.session';

export interface SavedSession {
  game: string;
  token: string;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: SavedSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // archiviazione non disponibile (es. navigazione privata): si rientra solo dal link
  }
}

/** Codice partita dal link d'invito (?g=abc123). */
export function gameFromUrl(): string | null {
  return new URLSearchParams(location.search).get('g');
}

export function setGameInUrl(game: string | null): void {
  const url = new URL(location.href);
  if (game) url.searchParams.set('g', game);
  else url.searchParams.delete('g');
  history.replaceState(null, '', url);
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Link d'invito: con l'indirizzo pubblico del server (tunnel) se c'è, così funziona anche
 * quando l'host gioca da localhost; altrimenti l'indirizzo della pagina.
 */
export function inviteLink(game: string, publicUrl: string | null): string {
  const url = publicUrl ? new URL('/', publicUrl) : new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('g', game);
  return url.toString();
}

/** Il link d'invito funzionerebbe solo su questo PC. */
export const inviteIsLocalOnly = (publicUrl: string | null) => !publicUrl && LOCAL_HOSTS.has(location.hostname);

/** Dopo l'ultimo messaggio, quanto si aspetta prima di chiudere: il tempo che parta davvero. */
const FLUSH_MS = 300;

export class Net {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private retry = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Da chiudere appena la coda è partita (closeAfterFlush a linea caduta). */
  private closing = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onMessage: (msg: ServerMsg) => void,
    private readonly onStatus: (connected: boolean) => void,
    /** Messaggio da mandare a ogni (ri)connessione, es. hello con il token. */
    private readonly greeting: () => ClientMsg | null,
  ) {
    this.open();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus(true);
      const hello = this.greeting();
      if (hello) ws.send(JSON.stringify(hello));
      for (const m of this.queue.splice(0)) ws.send(m);
      if (this.closing) this.closeSoon(FLUSH_MS);
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as ServerMsg);
      } catch (err) {
        console.error('Messaggio del server non valido', err);
      }
    };
    ws.onclose = () => {
      this.onStatus(false);
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.open(), delay);
    };
  }

  send(msg: ClientMsg): void {
    const text = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text);
    else this.queue.push(text);
  }

  /**
   * Chiude dopo aver consegnato i messaggi in coda: tra un attimo se la linea è aperta, altrimenti
   * appena si riconnette (prima partono il saluto col token e la coda), e comunque entro `maxMs`.
   */
  closeAfterFlush(maxMs: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.closeSoon(FLUSH_MS);
      return;
    }
    this.closing = true;
    this.closeSoon(maxMs);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.ws?.close();
  }

  private closeSoon(ms: number): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.close(), ms);
  }
}
