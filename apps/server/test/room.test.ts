import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as conquista from '@onpeace/conquista';
import { parseClientMsg, type RoomSettings, type ServerMsg } from '@onpeace/protocol';
import { BoardLibrary, type BoardProvider } from '../src/boards';
import { memoryLogger } from '../src/log';
import { RoomManager, type Persistence } from '../src/manager';
import { KICK_AFTER_IDLE, REJOIN_AFTER_MS, type Room, type RoomSnapshot } from '../src/room';

// il tempo scaduto resta quello vero; i test sugli errori del motore lo fanno fallire apposta
vi.mock('@onpeace/conquista', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@onpeace/conquista')>();
  return { ...mod, timeout: vi.fn(mod.timeout) };
});
const actual = await vi.importActual<typeof import('@onpeace/conquista')>('@onpeace/conquista');
const timeoutSpy = vi.mocked(conquista.timeout);
afterEach(() => {
  timeoutSpy.mockImplementation(actual.timeout);
});

const DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));
const boards = new BoardLibrary(DATA_DIR);
const { timers } = boards.rules;
const DAY_MS = 24 * 3600 * 1000;
const saving = () => new Promise((r) => setTimeout(r, 5));
const SETUP_MS = timers.setupSeconds * 1000;
const BRIEFING_MS = timers.briefingSeconds * 1000;
const PICK_MS = timers.pickSeconds * 1000;

function setup() {
  let clock = 1_000_000;
  const inbox = new Map<string, ServerMsg[]>();
  const saved = new Map<string, RoomSnapshot>();
  const logger = memoryLogger();
  const store: Persistence = {
    save: (s) => saved.set(s.id, structuredClone(s)),
    loadAll: () => [...saved.values()].map((s) => structuredClone(s)),
    remove: (id) => saved.delete(id),
  };
  const disconnected: string[] = [];
  let connected = true;
  /** Giocatori scollegati uno per uno (per id: i test con più partite usano `setConnected`). */
  const offline = new Set<string>();
  const transport = {
    send(room: string, player: string, msg: ServerMsg) {
      const k = `${room}:${player}`;
      inbox.set(k, [...(inbox.get(k) ?? []), msg]);
    },
    isConnected: (_room: string, player: string) => connected && !offline.has(player),
    disconnect: (room: string, player: string) => void disconnected.push(`${room}:${player}`),
  };
  const now = () => clock;
  const manager = new RoomManager(boards, store, transport, now, 0, logger.log);
  const all = <T extends ServerMsg['t']>(room: string, player: string, t: T) =>
    (inbox.get(`${room}:${player}`) ?? []).filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t);
  const last = <T extends ServerMsg['t']>(room: string, player: string, t: T) => all(room, player, t).at(-1);
  return {
    manager,
    saved,
    store,
    transport,
    logger,
    all,
    last,
    advance: (ms: number) => (clock += ms),
    now,
    disconnected,
    setConnected: (v: boolean) => (connected = v),
    /** Il giocatore chiude l'ultima connessione (come la chiusura del socket in main.ts). */
    goOffline: (room: Room, player: string) => {
      offline.add(player);
      room.connectionClosed(player);
    },
    goOnline: (player: string) => offline.delete(player),
  };
}

/** Sala con `n` giocatori (Anna è l'host). */
function lobby(n = 2, settings: Parameters<RoomManager['create']>[2] = { mode: 'conquest' }) {
  const t = setup();
  const { room, seat: host } = t.manager.create('Anna', '#4a8ff0', settings);
  const guests = ['Bruno', 'Carla', 'Dario', 'Elena'].slice(0, n - 1).map((name) => {
    const r = t.manager.join(room.id, name);
    if (typeof r === 'string') throw new Error(r);
    return r.seat;
  });
  return { ...t, room, host, guests, guest: guests[0]! };
}

const BEFORE_TURNS = ['briefing', 'draft', 'setup'];

/** Lascia scadere il tempo finché finisce la preparazione (obiettivo, territori e armate fanno da soli). */
function toFirstTurn(t: ReturnType<typeof setup>, room: Room) {
  for (let i = 0; BEFORE_TURNS.includes(room.state!.phase) && i < 300; i++) {
    t.advance(Math.max(SETUP_MS, BRIEFING_MS, PICK_MS) + 1);
    t.manager.tick();
  }
  expect(room.state!.phase).toBe('reinforce');
}

/** Lascia scadere il tempo per leggere l'obiettivo. */
function skipBriefing(t: ReturnType<typeof setup>, room: Room) {
  expect(room.state!.phase).toBe('briefing');
  t.advance(BRIEFING_MS + 1);
  t.manager.tick();
  expect(room.state!.phase).not.toBe('briefing');
}

function playing(n = 2) {
  const t = lobby(n);
  expect(t.room.handle(t.host.id, { t: 'start' })).toBeNull();
  toFirstTurn(t, t.room);
  return t;
}

