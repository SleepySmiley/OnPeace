/**
 * Prova generale: giocatori simulati fanno una partita intera contro un server vero, come farebbero
 * gli amici dai loro browser. Piazzano, giocano i tris, attaccano, occupano, spostano, chattano,
 * mandano ogni tanto una mossa sbagliata apposta, cadono e rientrano col token; uno esce a metà
 * partita (il server deve giocare al posto suo). Alla fine stampa un resoconto: errori ricevuti,
 * errori nel registro del server, durata dei turni, dimensione dei messaggi.
 *
 *   npm run prova                                   avvia un server di prova (cartelle temporanee)
 *   npm run prova -- --url https://xxx.trycloudflare.com    contro un server già acceso (anche dal tunnel)
 *   opzioni: --giocatori 4   --giri 40   --seme 1   --modo conquest|objectives   --piazzamento rounds|simultaneous
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { BoardDef, boardNeighbours, createRng } from '@onpeace/engine';
import { possibleSets, type Action, type ConquestRules, type GameView } from '@onpeace/conquista';
import { PLAYER_COLORS, type ClientMsg, type LobbyInfo, type ServerMsg } from '@onpeace/protocol';
import { dataDir, readJson, repoRoot } from './data-io';

const arg = (name: string, def: string | null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
};
const PLAYERS = Math.min(8, Math.max(2, Number(arg('giocatori', '4'))));
const ROUNDS = Math.max(3, Number(arg('giri', '40')));
const SEED = Number(arg('seme', '1'));
const MODE = arg('modo', PLAYERS >= 3 ? 'objectives' : 'conquest') as 'objectives' | 'conquest';
const PLACEMENT = arg('piazzamento', 'simultaneous') as 'rounds' | 'simultaneous';
const TIMEOUT_MS = 10 * 60_000;

const board = BoardDef.parse(readJson(join(dataDir, 'territori', 'mondo.json')));
const neighbours = boardNeighbours(board);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => console.log(`[prova] ${line}`);

/** Aspetta una condizione, ma non per sempre: se il server rifiuta (opzioni sbagliate…) si esce con un errore. */
async function until(cond: () => boolean, what: string, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`${what} (dopo ${ms / 1000} s)`);
    await wait(20);
  }
}
type Rng = ReturnType<typeof createRng>;

// ---------------------------------------------------------------- statistiche

interface Stats {
  errors: Map<string, number>;
  /** Mosse sbagliate mandate apposta (il server deve rifiutarle con un messaggio). */
  wrongOnPurpose: number;
  maxGameBytes: number;
  maxGameCompressed: number;
  reconnects: number;
  turnTimes: number[];
  actions: number;
  events: Map<string, number>;
}
const stats: Stats = {
  errors: new Map(),
  wrongOnPurpose: 0,
  maxGameBytes: 0,
  maxGameCompressed: 0,
  reconnects: 0,
  turnTimes: [],
  actions: 0,
  events: new Map(),
};
const countError = (m: string) => stats.errors.set(m, (stats.errors.get(m) ?? 0) + 1);

// ---------------------------------------------------------------- mosse sulla propria vista

const ownedBy = (v: GameView, id: string) => Object.keys(v.territories).filter((t) => v.territories[t]!.owner === id);
const isBorder = (v: GameView, t: string) => (neighbours.get(t) ?? []).some((n) => v.territories[n]!.owner !== v.territories[t]!.owner);

