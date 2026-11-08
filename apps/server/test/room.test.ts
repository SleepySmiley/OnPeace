import { describe, expect, it } from 'vitest';
import { NavGrid, createContext, type PlayerId } from '@onpeace/engine';
import type { ServerMsg } from '@onpeace/protocol';
import { loadRules, twoIslandMap } from '../../../packages/engine/test/helpers';
import { RoomManager, type Persistence } from '../src/manager';
import type { RoomSnapshot } from '../src/room';

const map = twoIslandMap();
const ctx = createContext(map, loadRules());
const nav = new NavGrid(map);

function setup() {
  let clock = 1_000_000;
  const inbox = new Map<string, ServerMsg[]>();
  const saved = new Map<string, RoomSnapshot>();
  const store: Persistence = {
    save: (s) => saved.set(s.id, structuredClone(s)),
    loadAll: () => [...saved.values()],
  };
  const transport = {
    send(room: string, player: PlayerId, msg: ServerMsg) {
      const k = `${room}:${player}`;
      inbox.set(k, [...(inbox.get(k) ?? []), msg]);
    },
    isConnected: () => true,
  };
  const now = () => clock;
  const manager = new RoomManager(ctx, nav, store, transport, now, 0);
  const last = <T extends ServerMsg['t']>(room: string, player: PlayerId, t: T) =>
    (inbox.get(`${room}:${player}`) ?? []).filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t).at(-1);
  return {
    manager,
    saved,
    store,
    transport,
    last,
    advance: (ms: number) => (clock += ms),
    now,
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
    expect(room.handle(host.id, { t: 'kick', player: guest.id })).toBeNull();
    expect(room.state!.players.find((p) => p.id === guest.id)!.status).toBe('left');
    expect(t.last(room.id, guest.id, 'kicked')).toBeDefined();
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
    const again = new RoomManager(ctx, nav, t.store, t.transport, t.now, 0);
    expect(again.loadSaved()).toBe(1);
    const found = again.byToken(host.token)!;
    expect(found.room.state!.turn).toBe(1);
    expect(found.room.snapshot().plans[host.id]).toHaveLength(1);
  });
});
