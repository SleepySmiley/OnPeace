/** Collegamento: "Esci" a linea caduta deve arrivare al server dopo il saluto, poi si chiude. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Net } from '../src/net';

class FakeWS {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static all: FakeWS[] = [];
  readyState = FakeWS.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWS.all.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    if (this.readyState === FakeWS.CLOSED) return;
    this.readyState = FakeWS.CLOSED;
    this.onclose?.();
  }
  open() {
    this.readyState = FakeWS.OPEN;
    this.onopen?.();
  }
}

const last = () => FakeWS.all.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  FakeWS.all = [];
  vi.stubGlobal('WebSocket', FakeWS);
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('closeAfterFlush', () => {
  it('a linea aperta chiude poco dopo', () => {
    const net = new Net(() => {}, () => {}, () => ({ t: 'hello', token: 't1' }));
    last().open();
    net.send({ t: 'leave' });
    net.closeAfterFlush(30_000);
    expect(last().sent).toEqual([{ t: 'hello', token: 't1' }, { t: 'leave' }]);
    vi.advanceTimersByTime(300);
    expect(last().readyState).toBe(FakeWS.CLOSED);
    vi.advanceTimersByTime(20_000);
    expect(FakeWS.all).toHaveLength(1);
  });

  it('a linea caduta aspetta la riconnessione: prima il saluto, poi l\'uscita, poi chiude', () => {
    const net = new Net(() => {}, () => {}, () => ({ t: 'hello', token: 't1' }));
    last().open();
    last().close(); // la linea cade
    net.send({ t: 'leave' });
    net.closeAfterFlush(30_000);
    vi.advanceTimersByTime(500);
    expect(FakeWS.all).toHaveLength(2);
    last().open();
    expect(last().sent).toEqual([{ t: 'hello', token: 't1' }, { t: 'leave' }]);
    vi.advanceTimersByTime(300);
    expect(last().readyState).toBe(FakeWS.CLOSED);
    vi.advanceTimersByTime(20_000);
    expect(FakeWS.all).toHaveLength(2);
  });

  it('se il server non torna, smette di riprovare dopo maxMs', () => {
    const net = new Net(() => {}, () => {}, () => null);
    last().close();
    net.send({ t: 'leave' });
    net.closeAfterFlush(5_000);
    // ogni tentativo fallisce
    const fail = (ms: number) => {
      for (let t = 0; t < ms; t += 100) {
        vi.advanceTimersByTime(100);
        if (last().readyState === FakeWS.CONNECTING) last().close();
      }
    };
    fail(5_000);
    const count = FakeWS.all.length;
    expect(count).toBeGreaterThan(1);
    fail(60_000);
    expect(FakeWS.all).toHaveLength(count);
  });
});
