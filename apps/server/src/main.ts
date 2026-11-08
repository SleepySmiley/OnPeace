/**
 * Server di OnPeace: serve il client e gestisce le partite via WebSocket su /ws.
 *
 *   PORT      porta HTTP (predefinita 3210)
 *   DATA_DIR  cartella dei salvataggi (predefinita <repo>/games)
 *   LOG_DIR   cartella del registro e degli errori da riprodurre (predefinita <repo>/logs)
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { MapDef, NavGrid, createContext, parseRules, type PlayerId } from '@onpeace/engine';
import { parseClientMsg, type ClientMsg, type ServerMsg } from '@onpeace/protocol';
import { describeError, fileLogger } from './log';
import { RoomManager } from './manager';
import { staticHandler } from './static';
import { Storage } from './storage';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const PORT = Number(process.env.PORT ?? 3210);
const DATA_DIR = process.env.DATA_DIR ?? join(repoRoot, 'games');
const LOG_DIR = process.env.LOG_DIR ?? join(repoRoot, 'logs');
const log = fileLogger(LOG_DIR);
const readJson = (...p: string[]) => JSON.parse(readFileSync(join(repoRoot, 'data', ...p), 'utf8'));

const rules = parseRules({
  units: readJson('rules', 'units.json'),
  buildings: readJson('rules', 'buildings.json'),
  defaults: readJson('rules', 'defaults.json'),
  strategies: readJson('rules', 'strategies.json'),
  general: readJson('rules', 'general.json'),
});
const map = MapDef.parse(readJson('maps', 'prova.json'));
const ctx = createContext(map, rules);
const nav = new NavGrid(map);

// ---------------------------------------------------------------- connessioni
interface Conn {
  ws: WebSocket;
  room: string | null;
  player: PlayerId | null;
  alive: boolean;
}
const conns = new Set<Conn>();
const key = (room: string, player: PlayerId) => `${room}:${player}`;
const byPlayer = new Map<string, Set<Conn>>();

function attach(conn: Conn, room: string, player: PlayerId) {
  detach(conn);
  conn.room = room;
  conn.player = player;
  const k = key(room, player);
  if (!byPlayer.has(k)) byPlayer.set(k, new Set());
  byPlayer.get(k)!.add(conn);
}

function detach(conn: Conn) {
  if (!conn.room || !conn.player) return;
  const k = key(conn.room, conn.player);
  byPlayer.get(k)?.delete(conn);
  if (byPlayer.get(k)?.size === 0) byPlayer.delete(k);
}

const raw = (conn: Conn, msg: ServerMsg) => {
  if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
};

const manager = new RoomManager(
  ctx,
  nav,
  new Storage(DATA_DIR),
  {
    send(room, player, msg) {
      for (const c of byPlayer.get(key(room, player)) ?? []) raw(c, msg);
    },
    isConnected(room, player) {
      return (byPlayer.get(key(room, player))?.size ?? 0) > 0;
    },
  },
  Date.now,
  400,
  log,
);
const loaded = manager.loadSaved();

function handleMessage(conn: Conn, msg: ClientMsg): void {
  if (msg.t === 'hello') {
    const found = msg.token ? manager.byToken(msg.token) : null;
    if (!found) return msg.token ? raw(conn, { t: 'error', message: 'Sessione scaduta: rientra dal link' }) : undefined;
    attach(conn, found.room.id, found.seat.id);
    raw(conn, { t: 'welcome', token: found.seat.token, game: found.room.id, you: found.seat.id });
    found.room.syncPlayer(found.seat.id);
    found.room.broadcastLobby(); // gli altri vedono che è tornato online
    return;
  }
  if (msg.t === 'create') {
    const { room, seat } = manager.create(msg.name, msg.color, msg.settings);
    attach(conn, room.id, seat.id);
    raw(conn, { t: 'welcome', token: seat.token, game: room.id, you: seat.id });
    room.syncPlayer(seat.id);
    return;
  }
  if (msg.t === 'join') {
    const res = manager.join(msg.game, msg.name, msg.color);
    if (typeof res === 'string') return raw(conn, { t: 'error', message: res });
    attach(conn, res.room.id, res.seat.id);
    raw(conn, { t: 'welcome', token: res.seat.token, game: res.room.id, you: res.seat.id });
    res.room.syncPlayer(res.seat.id);
    res.room.broadcastLobby(); // ora risulta collegato anche per gli altri
    return;
  }
  if (!conn.room || !conn.player) return raw(conn, { t: 'error', message: 'Prima entra in una partita' });
  const error = manager.handle(conn.room, conn.player, msg);
  if (error) raw(conn, { t: 'error', message: error });
}

// ---------------------------------------------------------------- HTTP + WebSocket
const server = createServer(staticHandler(join(repoRoot, 'apps', 'client', 'dist')));
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });

wss.on('connection', (ws) => {
  const conn: Conn = { ws, room: null, player: null, alive: true };
  conns.add(conn);
  ws.on('pong', () => (conn.alive = true));

  ws.on('message', (data) => {
    const msg = parseClientMsg(String(data));
    if ('error' in msg) return raw(conn, { t: 'error', message: msg.error });
    try {
      handleMessage(conn, msg);
    } catch (err) {
      // un errore del motore su un messaggio non deve far cadere il server per tutti
      log.error(`Partita ${conn.room ?? '-'}, ${conn.player ?? '-'}: errore gestendo "${msg.t}"`, err);
      const room = conn.room ? manager.rooms.get(conn.room) : undefined;
      log.dump(`messaggio-${conn.room ?? 'nessuna'}`, { error: describeError(err), msg, room: room?.snapshot() });
      raw(conn, { t: 'error', message: 'Errore del server: azione non eseguita. Il problema è stato registrato.' });
    }
  });

  ws.on('close', () => {
    conns.delete(conn);
    const room = conn.room ? manager.rooms.get(conn.room) : undefined;
    detach(conn);
    room?.broadcastLobby();
  });
});

// connessioni morte (es. portatile chiuso): ping ogni 30 s
const heartbeat = setInterval(() => {
  for (const c of conns) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 30_000);

const ticker = setInterval(() => manager.tick(), 1000);

server.listen(PORT, () => {
  log.info(`OnPeace: http://localhost:${PORT}  (partite ricaricate: ${loaded}, salvataggi in ${DATA_DIR})`);
});

function shutdown(code = 0) {
  clearInterval(heartbeat);
  clearInterval(ticker);
  manager.flush();
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
// errore imprevisto: si salva tutto e si esce; `npm run serata` riavvia il server e le partite riprendono
process.on('uncaughtException', (err) => {
  log.error('Errore imprevisto: il server si chiude dopo aver salvato le partite', err);
  shutdown(1);
});
process.on('unhandledRejection', (err) => {
  log.error('Errore imprevisto (promessa): il server si chiude dopo aver salvato le partite', err);
  shutdown(1);
});