/** Distribuisce `n` armate sui territori di confine (soprattutto uno, per fare massa). */
function spread(v: GameView, me: string, n: number, rng: Rng): Record<string, number> {
  const mine = ownedBy(v, me);
  const border = mine.filter((t) => isBorder(v, t));
  const pool = border.length > 0 ? border : mine;
  const main = rng.pick(pool);
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const t = rng.next() < 0.6 ? main : rng.pick(pool);
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/** La prossima mossa (null: niente da fare adesso). */
function nextAction(v: GameView, me: string, rules: ConquestRules, rng: Rng, attacks: number): Action | null {
  const p = v.players.find((x) => x.id === me);
  if (!p || !p.alive || v.phase === 'over') return null;
  if (v.phase === 'setup') {
    if (p.setupDone || p.pending) return null;
    if (rules.setup.placement === 'rounds' && v.setupPlayer !== me) return null;
    const step = rules.setup.placement === 'rounds' ? Math.min(rules.setup.perRound, p.setupLeft) : p.setupLeft;
    return { kind: 'setup-place', placements: spread(v, me, step, rng) };
  }
  const turn = v.turn;
  if (!turn || turn.player !== me) return null;
  if (turn.occupation) {
    const { min, max } = turn.occupation;
    return { kind: 'occupy', armies: rng.next() < 0.7 ? max : rng.int(min, max) };
  }
  if (v.phase === 'reinforce') {
    const sets = possibleSets(rules, p.cards ?? []);
    if (sets.length > 0 && (p.cards!.length >= 5 || rng.next() < 0.5)) {
      return { kind: 'play-set', cards: sets[0]!.cards.map((c) => c.id) as [string, string, string] };
    }
    return { kind: 'reinforce', placements: spread(v, me, turn.reinforcements, rng) };
  }
  // regola Prestige: prima della fine del giro protetto nessuno si elimina
  const protectedTurns = rules.elimination.protectedRounds * v.order.length;
  const canEliminate = turn.number > protectedTurns;
  if (v.phase === 'attack' && attacks < 40) {
    const options: { from: string; to: string; edge: number }[] = [];
    for (const from of ownedBy(v, me)) {
      const a = v.territories[from]!.armies;
      if (a < 2) continue;
      for (const to of neighbours.get(from) ?? []) {
        const d = v.territories[to]!;
        if (d.owner === me) continue;
        if (!canEliminate && ownedBy(v, d.owner).length <= 1) continue;
        options.push({ from, to, edge: a - d.armies });
      }
    }
    const good = options.filter((o) => o.edge >= 2).sort((x, y) => y.edge - x.edge);
    if (good.length > 0 && rng.next() < 0.93) {
      const o = rng.next() < 0.7 ? good[0]! : rng.pick(good);
      return { kind: 'attack', from: o.from, to: o.to, dice: Math.min(rules.dice.attackMax, v.territories[o.from]!.armies - 1) };
    }
  }
  if (v.phase === 'attack' && turn.fortifyLeft > 0) return { kind: 'end-attack' };
  if (v.phase === 'fortify' && rng.next() < 0.6) {
    // dall'interno verso il confine
    const inner = ownedBy(v, me).filter((t) => v.territories[t]!.armies > 1 && !isBorder(v, t));
    for (const from of inner) {
      const to = (neighbours.get(from) ?? []).find((n) => v.territories[n]!.owner === me && isBorder(v, n));
      if (to) return { kind: 'fortify', from, to, armies: v.territories[from]!.armies - 1 };
    }
  }
  return { kind: 'end-turn' };
}

/** Una mossa sbagliata apposta: il server deve rifiutarla con un messaggio, senza cadere. */
function wrongAction(v: GameView, me: string, rng: Rng): Action {
  const foreign = Object.keys(v.territories).find((t) => v.territories[t]!.owner !== me) ?? 'atlantide';
  return rng.pick<Action>([
    { kind: 'reinforce', placements: { [foreign]: 3 } },
    { kind: 'attack', from: foreign, to: foreign, dice: 3 },
    { kind: 'occupy', armies: 999 },
    { kind: 'play-set', cards: ['x', 'y', 'z'] },
    { kind: 'fortify', from: foreign, to: 'atlantide', armies: 1 },
  ]);
}

// ---------------------------------------------------------------- giocatore simulato

class Bot {
  ws: WebSocket | null = null;
  me: string | null = null;
  token: string | null = null;
  view: GameView | null = null;
  lobby: LobbyInfo | null = null;
  /** Ultimo evento visto (per contarli una volta sola). */
  seen = 0;
  busy = false;
  attacks = 0;
  attackTurn = 0;
  /** Esce dalla partita a questo turno (0: mai). */
  quitAt = 0;
  quit = false;
  /** Errori di fila: dopo qualche tentativo si aspetta la prossima vista (o il tempo scaduto). */
  fails = 0;
  /** Numero dell'ultima mossa mandata; finché il server non risponde (ack) non se ne mandano altre. */
  sent = 0;
  waiting = false;

  constructor(
    readonly name: string,
    readonly color: string,
    readonly rng: Rng,
    readonly wsUrl: string,
    readonly counts: boolean,
  ) {}

  connect(first: ClientMsg): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify(first));
        resolve();
      };
      ws.onerror = () => reject(new Error(`${this.name}: connessione non riuscita`));
      ws.onmessage = (e) => {
        const text = String(e.data);
        this.handle(JSON.parse(text) as ServerMsg, text.length);
      };
    });
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Manda una mossa e aspetta la risposta del server prima della prossima. */
  act(action: Action) {
    this.sent++;
    this.waiting = true;
    this.send({ t: 'act', action, n: this.sent });
  }

  /** Cade la linea e si rientra con il token, come chi chiude il portatile. */
  async dropAndRejoin() {
    this.ws?.close();
    this.waiting = false; // la risposta non arriverà più: al rientro si riparte dalla vista nuova
    await wait(300 + this.rng.int(0, 1200));
    stats.reconnects++;
    await this.connect({ t: 'hello', token: this.token! });
  }

  handle(msg: ServerMsg, bytes: number) {
    switch (msg.t) {
      case 'welcome':
        this.me = msg.you;
        this.token = msg.token;
        return;
      case 'lobby':
        this.lobby = msg.lobby;
        return;
      case 'game':
        if (bytes > stats.maxGameBytes) {
          stats.maxGameBytes = bytes;
          stats.maxGameCompressed = deflateRawSync(JSON.stringify(msg)).length;
        }
        this.view = msg.view;
        this.fails = 0;
        if (msg.ack === this.sent) this.waiting = false;
        for (const e of msg.log) {
          if (e.seq <= this.seen) continue;
          this.seen = e.seq;
          if (this.counts) stats.events.set(e.event.type, (stats.events.get(e.event.type) ?? 0) + 1);
        }
        void this.play();
        return;
      case 'error':
        countError(msg.message);
        if (msg.ack === this.sent) this.waiting = false;
        if (this.fails++ < 3) void this.play();
        return;
      default:
        return;
    }
  }

  private async play() {
    const v = this.view;
    const rules = this.lobby?.rules;
    if (!v || !rules || !this.me || this.busy || this.waiting || this.quit) return;
    const turn = v.turn;
    if (turn && turn.player === this.me && turn.number !== this.attackTurn) {
      this.attackTurn = turn.number;
      this.attacks = 0;
    }
    if (this.quitAt > 0 && turn && turn.number >= this.quitAt) {
      this.quit = true;
      log(`${this.name} esce dalla partita al turno ${turn.number}`);
      this.send({ t: 'leave' });
      return;
    }
    const action = nextAction(v, this.me, rules, this.rng, this.attacks);
    if (!action) return;
    this.busy = true;
    try {
      await wait(this.rng.int(5, 60)); // il tempo di pensarci
      if (this.rng.next() < 0.02) {
        stats.wrongOnPurpose++;
        this.act(wrongAction(v, this.me, this.rng));
        return; // la risposta (un errore) fa ripartire il giocatore
      }
      if (action.kind === 'attack') this.attacks++;
      stats.actions++;
      this.act(action);
      if (this.rng.next() < 0.01) this.send({ t: 'chat', text: `turno ${turn?.number ?? 0}: ${action.kind}` });
      if (this.rng.next() < 0.004) await this.dropAndRejoin().catch((err: Error) => countError(`rientro non riuscito: ${err.message}`));
    } finally {
      this.busy = false;
    }
  }
}

