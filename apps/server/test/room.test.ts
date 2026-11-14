import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@onpeace/engine';
import { NavGrid, createContext, type PlayerId } from '@onpeace/engine';
import { parseClientMsg, type ServerMsg } from '@onpeace/protocol';
import { loadRules, twoIslandMap } from '../../../packages/engine/test/helpers';
import { memoryLogger } from '../src/log';
import { RoomManager, type Persistence } from '../src/manager';
import { singleMap } from '../src/maps';
import type { RoomSnapshot } from '../src/room';

// resolveTurn resta quello vero; i test sugli errori del motore lo fanno fallire apposta
vi.mock('@onpeace/engine', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@onpeace/engine')>();
  return { ...mod, resolveTurn: vi.fn(mod.resolveTurn) };
});
const actual = await vi.importActual<typeof import('@onpeace/engine')>('@onpeace/engine');
const resolveSpy = vi.mocked(engine.resolveTurn);
afterEach(() => {
  resolveSpy.mockImplementation(actual.resolveTurn);
});

const map = twoIslandMap();
const ctx = createContext(map, loadRules());
const nav = new NavGrid(map);
const maps = singleMap({ ctx, nav });

function setup() {
  let clock = 1_000_000;
  const inbox = new Map<string, ServerMsg[]>();
  const saved = new Map<string, RoomSnapshot>();
  const logger = memoryLogger();
  const store: Persistence = {
    save: (s) => saved.set(s.id, structuredClone(s)),
    loadAll: () => [...saved.values()],
    remove: (id) => saved.delete(id),
  };
  const disconnected: string[] = [];
  let connected = true;
  const transport = {
    send(room: string, player: PlayerId, msg: ServerMsg) {
      const k = `${room}:${player}`;
      inbox.set(k, [...(inbox.get(k) ?? []), msg]);
    },
    isConnected: () => connected,
    disconnect: (room: string, player: PlayerId) => void disconnected.push(`${room}:${player}`),
  };
  const now = () => clock;
  const manager = new RoomManager(maps, store, transport, now, 0, logger.log);
  const last = <T extends ServerMsg['t']>(room: string, player: PlayerId, t: T) =>
    (inbox.get(`${room}:${player}`) ?? []).filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t).at(-1);
  return {
    manager,
    saved,
    store,
    transport,
    logger,
    last,
    advance: (ms: number) => (clock += ms),
    now,
    disconnected,
    setConnected: (v: boolean) => (connected = v),
  };
}

/** Partita con due giocatori, già nella fase di gioco (turno 1). */
function playing() {
  const t = setup();
  const { room, seat: host } = t.manager.create('Anna', '#e05a4f', { turnSeconds: 120, startingFunds: 100_000 });
  const guest = t.manager.join(room.id, 'Bruno');
  if (typeof guest === 'string') throw new Error(guest);
  expect(room.handle(host.id, { t: 'start' })).toBeNull();
  expect(room.handle(host.id, { t: 'pick', country: 'aa' })).toBeNull();
  expect(room.handle(guest.seat.id, { t: 'pick', country: 'bb' })).toBeNull();
  return { ...t, room, host, guest: guest.seat };
}

