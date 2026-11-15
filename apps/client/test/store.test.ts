/** Sessione: entrate rifiutate, token scaduti, uscita a linea caduta, chat non letta, attacco continuo al rientro. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '@onpeace/conquista';
import type { ChatLine, ClientMsg, ServerMsg } from '@onpeace/protocol';

interface FakeLink {
  sent: ClientMsg[];
  closed: boolean;
  flushMs: number | null;
  greeting: () => ClientMsg | null;
  deliver: (msg: ServerMsg) => void;
}

let links: FakeLink[] = [];
let store: typeof import('../src/store');
const storage = new Map<string, string>();
const loc = {
  href: 'http://localhost/',
  get search() {
    return new URL(this.href).search;
  },
  protocol: 'http:',
  host: 'localhost',
  hostname: 'localhost',
};

const state = () => store.useSession.getState();
const link = () => links.at(-1)!;
const urlGame = () => new URL(loc.href).searchParams.get('g');
const saved = () => storage.get('onpeace.session') ?? null;
const line = (from: string, at: number): ChatLine => ({ from, name: from, color: '#fff', text: `ciao ${at}`, at });

beforeEach(async () => {
  storage.clear();
  loc.href = 'http://localhost/';
  vi.stubGlobal('location', loc);
  vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, url: URL | string) => (loc.href = String(url)) });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.resetModules();
  store = await import('../src/store');
  links = [];
  store.setLinkFactory((onMessage, _onStatus, greeting) => {
    const l: FakeLink = { sent: [], closed: false, flushMs: null, greeting, deliver: onMessage };
    links.push(l);
    return {
      send: (msg) => l.sent.push(msg),
      close: () => (l.closed = true),
      closeAfterFlush: (ms) => (l.flushMs = ms),
    };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('entrata rifiutata', () => {
  it('join rifiutato: si torna alla pagina iniziale con il codice nel link', () => {
    storage.set('onpeace.session', JSON.stringify({ game: 'altra', token: 'tok' }));
    state().join('g2', 'Io');
    link().deliver({ t: 'error', message: 'La partita è già cominciata' });
    expect(state().online.game).toBeNull();
    expect(state().notice).toBe('La partita è già cominciata');
    expect(link().closed).toBe(true);
    expect(urlGame()).toBe('g2');
    // la sessione salvata di un'altra partita resta
    expect(saved()).not.toBeNull();
  });

  it('rientro all\'avvio con un token che il server non conosce più', () => {
    storage.set('onpeace.session', JSON.stringify({ game: 'g1', token: 'vecchio' }));
    expect(state().resume()).toBe(true);
    expect(link().greeting()).toEqual({ t: 'hello', token: 'vecchio' });
    link().deliver({ t: 'error', message: 'Sessione scaduta: rientra dal link' });
    expect(state().online.game).toBeNull();
    expect(saved()).toBeNull();
    expect(link().closed).toBe(true);
  });
});

describe('sessione persa durante la partita', () => {
  it('Sessione scaduta dopo una riconnessione: si torna all\'inizio, non resta una partita congelata', () => {
    state().join('g1', 'Io');
    link().deliver({ t: 'welcome', token: 't1', game: 'g1', you: 'io' });
    expect(urlGame()).toBe('g1');
    state().patchDraft({ selected: 'a', blitz: true });
    link().deliver({ t: 'error', message: 'Sessione scaduta: rientra dal link' });
    const s = state();
    expect(s.online.me).toBeNull();
    expect(s.online.game).toBeNull();
    expect(s.view).toBeNull();
    expect(s.fresh).toBeNull();
    expect(s.sending).toBeNull();
    expect(s.draft.blitz).toBe(false);
    expect(s.notice).toBe('Sessione scaduta: rientra dal link');
    expect(saved()).toBeNull();
    expect(urlGame()).toBeNull();
    expect(link().closed).toBe(true);
  });

  it('un errore qualunque in partita resta un avviso', () => {
    state().join('g1', 'Io');
    link().deliver({ t: 'welcome', token: 't1', game: 'g1', you: 'io' });
    link().deliver({ t: 'error', message: 'Non è il tuo turno' });
    expect(state().online.me).toBe('io');
    expect(state().notice).toBe('Non è il tuo turno');
    expect(link().closed).toBe(false);
  });
});

describe('Esci', () => {
  it('il collegamento lasciato tiene il suo token e chiude solo dopo aver consegnato l\'uscita', () => {
    state().create('Io', '#fff', {});
    expect(link().greeting()).toBeNull();
    link().deliver({ t: 'welcome', token: 't1', game: 'g1', you: 'io' });
    expect(link().greeting()).toEqual({ t: 'hello', token: 't1' });
    const old = link();
    state().leave();
    expect(old.sent.at(-1)).toEqual({ t: 'leave' });
    expect(old.closed).toBe(false);
    expect(old.flushMs).toBeGreaterThan(10_000);
    // alla riconnessione si ripresenta ancora con il suo token
    expect(old.greeting()).toEqual({ t: 'hello', token: 't1' });
    expect(state().online.game).toBeNull();
    expect(saved()).toBeNull();
  });

  it('Annulla prima di entrare: si chiude e basta, senza riconnettersi per creare la partita', () => {
    vi.useFakeTimers();
    state().create('Io', '#fff', {});
    const old = link();
    state().leave();
    expect(old.flushMs).toBeNull();
    vi.advanceTimersByTime(300);
    expect(old.closed).toBe(true);
  });
});

describe('chat non letta', () => {
  it('lo storico dopo un ricaricamento non conta come nuovo; dopo una riconnessione solo le righe perse', () => {
    storage.set('onpeace.session', JSON.stringify({ game: 'g1', token: 't1' }));
    state().resume();
    link().deliver({ t: 'welcome', token: 't1', game: 'g1', you: 'io' });
    link().deliver({ t: 'chat', lines: [line('marco', 1), line('io', 2), line('sara', 3)] });
    expect(state().online.chat).toHaveLength(3);
    expect(state().online.unread).toBe(0);
    link().deliver({ t: 'chat', lines: [line('marco', 4)] });
    expect(state().online.unread).toBe(1);
    // riconnessione senza ricaricare: lo storico ripete le righe note più una arrivata nel frattempo
    link().deliver({ t: 'welcome', token: 't1', game: 'g1', you: 'io' });
    link().deliver({ t: 'chat', lines: [line('marco', 1), line('io', 2), line('sara', 3), line('marco', 4), line('sara', 5)] });
    expect(state().online.unread).toBe(2);
  });

  it('storico vuoto: la prima riga dal vivo conta', () => {
    state().join('g1', 'Io');
    link().deliver({ t: 'welcome', token: 't1', game: 'g1', you: 'io' });
    link().deliver({ t: 'chat', lines: [] });
    link().deliver({ t: 'chat', lines: [line('marco', 1)] });
    expect(state().online.unread).toBe(1);
  });
});

describe('attacco continuo', () => {
  it('al rientro (sync) si spegne', () => {
    state().join('g1', 'Io');
    link().deliver({ t: 'welcome', token: 't1', game: 'g1', you: 'io' });
    state().patchDraft({ selected: 'a', target: 'b', blitz: true });
    link().deliver({ t: 'game', view: {} as GameView, log: [], sync: true });
    expect(state().draft.blitz).toBe(false);
  });
});