describe('sala d’attesa', () => {
  it('colori unici, solo l’host cambia le opzioni e comincia', () => {
    const t = lobby(2, {});
    const { room, host, guest } = t;
    expect(guest.color).not.toBe(host.color);
    expect(room.handle(guest.id, { t: 'color', color: host.color })).toBe('Colore già preso');
    expect(room.handle(guest.id, { t: 'settings', settings: { mode: 'conquest' } })).toMatch(/Solo chi ha creato/);
    expect(room.handle(guest.id, { t: 'start' })).toMatch(/Solo chi ha creato/);
    expect(room.handle(host.id, { t: 'settings', settings: { board: 'atlantide' } })).toBe('Tabellone sconosciuto');
    const info = t.last(room.id, guest.id, 'lobby')!.lobby;
    expect(info.board.id).toBe('mondo');
    expect(info.settings).toEqual({
      board: 'mondo',
      mode: 'objectives',
      distribution: 'draft',
      placement: 'rounds',
      turnSeconds: 180,
      combat: 'pairs',
      ties: 'defender',
      defenseDice: 3,
    });
    expect(info.rules.setup.placement).toBe('rounds');
  });

  it('colori: maiuscole e minuscole sono lo stesso colore', () => {
    const msg = parseClientMsg(JSON.stringify({ t: 'color', color: '#4A8FF0' }));
    expect(msg).toEqual({ t: 'color', color: '#4a8ff0' });
    const t = lobby(2);
    expect(t.room.handle(t.guest.id, msg as never)).toBe('Colore già preso');
  });

  it('obiettivi segreti: in due non si può, con la conquista del mondo sì', () => {
    const t = lobby(2, {});
    expect(t.room.handle(t.host.id, { t: 'start' })).toMatch(/almeno 3 giocatori/);
    expect(t.room.handle(t.host.id, { t: 'settings', settings: { mode: 'conquest' } })).toBeNull();
    expect(t.room.handle(t.host.id, { t: 'start' })).toBeNull();
    expect(t.room.state!.mode).toBe('conquest');
  });

  it('le opzioni dell’host cambiano le regole della partita', () => {
    const t = lobby(3, { mode: 'objectives', distribution: 'random', placement: 'simultaneous', turnSeconds: 60 });
    expect(t.room.handle(t.host.id, { t: 'start' })).toBeNull();
    const info = t.last(t.room.id, t.guest.id, 'lobby')!.lobby;
    expect(info.rules.setup.distribution).toBe('random');
    expect(info.rules.setup.placement).toBe('simultaneous');
    expect(info.rules.timers.turnSeconds).toBe(60);
    skipBriefing(t, t.room);
    // tutti insieme: non c'è un turno di piazzamento, piazzano tutti
    expect(t.room.state!.setupPlayer).toBeNull();
  });

  it('opzioni dei dadi: pari, dadi della difesa, combattimento a colpi', () => {
    const t = lobby(3, { ties: 'reroll-pair', defenseDice: 2 });
    let info = t.last(t.room.id, t.guest.id, 'lobby')!.lobby;
    expect(info.rules.dice).toMatchObject({ combat: 'pairs', tiesTo: 'reroll-pair', defenseMax: 2, attackMax: 3 });
    expect(t.room.handle(t.host.id, { t: 'settings', settings: { combat: 'hits' } })).toBeNull();
    info = t.last(t.room.id, t.guest.id, 'lobby')!.lobby;
    expect(info.rules.dice).toMatchObject({ combat: 'hits', hits: { max: 9 } });
    expect(t.room.handle(t.host.id, { t: 'settings', settings: { combat: 'alternate' } })).toBeNull();
    expect(t.room.lobbyInfo().rules.dice).toMatchObject({ combat: 'alternate', hits: { max: 9 } });
    // valori fuori dalle regole: il messaggio non passa la validazione
    expect(parseClientMsg(JSON.stringify({ t: 'settings', settings: { defenseDice: 5 } }))).toHaveProperty('error');
    expect(parseClientMsg(JSON.stringify({ t: 'settings', settings: { ties: 'moneta' } }))).toHaveProperty('error');
  });

  it('al tetto di partite si fa posto togliendo la sala d’attesa abbandonata più vecchia', () => {
    const t = setup();
    const first = t.manager.create('Anna', '#4a8ff0', {}).room;
    t.advance(1000);
    for (let i = 1; i < 200; i++) t.manager.create(`G${i}`, '#4a8ff0', {});
    expect(t.manager.rooms.size).toBe(200);
    t.setConnected(true); // tutti collegati: non si toglie nessuno
    expect(t.manager.canCreate()).toBe(false);
    t.setConnected(false); // nessuno collegato: va via la più vecchia
    expect(t.manager.canCreate()).toBe(true);
    expect(t.manager.rooms.has(first.id)).toBe(false);
    expect(t.manager.rooms.size).toBe(199);
  });

  it('al tetto, se non ci sono sale d’attesa da togliere, va via la partita finita più vecchia senza nessuno collegato', () => {
    const t = setup();
    const rooms = Array.from({ length: 200 }, (_, i) => {
      t.advance(1000);
      return t.manager.create(`G${i}`, '#4a8ff0', {}).room;
    });
    for (const r of rooms) r.snapshot().phase = 'playing';
    rooms[9]!.snapshot().phase = 'ended';
    rooms[5]!.snapshot().phase = 'ended';
    expect(t.manager.canCreate()).toBe(false); // tutti collegati
    t.setConnected(false);
    expect(t.manager.canCreate()).toBe(true);
    expect(t.manager.rooms.has(rooms[5]!.id)).toBe(false);
    expect(t.manager.rooms.has(rooms[9]!.id)).toBe(true);
    t.manager.create('Anna', '#4a8ff0', {}).room.snapshot().phase = 'playing';
    expect(t.manager.canCreate()).toBe(true);
    expect(t.manager.rooms.has(rooms[9]!.id)).toBe(false);
    t.manager.create('Anna', '#4a8ff0', {}).room.snapshot().phase = 'playing';
    // le partite in corso non si toccano mai
    expect(t.manager.canCreate()).toBe(false);
  });

  it('sala d’attesa rimasta vuota: la partita e il suo file spariscono', async () => {
    const t = setup();
    const { room, seat: host } = t.manager.create('Anna', '#4a8ff0', {});
    await new Promise((r) => setTimeout(r, 5));
    expect(t.saved.has(room.id)).toBe(true);
    expect(t.manager.handle(room.id, host.id, { t: 'leave' })).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    expect(t.manager.rooms.has(room.id)).toBe(false);
    expect(t.saved.has(room.id)).toBe(false);
  });

  it('in sala d’attesa l’host può togliere chiunque, e la connessione si chiude', () => {
    const t = lobby(2);
    expect(t.room.handle(t.host.id, { t: 'kick', player: t.guest.id })).toBeNull();
    expect(t.room.seats).toHaveLength(1);
    expect(t.last(t.room.id, t.guest.id, 'kicked')).toBeDefined();
    expect(t.disconnected).toEqual([`${t.room.id}:${t.guest.id}`]);
  });
});