describe('stanza di gioco', () => {
  it('sala d’attesa: colori unici, solo l’host comincia, scelta dei paesi a turno', () => {
    const t = setup();
    const { room, seat: host } = t.manager.create('Anna', '#e05a4f', {});
    const guest = t.manager.join(room.id, 'Bruno', '#e05a4f');
    if (typeof guest === 'string') throw new Error(guest);
    expect(guest.seat.color).not.toBe(host.color);
    expect(t.manager.join(room.id, 'anna')).toMatch(/Nome già usato/);
    expect(room.handle(guest.seat.id, { t: 'start' })).toMatch(/Solo chi ha creato/);
    expect(room.handle(host.id, { t: 'start' })).toBeNull();
    expect(room.phase).toBe('selection');
    expect(t.last(room.id, host.id, 'status')!.picker).toBe(host.id);
    expect(room.handle(guest.seat.id, { t: 'pick', country: 'aa' })).toMatch(/Non tocca a te/);
    expect(room.handle(host.id, { t: 'pick', country: 'aa' })).toBeNull();
    expect(room.handle(guest.seat.id, { t: 'pick', country: 'aa' })).toMatch(/già stato scelto/);
    expect(room.handle(guest.seat.id, { t: 'pick', country: 'bb' })).toBeNull();
    expect(room.phase).toBe('playing');
    expect(room.state!.turn).toBe(1);
    expect(t.manager.join(room.id, 'Carla')).toMatch(/già cominciata/);
  });

  it('colori: maiuscole e minuscole sono lo stesso colore', () => {
    const t = setup();
    const { room } = t.manager.create('Anna', '#e05a4f', {});
    const guest = t.manager.join(room.id, 'Bruno');
    if (typeof guest === 'string') throw new Error(guest);
    const msg = parseClientMsg('{"t":"color","color":"#E05A4F"}');
    if ('error' in msg) throw new Error(msg.error);
    expect(room.handle(guest.seat.id, msg)).toMatch(/già preso/);
  });

  it('dottrina: si sceglie in sala d’attesa e durante la scelta dei paesi, poi si blocca', () => {
    const t = setup();
    const { room, seat: host } = t.manager.create('Anna', '#e05a4f', { startingFunds: 100_000 });
    const guest = t.manager.join(room.id, 'Bruno');
    if (typeof guest === 'string') throw new Error(guest);
    expect(room.handle(host.id, { t: 'doctrine', strategy: 'inesistente', general: [] })).toMatch(/sconosciuta/);
    expect(room.handle(host.id, { t: 'doctrine', strategy: 'guerra_lampo', general: ['carrista'] })).toBeNull();
    expect(t.last(room.id, host.id, 'lobby')!.lobby.doctrine).toEqual({ strategy: 'guerra_lampo', general: ['carrista'] });
    // gli altri non la vedono
    expect(t.last(room.id, guest.seat.id, 'lobby')!.lobby.doctrine.strategy).toBeNull();

    room.handle(host.id, { t: 'start' });
    expect(room.state!.players.find((p) => p.id === host.id)!.strategy).toBe('guerra_lampo');
    expect(room.handle(guest.seat.id, { t: 'doctrine', strategy: 'difesa', general: [] })).toBeNull();
    expect(t.last(room.id, host.id, 'game')!.view.players.find((p) => p.id === guest.seat.id)!.strategy).toBeNull();

    room.handle(host.id, { t: 'pick', country: 'aa' });
    room.handle(guest.seat.id, { t: 'pick', country: 'bb' });
    expect(room.phase).toBe('playing');
    const players = room.state!.players;
    expect(players.map((p) => p.strategy)).toEqual(['guerra_lampo', 'difesa']);
    expect(players[0]!.generalUpgrades).toEqual(['carrista', 'difesa', 'fortuna']);
    expect(room.handle(host.id, { t: 'doctrine', strategy: null, general: [] })).toMatch(/prima del turno 1/);
    // da ora le strategie sono pubbliche
    expect(t.last(room.id, host.id, 'game')!.view.players[1]!.strategy).toBe('difesa');
  });

  it('il turno si risolve quando tutti hanno finito', () => {
    const t = playing();
    const { room, host, guest } = t;
    room.handle(host.id, {
      t: 'plan',
      actions: [{ kind: 'buy', order: { city: 'a1', units: [{ type: 'infantry', count: 1 }], buildings: [] } }],
    });
    room.handle(host.id, { t: 'ready', done: true });
    expect(t.last(room.id, host.id, 'status')!.waiting).toEqual([guest.id]);
    expect(room.state!.turn).toBe(1);
    room.handle(guest.id, { t: 'ready', done: true });
    expect(room.state!.turn).toBe(2);
    const msg = t.last(room.id, host.id, 'game')!;
    expect(msg.view.seed).toBe(0);
    expect(msg.eventsTurn).toBe(1);
    expect(msg.events.some((e) => e.kind === 'purchase')).toBe(true);
    // l'acquisto di Anna non compare tra gli eventi di Bruno
    expect(t.last(room.id, guest.id, 'game')!.events.some((e) => e.kind === 'purchase')).toBe(false);
  });

  it('allo scadere del tempo il turno si risolve comunque', () => {
    const t = playing();
    t.advance(119_000);
    t.manager.tick();
    expect(t.room.state!.turn).toBe(1);
    t.advance(2_000);
    t.manager.tick();
    expect(t.room.state!.turn).toBe(2);
  });

  it('scelta dei paesi: allo scadere sceglie in automatico', () => {
    const t = setup();
    const { room, seat: host } = t.manager.create('Anna', '#e05a4f', { startingFunds: 100_000 });
    t.manager.join(room.id, 'Bruno');
    room.handle(host.id, { t: 'start' });
    t.advance(31_000);
    t.manager.tick();
    expect(t.last(room.id, host.id, 'status')!.picker).not.toBe(host.id);
  });

  it('espulsione: solo dopo 3 turni di inattività', () => {
    const t = playing();
    const { room, host, guest } = t;
    expect(room.handle(host.id, { t: 'kick', player: guest.id })).toMatch(/inattivo da 3 turni/);
    for (let i = 0; i < 3; i++) {
      room.handle(host.id, { t: 'ready', done: true });
      t.advance(121_000);
      t.manager.tick();
    }
    expect(room.seats.find((s) => s.id === guest.id)!.inactiveTurns).toBe(3);
    const oldToken = guest.token;
    expect(room.handle(host.id, { t: 'kick', player: guest.id })).toBeNull();
    expect(room.state!.players.find((p) => p.id === guest.id)!.status).toBe('left');
    expect(t.last(room.id, guest.id, 'kicked')).toBeDefined();
    expect(t.manager.byToken(oldToken)).toBeNull(); // col vecchio token non si rientra
    expect(t.disconnected).toContain(`${room.id}:${guest.id}`); // e il server gli chiude la connessione
  });

  it('scelta dei paesi: se esce chi deve scegliere per ultimo la partita comincia lo stesso', () => {
    const t = setup();
    const { room, seat: host } = t.manager.create('Anna', '#e05a4f', { startingFunds: 100_000 });
    const guest = t.manager.join(room.id, 'Bruno');
    if (typeof guest === 'string') throw new Error(guest);
    room.handle(host.id, { t: 'start' });
    expect(room.handle(host.id, { t: 'pick', country: 'aa' })).toBeNull();
    expect(room.handle(guest.seat.id, { t: 'leave' })).toBeNull();
    expect(room.phase).toBe('playing');
  });

  it('al tetto di partite si fa posto togliendo la sala d’attesa abbandonata più vecchia', () => {
    const t = setup();
    const first = t.manager.create('Anna', '#e05a4f', {}).room;
    t.advance(1000);
    for (let i = 1; i < 200; i++) t.manager.create(`G${i}`, '#e05a4f', {});
    expect(t.manager.rooms.size).toBe(200);
    t.setConnected(true); // tutti collegati: non si toglie nessuno
    expect(t.manager.canCreate()).toBe(false);
    t.setConnected(false); // nessuno collegato: va via la più vecchia
    expect(t.manager.canCreate()).toBe(true);
    expect(t.manager.rooms.has(first.id)).toBe(false);
    expect(t.manager.rooms.size).toBe(199);
  });

  it('sala d’attesa rimasta vuota: la partita e il suo file spariscono', async () => {
    const t = setup();
    const { room, seat: host } = t.manager.create('Anna', '#e05a4f', {});
    await new Promise((r) => setTimeout(r, 5));
    expect(t.saved.has(room.id)).toBe(true);
    expect(t.manager.handle(room.id, host.id, { t: 'leave' })).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    expect(t.manager.rooms.has(room.id)).toBe(false);
    expect(t.saved.has(room.id)).toBe(false);
  });

  it('rientro con il token e ripresa dopo un riavvio', async () => {
    const t = playing();
    const { room, host } = t;
    room.handle(host.id, {
      t: 'plan',
      actions: [{ kind: 'diplomacy', to: t.guest.id, proposal: 'peace' }],
    });
    expect(t.manager.byToken(host.token)?.seat.id).toBe(host.id);
    await new Promise((r) => setTimeout(r, 5));
    const snap = t.saved.get(room.id)!;
    expect(snap.plans[host.id]).toHaveLength(1);

    // "riavvio": un nuovo gestore ricarica i salvataggi
    const again = new RoomManager(maps, t.store, t.transport, t.now, 0);
    expect(again.loadSaved()).toBe(1);
    const found = again.byToken(host.token)!;
    expect(found.room.state!.turn).toBe(1);
    expect(found.room.snapshot().plans[host.id]).toHaveLength(1);
  });

  it('pausa: solo l’host ferma il tempo, alla ripresa restano almeno 15 s', () => {
    const t = playing();
    const { room, host, guest } = t;
    expect(room.handle(guest.id, { t: 'pause', paused: true })).toMatch(/Solo chi ha creato/);
    t.advance(110_000);
    expect(room.handle(host.id, { t: 'pause', paused: true })).toBeNull();
    expect(t.last(room.id, guest.id, 'status')!.paused).toEqual({ reason: 'host', remainingMs: 10_000 });
    t.advance(600_000);
    t.manager.tick();
    expect(room.state!.turn).toBe(1);
    // si può comunque finire il turno: il nuovo turno resta in pausa con il tempo pieno
    room.handle(host.id, { t: 'ready', done: true });
    room.handle(guest.id, { t: 'ready', done: true });
    expect(room.state!.turn).toBe(2);
    expect(t.last(room.id, host.id, 'status')!.paused).toEqual({ reason: 'host', remainingMs: 120_000 });
    expect(room.handle(host.id, { t: 'pause', paused: false })).toBeNull();
    const status = t.last(room.id, guest.id, 'status')!;
    expect(status.paused).toBeNull();
    expect(status.deadline).toBe(t.now() + 120_000);
  });

  it('pausa: alla ripresa con poco tempo rimasto ne restano 15 s', () => {
    const t = playing();
    const { room, host } = t;
    t.advance(119_000);
    room.handle(host.id, { t: 'pause', paused: true });
    room.handle(host.id, { t: 'pause', paused: false });
    expect(t.last(room.id, host.id, 'status')!.deadline).toBe(t.now() + 15_000);
  });

  it('se il motore fallisce per gli ordini di un giocatore, si annullano solo i suoi', () => {
    const t = playing();
    const { room, host, guest } = t;
    resolveSpy.mockImplementation((state, c, n, plans) => {
      if ((plans[guest.id]?.length ?? 0) > 0) throw new Error('motore rotto');
      return actual.resolveTurn(state, c, n, plans);
    });
    room.handle(host.id, {
      t: 'plan',
      actions: [{ kind: 'buy', order: { city: 'a1', units: [{ type: 'infantry', count: 1 }], buildings: [] } }],
    });
    room.handle(guest.id, {
      t: 'plan',
      actions: [{ kind: 'buy', order: { city: 'b1', units: [{ type: 'infantry', count: 1 }], buildings: [] } }],
    });
    room.handle(host.id, { t: 'ready', done: true });
    expect(() => room.handle(guest.id, { t: 'ready', done: true })).not.toThrow();
    expect(room.state!.turn).toBe(2);
    const purchases = t.last(room.id, host.id, 'game')!.events.filter((e) => e.kind === 'purchase');
    expect(purchases.map((e) => e.player)).toEqual([host.id]);
    expect(t.last(room.id, guest.id, 'error')!.message).toMatch(/ordini del turno 1 sono stati annullati/);
    expect(t.last(room.id, host.id, 'error')).toBeUndefined();
    // quanto serve a riprodurre l'errore è stato salvato
    expect(t.logger.dumps).toHaveLength(1);
    expect(t.logger.dumps[0]!.data).toMatchObject({ plans: { [guest.id]: expect.any(Array) } });
    expect(t.logger.lines.some((l) => l.includes('motore rotto'))).toBe(true);
  });

  it('se il turno non si risolve nemmeno senza ordini, la partita si ferma e riparte dopo la correzione', () => {
    const t = playing();
    const { room, host, guest } = t;
    resolveSpy.mockImplementation(() => {
      throw new Error('motore rotto');
    });
    t.advance(121_000);
    expect(() => t.manager.tick()).not.toThrow();
    expect(room.state!.turn).toBe(1);
    expect(t.last(room.id, guest.id, 'status')!.paused?.reason).toBe('error');
    expect(t.last(room.id, guest.id, 'error')!.message).toMatch(/partita ferma/);
    t.advance(600_000);
    t.manager.tick(); // ferma: non riprova da sola a ogni secondo
    expect(resolveSpy).toHaveBeenCalledTimes(2); // con gli ordini e senza (non c'erano ordini)
    // dopo la correzione: quando tutti finiscono il turno si risolve e il tempo riparte
    resolveSpy.mockImplementation(actual.resolveTurn);
    room.handle(host.id, { t: 'ready', done: true });
    room.handle(guest.id, { t: 'ready', done: true });
    expect(room.state!.turn).toBe(2);
    expect(t.last(room.id, host.id, 'status')!.paused).toBeNull();
  });

  it('chi esce per ultimo senza aver finito non blocca il turno', () => {
    const t = playing();
    const { room, host, guest } = t;
    room.handle(guest.id, { t: 'ready', done: true });
    expect(room.snapshot().eventsTurn).toBe(0);
    room.handle(host.id, { t: 'leave' });
    expect(room.snapshot().eventsTurn).toBe(1); // il turno 1 è stato risolto subito
  });

  it('segnalazioni: nel registro con partita, nome e turno; per i feedback anche lo stato della partita', () => {
    const t = playing();
    const { room, guest } = t;
    t.manager.report(room.id, guest.id, { t: 'report', kind: 'feedback', text: 'la battaglia non c’è' });
    t.manager.report(room.id, guest.id, { t: 'report', kind: 'error', text: 'TypeError: x', detail: 'pila' });
    t.manager.report(null, null, { t: 'report', kind: 'error', text: 'prima di entrare' });
    expect(t.logger.reports).toMatchObject([
      { kind: 'feedback', game: room.id, name: 'Bruno', turn: 1, text: 'la battaglia non c’è', snapshot: expect.any(String) },
      { kind: 'error', name: 'Bruno', detail: 'pila', snapshot: null },
      { kind: 'error', game: null, name: null },
    ]);
    expect(t.logger.dumps.map((d) => d.name)).toEqual([`segnalazione-${room.id}-turno1`]);
  });

  it('un salvataggio fallito (file bloccato) viene ritentato', async () => {
    const t = setup();
    let fail = 1;
    const saved: string[] = [];
    const store: Persistence = {
      save: (s) => {
        if (fail-- > 0) throw Object.assign(new Error('EPERM: file bloccato'), { code: 'EPERM' });
        saved.push(s.id);
      },
      loadAll: () => [],
      remove: () => {},
    };
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(maps, store, t.transport, t.now, 0, t.logger.log);
      const { room } = manager.create('Anna', '#e05a4f', {});
      await vi.advanceTimersByTimeAsync(10);
      expect(saved).toEqual([]);
      expect(t.logger.lines.some((l) => l.includes('salvataggio non riuscito'))).toBe(true);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(saved).toEqual([room.id]);
    } finally {
      vi.useRealTimers();
    }
  });
});