// ---------------------------------------------------------------- server di prova (se non c'è --url)

async function startServer(): Promise<{ url: string; logDir: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), 'onpeace-prova-'));
  const port = 3399;
  const busy = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    () => false,
  );
  if (busy) throw new Error(`la porta ${port} è già occupata: chiudi l'altro server di prova e riprova`);
  const proc = spawn(process.execPath, ['--import', 'tsx', join('apps', 'server', 'src', 'main.ts')], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PORT: String(port), DATA_DIR: join(dir, 'games'), LOG_DIR: join(dir, 'logs') },
  });
  process.on('exit', () => proc.kill()); // anche se la prova finisce con un errore
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    // il server di prova è caduto (es. porta occupata): altrimenti si proverebbe contro un altro processo
    if (proc.exitCode !== null) throw new Error(`il server di prova non parte (porta ${port} occupata?)`);
    try {
      await fetch(url); // basta una risposta, anche 503 se il client non è compilato
      return { url, logDir: join(dir, 'logs'), proc };
    } catch {
      await wait(250);
    }
  }
  proc.kill();
  throw new Error('il server di prova non parte');
}

// ---------------------------------------------------------------- partita

async function main() {
  const given = arg('url', null);
  const server = given ? null : await startServer();
  const base = given ?? server!.url;
  const wsUrl = `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
  log(`${PLAYERS} giocatori, al massimo ${ROUNDS} giri, modo ${MODE}, piazzamento ${PLACEMENT}, seme ${SEED}, server ${base}`);

  const rng = createRng(SEED);
  const bots = Array.from(
    { length: PLAYERS },
    (_, i) => new Bot(`Bot${i + 1}`, PLAYER_COLORS[i]!, createRng(rng.int(1, 2 ** 30)), wsUrl, i === 0),
  );
  const [host, ...guests] = bots as [Bot, ...Bot[]];
  // con almeno tre giocatori l'ultimo esce a metà partita: il server deve giocare al posto suo
  if (PLAYERS >= 3) guests.at(-1)!.quitAt = PLAYERS * 6;
  const started = Date.now();

  await host.connect({ t: 'create', name: host.name, color: host.color, settings: { mode: MODE, placement: PLACEMENT, turnSeconds: 60 } });
  await until(() => !!host.lobby, 'la partita non è stata creata');
  const game = host.lobby!.id; // c'è: lo garantisce until() qui sopra
  for (const b of guests) await b.connect({ t: 'join', game, name: b.name, color: b.color });
  await until(() => (host.lobby?.players.length ?? 0) >= PLAYERS, 'non sono entrati tutti i giocatori');
  host.send({ t: 'start' });
  await until(() => host.lobby?.phase === 'playing', 'la partita non comincia');
  log(`partita ${game}: preparazione`);

  let lastTurn = 0;
  let lastAt = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const v = host.view;
    const turn = v?.turn?.number ?? 0;
    if (v && turn !== lastTurn) {
      if (lastTurn > 0) stats.turnTimes.push(Date.now() - lastAt);
      lastTurn = turn;
      lastAt = Date.now();
      if (turn % v.order.length === 1 || v.order.length === 1) {
        const alive = v.players.filter((p) => p.alive);
        const counts = alive.map((p) => `${p.name} ${ownedBy(v, p.id).length}`).join(', ');
        log(`giro ${Math.ceil(turn / v.order.length)}: ${counts}`);
      }
    }
    if (v?.phase === 'over' || host.lobby?.phase === 'ended') break;
    if (v && turn > ROUNDS * v.order.length) break;
    await wait(50);
  }

  const v = host.view;
  const ended = v?.phase === 'over';
  const winner = v?.players.find((p) => p.id === v.winner);
  for (const b of bots) b.ws?.close();

  // registro del server: righe di errore e file per riprodurli
  let serverErrors: string[] = [];
  let dumps: string[] = [];
  if (server) {
    await wait(500);
    server.proc.kill();
    const logDir = server.logDir;
    for (const f of existsSync(logDir) ? readdirSync(logDir).filter((x) => x.endsWith('.log')) : []) {
      const text = readFileSync(join(logDir, f), 'utf8');
      serverErrors = serverErrors.concat(text.split('\n').filter((l) => l.includes('ERRORE')));
    }
    if (existsSync(join(logDir, 'errori'))) dumps = readdirSync(join(logDir, 'errori')).map((f) => join(logDir, 'errori', f));
  }

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const totalErrors = [...stats.errors.values()].reduce((a, b) => a + b, 0);
  console.log('\n──────────── resoconto della prova generale');
  console.log(
    `  partita:             ${ended ? `finita al turno ${lastTurn}, vince ${winner?.name ?? 'nessuno'}` : `NON finita (turno ${lastTurn}, limite di ${ROUNDS} giri)`}`,
  );
  console.log(`  durata:              ${Math.round((Date.now() - started) / 1000)} s, turno medio ${avg(stats.turnTimes)} ms`);
  console.log(
    `  messaggio più grande: ${Math.round(stats.maxGameBytes / 1024)} kB (vista della partita), ` +
      `compresso ${Math.round(stats.maxGameCompressed / 1024)} kB`,
  );
  console.log(`  cadute e rientri:    ${stats.reconnects}`);
  console.log(`  mosse:               ${stats.actions} (più ${stats.wrongOnPurpose} sbagliate apposta)`);
  const kinds = [...stats.events].map(([k, n]) => `${k} ${n}`).sort();
  console.log(`  eventi:              ${kinds.join(', ')}`);
  console.log(`  errori ai giocatori: ${totalErrors}`);
  for (const [m, n] of [...stats.errors].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${n}× ${m}`);
  if (server) {
    console.log(`  errori del server:   ${serverErrors.length}`);
    for (const l of serverErrors.slice(0, 8)) console.log(`      ${l}`);
    for (const d of dumps) console.log(`      da riprodurre: ${d}`);
  }
  console.log('──────────────────────────────────────────\n');
  // le mosse sbagliate apposta producono un errore ciascuna; di più vuol dire che un giocatore "onesto" è stato rifiutato
  const unexpected = totalErrors > stats.wrongOnPurpose;
  const bad = serverErrors.length > 0 || dumps.length > 0 || unexpected || lastTurn === 0;
  if (unexpected) console.log('  ATTENZIONE: il server ha rifiutato mosse che il giocatore simulato credeva valide.');
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