describe('inizio partita', () => {
  it('prima il tempo per leggere l’obiettivo, poi un tempo per ogni territorio scelto', () => {
    const t = lobby(3, { mode: 'objectives' });
    const { room, host } = t;
    expect(room.handle(host.id, { t: 'start' })).toBeNull();
    expect(room.state!.phase).toBe('briefing');
    expect(t.last(room.id, host.id, 'status')!.total).toBe(BRIEFING_MS);
    for (const id of room.state!.order) expect(room.handle(id, { t: 'act', action: { kind: 'ready' } })).toBeNull();
    const state = room.state!;
    expect(state.phase).toBe('draft');
    const [a, b] = state.order as [string, string];
    expect(state.setupPlayer).toBe(a);
    const status = t.last(room.id, host.id, 'status')!;
    expect(status.total).toBe(PICK_MS);
    // chi sceglie fuori turno sbaglia; chi tocca sceglie e il tempo riparte per il prossimo
    const free = boards.context(room.settings).board.territories.map((x) => x.id);
    expect(room.handle(b, { t: 'act', action: { kind: 'pick', territory: free[0]! } })).toBe('Non tocca a te scegliere.');
    t.advance(1000);
    expect(room.handle(a, { t: 'act', action: { kind: 'pick', territory: free[0]! } })).toBeNull();
    expect(room.state!.setupPlayer).toBe(b);
    expect(t.last(room.id, host.id, 'status')!.deadline).toBe(t.now() + PICK_MS);
    // a b scade il tempo: sceglie il server e gli si conta un turno saltato
    t.advance(PICK_MS + 1);
    t.manager.tick();
    expect(Object.values(room.state!.territories).filter((x) => x.owner === b)).toHaveLength(1);
    expect(room.seats.find((s) => s.id === b)!.idleTurns).toBe(1);
  });

  it('chi non chiude l’obiettivo in tempo non perde un turno', () => {
    const t = lobby(2);
    t.room.handle(t.host.id, { t: 'start' });
    skipBriefing(t, t.room);
    expect(t.room.state!.phase).toBe('draft');
    expect(t.room.seats.every((s) => s.idleTurns === 0)).toBe(true);
  });

  it('chi esce durante la scelta: il server chiude il suo obiettivo e sceglie per lui', () => {
    const t = lobby(3);
    const { room, host, guests } = t;
    room.handle(host.id, { t: 'start' });
    const gone = guests[1]!.id;
    expect(room.handle(gone, { t: 'leave' })).toBeNull();
    for (const id of room.state!.order.filter((p) => p !== gone)) room.handle(id, { t: 'act', action: { kind: 'ready' } });
    expect(room.state!.phase).toBe('draft');
    const free = () => boards.context(room.settings).board.territories.map((x) => x.id).filter((x) => !room.state!.territories[x]);
    // quando tocca a chi è uscito il server sceglie subito, senza aspettare il tempo
    for (let i = 0; room.state!.phase === 'draft' && i < 100; i++) {
      const who = room.state!.setupPlayer!;
      expect(who).not.toBe(gone);
      expect(room.handle(who, { t: 'act', action: { kind: 'pick', territory: free()[0]! } })).toBeNull();
    }
    expect(room.state!.phase).toBe('setup');
    expect(Object.values(room.state!.territories).filter((x) => x.owner === gone).length).toBeGreaterThan(10);
  });
});

