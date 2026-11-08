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

export function inviteLink(game: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('g', game);
  return url.toString();
}

export class Net {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private retry = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

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

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
