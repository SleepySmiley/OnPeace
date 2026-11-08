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
import { parseRules, type PlayerId } from '@onpeace/engine';
import { parseClientMsg, type ClientMsg, type ServerMsg } from '@onpeace/protocol';
import { describeError, fileLogger } from './log';
import { RoomManager } from './manager';
import { MapLibrary } from './maps';
import { staticHandler } from './static';
import { Storage } from './storage';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const PORT = Number(process.env.PORT ?? 3210);
const DATA_DIR = process.env.DATA_DIR ?? join(repoRoot, 'games');
const LOG_DIR = process.env.LOG_DIR ?? join(repoRoot, 'logs');
const log = fileLogger(LOG_DIR);
/** Indirizzo pubblico (tunnel): da PUBLIC_URL o comunicato da `npm run serata` quando il tunnel è pronto. */
let publicUrl: string | null = process.env.PUBLIC_URL || null;
const readJson = (...p: string[]) => JSON.parse(readFileSync(join(repoRoot, 'data', ...p), 'utf8'));

const rules = parseRules({
  units: readJson('rules', 'units.json'),
  buildings: readJson('rules', 'buildings.json'),
  defaults: readJson('rules', 'defaults.json'),
  strategies: readJson('rules', 'strategies.json'),
  general: readJson('rules', 'general.json'),
});
const maps = new MapLibrary(join(repoRoot, 'data', 'maps'), rules);

// ---------------------------------------------------------------- connessioni
interface Conn {
  ws: WebSocket;
  room: string | null;
  player: PlayerId | null;
  alive: boolean;
  /** Segnalazioni ricevute da questa connessione (con un tetto, contro gli errori a raffica). */
  reports: number;
}
const MAX_REPORTS_PER_CONN = 30;
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
  maps,
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
  if (msg.t === 'report') {
    // solo da chi è in una partita (ha il link d'invito): il server è su Internet, il disco no
    if (!conn.room || ++conn.reports > MAX_REPORTS_PER_CONN) return;
    manager.report(conn.room, conn.player, msg);
    if (msg.kind === 'feedback') raw(conn, { t: 'notice', message: 'Grazie! Segnalazione registrata.' });
    return;
  }
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
const serveClient = staticHandler(join(repoRoot, 'apps', 'client', 'dist'));
const server = createServer((req, res) => {
  if (!maps.handle(req, res)) serveClient(req, res);
});
// compressione: la vista della partita è JSON ripetitivo (100+ kB a fine partita), compressa pesa ~6 volte meno
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 256 * 1024,
  perMessageDeflate: { threshold: 1024 },
});

wss.on('connection', (ws) => {
  const conn: Conn = { ws, room: null, player: null, alive: true, reports: 0 };
  conns.add(conn);
  ws.on('pong', () => (conn.alive = true));
  raw(conn, { t: 'server', publicUrl });

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

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') throw err;
  log.error(`La porta ${PORT} è già occupata: c'è già un server OnPeace aperto? Chiudilo e riprova.`);
  process.exit(2); // 2 = da non riavviare (vedi tools/serata.ts)
});
server.listen(PORT, () => {
  log.info(`OnPeace: http://localhost:${PORT}  (partite ricaricate: ${loaded}, salvataggi in ${DATA_DIR})`);
});

// messaggi da `npm run serata`: indirizzo del tunnel e chiusura ordinata
process.on('message', (m: { t?: string; publicUrl?: string | null }) => {
  if (m?.t === 'publicUrl') {
    publicUrl = m.publicUrl ?? null;
    log.info(`Indirizzo pubblico: ${publicUrl ?? 'nessuno'}`);
    for (const c of conns) raw(c, { t: 'server', publicUrl });
  } else if (m?.t === 'shutdown') {
    shutdown();
  }
});
// se `npm run serata` muore all'improvviso il server non resta acceso da solo
process.on('disconnect', () => {
  log.info('npm run serata si è chiuso: chiudo anche il server');
  shutdown();
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