describe('partita', () => {
  it('a giri piazza solo chi tocca; gli eventi arrivano a tutti, le carte e gli obiettivi altrui no', () => {
    const t = lobby(3, { mode: 'objectives', distribution: 'random' });
    const { room, host } = t;
    expect(room.handle(host.id, { t: 'start' })).toBeNull();
    skipBriefing(t, room);
    const state = room.state!;
    const first = state.setupPlayer!;
    const other = state.order.find((p) => p !== first)!;
    const mine = Object.keys(state.territories).find((id) => state.territories[id]!.owner === first)!;
    const step = actual.setupStep(boards.context(room.settings), state, first);
    expect(room.handle(other, { t: 'act', action: { kind: 'setup-place', placements: { [mine]: step } } })).toBe('Non tocca a te piazzare.');
    expect(room.handle(first, { t: 'act', action: { kind: 'setup-place', placements: { [mine]: step } } })).toBeNull();
    const seen = t.last(room.id, other, 'game')!;
    expect(seen.sync).toBe(false);
    expect(seen.log.map((e) => e.event.type)).toEqual(['setup-place']);
    const me = seen.view.players.find((p) => p.id === other)!;
    const them = seen.view.players.find((p) => p.id === first)!;
    expect(me.objective).toEqual(expect.objectContaining({ text: expect.any(String) }));
    expect(them.objective).toBeNull();
    expect(them.cards).toBeNull();
  });

  it('tempo scaduto: le armate si piazzano da sole, il tempo riparte, il turno saltato si conta', () => {
    const t = lobby(2, { mode: 'conquest', distribution: 'random' });
    const { room, host } = t;
    room.handle(host.id, { t: 'start' });
    skipBriefing(t, room);
    const first = room.state!.setupPlayer!;
    const deadline = t.last(room.id, host.id, 'status')!.deadline!;
    t.advance(SETUP_MS - 1000);
    t.manager.tick();
    expect(room.state!.setupPlayer).toBe(first); // non ancora
    t.advance(1001);
    t.manager.tick();
    expect(room.state!.setupPlayer).not.toBe(first);
    expect(room.seats.find((s) => s.id === first)!.idleTurns).toBe(1);
    const status = t.last(room.id, host.id, 'status')!;
    expect(status.deadline).toBeGreaterThan(deadline);
    expect(status.total).toBe(SETUP_MS);
  });

  it('il turno: rinforzi, attacco, fine turno; a fine turno tocca all’altro con il tempo pieno', () => {
    const t = playing();
    const { room } = t;
    const state = room.state!;
    const p = state.turn!.player;
    const own = Object.keys(state.territories).find((id) => state.territories[id]!.owner === p)!;
    expect(room.handle(p, { t: 'act', action: { kind: 'reinforce', placements: { [own]: state.turn!.reinforcements } } })).toBeNull();
    expect(room.state!.phase).toBe('attack');
    expect(room.handle(p, { t: 'act', action: { kind: 'end-turn' } })).toBeNull();
    expect(room.state!.turn!.player).not.toBe(p);
    const status = t.last(room.id, p, 'status')!;
    expect(status.deadline).toBe(t.now() + room.settings.turnSeconds * 1000);
    expect(room.seats.find((s) => s.id === p)!.idleTurns).toBe(0);
  });

  it(`ogni tiro di dadi ridà ${timers.battleSeconds} s a chi attacca, fino a ${timers.battleMaxSeconds} s per turno (anche a tempo fermo)`, () => {
    const t = playing();
    const { room, host } = t;
    const state = room.state!;
    const p = state.turn!.player;
    const nb = boards.context(room.settings).neighbours;
    // tutti i rinforzi su un territorio che confina con un nemico
    const from = Object.keys(state.territories).find(
      (id) => state.territories[id]!.owner === p && (nb.get(id) ?? []).some((n) => state.territories[n]!.owner !== p),
    )!;
    const to = nb.get(from)!.find((n) => state.territories[n]!.owner !== p)!;
    room.handle(p, { t: 'act', action: { kind: 'reinforce', placements: { [from]: state.turn!.reinforcements } } });
    // tante armate da tutte e due le parti: nessun tiro chiude l'attacco
    room.state!.territories[from]!.armies = 50;
    room.state!.territories[to]!.armies = 50;
    const before = t.last(room.id, p, 'status')!;
    t.advance(5_000);
    expect(room.handle(p, { t: 'act', action: { kind: 'attack', from, to, dice: 1 } })).toBeNull();
    const after = t.last(room.id, p, 'status')!;
    expect(after.deadline).toBe(before.deadline! + timers.battleSeconds * 1000);
    expect(after.total).toBe(before.total! + timers.battleSeconds * 1000);
    // il tetto: oltre battleMaxSeconds nel turno non si ridà più niente
    room.snapshot().clockBonus = timers.battleMaxSeconds * 1000 - 1000;
    expect(room.handle(p, { t: 'act', action: { kind: 'attack', from, to, dice: 1 } })).toBeNull();
    expect(t.last(room.id, p, 'status')!.deadline).toBe(after.deadline! + 1000);
    expect(room.handle(p, { t: 'act', action: { kind: 'attack', from, to, dice: 1 } })).toBeNull();
    expect(t.last(room.id, p, 'status')!.deadline).toBe(after.deadline! + 1000);
    // a tempo fermo il tempo ridato va nel tempo che resta
    room.snapshot().clockBonus = 0;
    expect(room.handle(host.id, { t: 'pause', paused: true })).toBeNull();
    const paused = t.last(room.id, p, 'status')!.paused!.remainingMs;
    expect(room.handle(p, { t: 'act', action: { kind: 'attack', from, to, dice: 1 } })).toBeNull();
    expect(t.last(room.id, p, 'status')!.paused!.remainingMs).toBe(paused + timers.battleSeconds * 1000);
    // turno nuovo: il conto del tempo ridato riparte da zero
    expect(room.handle(p, { t: 'act', action: { kind: 'end-turn' } })).toBeNull();
    expect(room.snapshot().clockBonus).toBe(0);
  });

  it('chi esce resta sul tabellone: il server muove al posto suo e la partita va avanti', () => {
    const t = playing(3);
    const { room } = t;
    const current = room.state!.turn!.player;
    expect(room.handle(current, { t: 'leave' })).toBeNull();
    // il suo turno è passato subito, senza aspettare il tempo
    expect(room.state!.turn!.player).not.toBe(current);
    expect(room.state!.turn!.number).toBe(2);
    expect(room.handle(current, { t: 'act', action: { kind: 'end-turn' } })).toBe('Sei uscito dalla partita');
    const info = t.last(room.id, room.state!.turn!.player, 'lobby')!.lobby;
    expect(info.players.find((p) => p.id === current)!.left).toBe(true);
  });

  it('se escono tutti la partita si chiude', () => {
    const t = playing(2);
    const { room, host, guest } = t;
    room.handle(guest.id, { t: 'leave' });
    expect(room.phase).toBe('playing');
    expect(room.snapshot().hostId).toBe(host.id);
    room.handle(host.id, { t: 'leave' });
    expect(room.phase).toBe('ended');
  });

  it('l’host esce: passa a chi resta', () => {
    const t = playing(3);
    t.room.handle(t.host.id, { t: 'leave' });
    expect(t.room.snapshot().hostId).toBe(t.guest.id);
  });

  it(`in partita si può togliere solo chi ha saltato ${KICK_AFTER_IDLE} turni di fila`, () => {
    const t = playing(3);
    const { room, host } = t;
    const victim = room.state!.order.find((p) => p !== host.id)!;
    for (const s of room.snapshot().seats) s.idleTurns = 0; // la preparazione a tempo scaduto conta già come turni saltati
    expect(room.handle(host.id, { t: 'kick', player: victim })).toMatch(/saltato/);
    // lascia scadere i turni finché il bersaglio non ne ha saltati abbastanza
    for (let i = 0; i < 20 && room.seats.find((s) => s.id === victim)!.idleTurns < KICK_AFTER_IDLE; i++) {
      t.advance(room.settings.turnSeconds * 1000 + 1);
      t.manager.tick();
    }
    const token = room.seats.find((s) => s.id === victim)!.token;
    expect(room.handle(host.id, { t: 'kick', player: victim })).toBeNull();
    expect(t.manager.byToken(token)).toBeNull(); // il vecchio token non fa rientrare
    expect(room.seats.find((s) => s.id === victim)!.left).toBe(true);
  });

  it('vittoria: la partita finisce e si scoprono gli obiettivi', () => {
    const t = playing(2);
    const { room } = t;
    const snap = room.snapshot();
    const state = snap.state!;
    const p = state.turn!.player;
    const enemy = state.order.find((x) => x !== p)!;
    // a p resta da prendere un solo territorio dell'altro, con un'armata
    const ctx = boards.context(room.settings);
    const [from, to] = [...ctx.neighbours].map(([a, ns]) => [a, ns[0]!] as const)[0]!;
    for (const id of Object.keys(state.territories)) state.territories[id] = { owner: p, armies: 1 };
    state.territories[from] = { owner: p, armies: 60 };
    state.territories[to] = { owner: enemy, armies: 1 };
    state.phase = 'attack';
    state.turn = { ...state.turn!, number: 99 };
    for (let i = 0; i < 100 && room.state!.territories[to]!.owner !== p; i++) {
      expect(room.handle(p, { t: 'act', action: { kind: 'attack', from, to, dice: 3 } })).toBeNull();
    }
    expect(room.state!.phase).toBe('attack'); // prima si decide quante armate entrano
    expect(room.handle(p, { t: 'act', action: { kind: 'occupy', armies: 3 } })).toBeNull();
    expect(room.phase).toBe('ended');
    expect(room.state!.winner).toBe(p);
    const seen = t.last(room.id, enemy, 'game')!;
    expect(seen.log.some((e) => e.event.type === 'victory')).toBe(true);
    expect(t.last(room.id, enemy, 'status')!.deadline).toBeNull();
  });
});

describe('tempo, rientri e imprevisti', () => {
  it('rientro: la partita e gli ultimi eventi, come storia da non animare', () => {
    const t = playing(2);
    const { room, guest } = t;
    room.syncPlayer(guest.id);
    const sync = t.last(room.id, guest.id, 'game')!;
    expect(sync.sync).toBe(true);
    expect(sync.log.length).toBeGreaterThan(0);
    expect(sync.log.every((e, i) => i === 0 || e.seq > sync.log[i - 1]!.seq)).toBe(true);
  });

  it('ripresa dopo un riavvio; un tabellone con territori diversi non si riprende', async () => {
    const t = playing(2);
    const { room, host } = t;
    await new Promise((r) => setTimeout(r, 5));
    const again = new RoomManager(boards, t.store, t.transport, t.now, 0, t.logger.log);
    expect(again.loadSaved()).toBe(1);
    const found = again.byToken(host.token)!;
    expect(found.room.state!.turn!.number).toBe(1);
    expect(found.room.handle(found.room.state!.turn!.player, { t: 'act', action: { kind: 'end-turn' } })).toMatch(/rinforzi/);

    // territorio rinominato nel file del tabellone: la partita salvata non è più giocabile
    const snap = t.saved.get(room.id)!;
    const [first] = Object.keys(snap.state!.territories);
    snap.state!.territories.atlantide = snap.state!.territories[first!]!;
    delete snap.state!.territories[first!];
    const third = new RoomManager(boards, t.store, t.transport, t.now, 0, t.logger.log);
    expect(third.loadSaved()).toBe(0);
    expect(t.logger.lines.some((l) => l.includes('il tabellone "mondo" è cambiato'))).toBe(true);
    expect(t.saved.has(room.id)).toBe(true); // il file resta
    // chi prova a rientrare non perde il token: la partita ripartirà quando il tabellone torna com'era
    expect(third.isUnavailable(host.token)).toBe(true);
    expect(third.isUnavailable('un-altro-token')).toBe(false);
  });

  it('ripresa dopo un riavvio anche mentre si legge l’obiettivo o si scelgono i territori', async () => {
    const t = lobby(2);
    const { room, host } = t;
    expect(room.handle(host.id, { t: 'start' })).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    const reload = () => {
      const again = new RoomManager(boards, t.store, t.transport, t.now, 0, t.logger.log);
      expect(again.loadSaved()).toBe(1);
      return again.byToken(host.token)!.room;
    };
    expect(reload().state!.phase).toBe('briefing'); // nessun territorio preso

    skipBriefing(t, room);
    const first = room.state!.setupPlayer!;
    const free = boards.context(room.settings).board.territories.map((x) => x.id);
    expect(room.handle(first, { t: 'act', action: { kind: 'pick', territory: free[0]! } })).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    const resumed = reload();
    expect(resumed.state!.phase).toBe('draft');
    expect(Object.keys(resumed.state!.territories)).toEqual([free[0]]);
    // il tempo riparte con almeno un minuto, e la durata intera con lui (la barra non resta piena)
    expect(resumed.snapshot().deadline).toBe(t.now() + 60_000);
    expect(resumed.snapshot().clockTotal).toBe(Math.max(PICK_MS, 60_000));
    // si continua a scegliere dove si era rimasti
    const next = resumed.state!.setupPlayer!;
    expect(next).not.toBe(first);
    expect(resumed.handle(next, { t: 'act', action: { kind: 'pick', territory: free[1]! } })).toBeNull();

    // un territorio preso che non c'è più sul tabellone: non si riprende
    const snap = t.saved.get(room.id)!;
    snap.state!.territories.atlantide = snap.state!.territories[free[0]!]!;
    delete snap.state!.territories[free[0]!];
    const broken = new RoomManager(boards, t.store, t.transport, t.now, 0, t.logger.log);
    expect(broken.loadSaved()).toBe(0);
  });

  it('pausa: solo l’host ferma il tempo, si può giocare lo stesso, alla ripresa restano almeno 15 s', () => {
    const t = playing(2);
    const { room, host, guest } = t;
    expect(room.handle(guest.id, { t: 'pause', paused: true })).toMatch(/Solo chi ha creato/);
    t.advance(room.settings.turnSeconds * 1000 - 10_000);
    expect(room.handle(host.id, { t: 'pause', paused: true })).toBeNull();
    expect(t.last(room.id, guest.id, 'status')!.paused).toEqual({ reason: 'host', remainingMs: 10_000 });
    t.advance(600_000);
    t.manager.tick();
    expect(room.state!.turn!.number).toBe(1);
    // si gioca anche a tempo fermo: il nuovo turno resta in pausa con il tempo pieno
    const p = room.state!.turn!.player;
    const own = Object.keys(room.state!.territories).find((id) => room.state!.territories[id]!.owner === p)!;
    room.handle(p, { t: 'act', action: { kind: 'reinforce', placements: { [own]: room.state!.turn!.reinforcements } } });
    room.handle(p, { t: 'act', action: { kind: 'end-turn' } });
    expect(t.last(room.id, host.id, 'status')!.paused).toEqual({ reason: 'host', remainingMs: room.settings.turnSeconds * 1000 });
    expect(room.handle(host.id, { t: 'pause', paused: false })).toBeNull();
    expect(t.last(room.id, host.id, 'status')!.deadline).toBe(t.now() + room.settings.turnSeconds * 1000);
  });

  it('se il motore fallisce allo scadere del tempo la partita si ferma, e riparte quando l’host riprova', () => {
    const t = playing(2);
    const { room, host } = t;
    timeoutSpy.mockImplementation(() => {
      throw new Error('guasto nel motore');
    });
    t.advance(room.settings.turnSeconds * 1000 + 1);
    t.manager.tick();
    expect(t.last(room.id, host.id, 'status')!.paused?.reason).toBe('error');
    expect(t.last(room.id, host.id, 'error')!.message).toMatch(/partita ferma/);
    expect(t.logger.dumps.some((d) => d.name.endsWith('-bloccata'))).toBe(true);
    timeoutSpy.mockImplementation(actual.timeout);
    room.handle(host.id, { t: 'pause', paused: false });
    t.advance(room.settings.turnSeconds * 1000 + 1);
    t.manager.tick();
    expect(room.state!.turn!.number).toBe(2);
  });

  it('a tempo fermo con l’host scollegato chi è ancora in partita lo fa ripartire (anche dopo un errore)', () => {
    const t = playing(3);
    const { room, host, guests } = t;
    const [bruno, carla] = guests as [(typeof guests)[0], (typeof guests)[0]];
    expect(room.handle(host.id, { t: 'pause', paused: true })).toBeNull();
    // l'host è collegato: decide lui
    expect(room.handle(bruno.id, { t: 'pause', paused: false })).toMatch(/Solo chi ha creato/);
    t.goOffline(room, host.id);
    expect(room.handle(carla.id, { t: 'leave' })).toBeNull();
    expect(room.handle(carla.id, { t: 'pause', paused: false })).toMatch(/Solo chi ha creato/); // è uscita
    expect(room.handle(bruno.id, { t: 'pause', paused: false })).toBeNull();
    expect(t.last(room.id, bruno.id, 'status')!.paused).toBeNull();
    expect(t.logger.lines.some((l) => l.includes('tempo ripartito da Bruno'))).toBe(true);
    // fermarlo resta solo dell'host
    expect(room.handle(bruno.id, { t: 'pause', paused: true })).toMatch(/Solo chi ha creato/);
    // pausa per errore: "Riprova" anche senza l'host
    timeoutSpy.mockImplementation(() => {
      throw new Error('guasto nel motore');
    });
    t.advance(room.settings.turnSeconds * 1000 + 1);
    t.manager.tick();
    expect(t.last(room.id, bruno.id, 'status')!.paused?.reason).toBe('error');
    timeoutSpy.mockImplementation(actual.timeout);
    expect(room.handle(bruno.id, { t: 'pause', paused: false })).toBeNull();
    expect(t.last(room.id, bruno.id, 'status')!.paused).toBeNull();
    // l'host torna: di nuovo solo lui
    t.goOnline(host.id);
    expect(room.handle(host.id, { t: 'pause', paused: true })).toBeNull();
    expect(room.handle(bruno.id, { t: 'pause', paused: false })).toMatch(/Solo chi ha creato/);
  });

  it('segnalazioni: nel registro con partita, nome e turno; per i feedback anche lo stato della partita', () => {
    const t = playing(2);
    const { room, guest } = t;
    t.manager.report(room.id, guest.id, { t: 'report', kind: 'feedback', text: 'il dado non si vede' });
    t.manager.report(room.id, guest.id, { t: 'report', kind: 'error', text: 'TypeError: x', detail: 'pila' });
    t.manager.report(null, null, { t: 'report', kind: 'error', text: 'prima di entrare' });
    expect(t.logger.reports).toMatchObject([
      { kind: 'feedback', game: room.id, name: 'Bruno', turn: 1, text: 'il dado non si vede', snapshot: expect.any(String) },
      { kind: 'error', name: 'Bruno', detail: 'pila', snapshot: null },
      { kind: 'error', game: null, name: null },
    ]);
    expect(t.logger.dumps.map((d) => d.name)).toEqual([`segnalazione-${room.id}-turno1`]);
  });

  it(`chi ha perso il link rientra con lo stesso nome nel suo posto, scollegato da almeno ${REJOIN_AFTER_MS / 1000} s`, async () => {
    const t = playing(3);
    const { room, guests } = t;
    const [bruno, carla] = guests as [(typeof guests)[0], (typeof guests)[0]];
    // collegato: il posto è suo, non lo prende nessuno
    expect(t.manager.join(room.id, 'Bruno')).toBe('La partita è già cominciata');
    t.goOffline(room, bruno.id);
    t.advance(5_000);
    expect(t.manager.join(room.id, 'bruno')).toMatch(/riprova tra 15 secondi/);
    t.advance(REJOIN_AFTER_MS);
    const back = t.manager.join(room.id.toUpperCase(), 'bruno');
    if (typeof back === 'string') throw new Error(back);
    expect(back.seat).toBe(bruno); // stesso posto, stesso token
    expect(back.seat.token).toBe(bruno.token);
    expect(room.seats).toHaveLength(3);
    expect(t.logger.lines).toContain(`Partita ${room.id}: rientra Bruno`);
    // chi è uscito non rientra, nemmeno dopo
    expect(room.handle(carla.id, { t: 'leave' })).toBeNull();
    t.goOffline(room, carla.id);
    t.advance(REJOIN_AFTER_MS + 1);
    expect(t.manager.join(room.id, 'Carla')).toBe('La partita è già cominciata');
    // dopo un riavvio chi non si è ancora visto risulta scollegato da quando la partita è ricaricata
    await saving();
    const again = new RoomManager(boards, t.store, t.transport, t.now, 0, t.logger.log);
    expect(again.loadSaved()).toBe(1);
    expect(again.join(room.id, 'Bruno')).toMatch(/riprova tra 20 secondi/);
    t.advance(REJOIN_AFTER_MS);
    const resumed = again.join(room.id, 'Bruno');
    expect(typeof resumed === 'string' ? resumed : resumed.seat.token).toBe(bruno.token);
  });

  it('nessuno collegato: la partita resta ferma invece di giocarsi da sola', () => {
    const t = playing(2);
    const { room } = t;
    const turn = room.state!.turn!.number;
    const updatedAt = room.snapshot().updatedAt;
    t.setConnected(false);
    for (let i = 0; i < 20; i++) {
      t.advance(room.settings.turnSeconds * 1000);
      t.manager.tick();
    }
    expect(room.state!.turn!.number).toBe(turn);
    expect(room.snapshot().updatedAt).toBe(updatedAt);
    // chi torna trova almeno un minuto, poi il tempo scade come sempre
    expect(room.snapshot().deadline).toBe(t.now() + 60_000);
    t.setConnected(true);
    t.advance(59_000);
    t.manager.tick();
    expect(room.state!.turn!.number).toBe(turn);
    t.advance(1_001);
    t.manager.tick();
    expect(room.state!.turn!.number).toBe(turn + 1);
  });

  it('dopo un riavvio una partita in corso si cancella solo se è ferma da più di 30 giorni', async () => {
    const t = playing(2);
    await saving();
    const snap = t.saved.get(t.room.id)!;
    snap.updatedAt = t.now() - 8 * DAY_MS; // le partite finite si cancellano già dopo 7 giorni, queste no
    expect(new RoomManager(boards, t.store, t.transport, t.now, 0, t.logger.log).loadSaved()).toBe(1);
    snap.updatedAt = t.now() - 31 * DAY_MS;
    expect(new RoomManager(boards, t.store, t.transport, t.now, 0, t.logger.log).loadSaved()).toBe(0);
    expect(t.saved.has(t.room.id)).toBe(false);
  });

  it('le opzioni restano quelle con cui è cominciata anche se cambiano le regole predefinite', async () => {
    const t = lobby(2);
    expect(t.room.handle(t.host.id, { t: 'start' })).toBeNull();
    expect(t.room.snapshot().settings).toEqual(t.room.settings);
    expect(t.room.settings).toMatchObject({ placement: 'rounds', combat: 'pairs' });
    await saving();
    // regole.json cambiato tra una sera e l'altra: piazzamento tutti insieme e combattimento a colpi
    const rules = {
      ...boards.rules,
      setup: { ...boards.rules.setup, placement: 'simultaneous' },
      dice: { ...boards.rules.dice, combat: 'hits' },
    };
    const changed = Object.create(boards, { rules: { value: rules } }) as BoardProvider;
    const again = new RoomManager(changed, t.store, t.transport, t.now, 0, t.logger.log);
    expect(again.loadSaved()).toBe(1);
    const room = again.byToken(t.host.token)!.room;
    expect(room.settings).toMatchObject({ placement: 'rounds', combat: 'pairs' });
    expect(room.lobbyInfo().rules.setup.placement).toBe('rounds');
    expect(room.lobbyInfo().rules.dice.combat).toBe('pairs');
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
      const manager = new RoomManager(boards, store, t.transport, t.now, 0, t.logger.log);
      const { room } = manager.create('Anna', '#4a8ff0', {});
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

describe('tabelloni', () => {
  const settings: RoomSettings = {
    board: 'mondo',
    mode: 'objectives',
    distribution: 'draft',
    placement: 'rounds',
    turnSeconds: 180,
    combat: 'pairs',
    ties: 'defender',
    defenseDice: 3,
  };

  it('i contesti delle opzioni condividono il tabellone e non crescono all’infinito', () => {
    const lib = new BoardLibrary(DATA_DIR);
    const base = lib.context(settings);
    const other = lib.context({ ...settings, turnSeconds: 31, combat: 'hits' });
    expect(other.board).toBe(base.board);
    expect(other.neighbours).toBe(base.neighbours);
    expect(other.rules.timers.turnSeconds).toBe(31);
    expect(other.rules.dice.combat).toBe('hits');
    expect(base.rules.timers.turnSeconds).toBe(180);
    expect(base.rules.dice.combat).toBe('pairs');
    expect(lib.context({ ...settings, turnSeconds: 31, combat: 'hits' })).toBe(other); // in memoria
    // opzioni provate a raffica: le più vecchie escono dalla memoria (e si ricostruiscono se servono)
    for (let s = 32; s <= 900; s++) lib.context({ ...settings, turnSeconds: s });
    expect(lib.context({ ...settings, turnSeconds: 900 })).toBe(lib.context({ ...settings, turnSeconds: 900 }));
    const rebuilt = lib.context({ ...settings, turnSeconds: 31, combat: 'hits' });
    expect(rebuilt).not.toBe(other);
    expect(rebuilt).toEqual(other);
  });
});
