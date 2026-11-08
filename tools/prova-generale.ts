/**
 * Prova generale: giocatori simulati fanno una partita intera contro un server vero, come farebbero
 * gli amici dai loro browser. Scelgono strategia e Generale, scelgono i paesi, danno ordini casuali
 * (quasi tutti validi, qualcuno sbagliato apposta), chattano, ogni tanto cadono e rientrano col token.
 * Alla fine stampa un resoconto: errori ricevuti, errori nel registro del server, tempi, dimensione dei messaggi.
 *
 *   npm run prova                                   avvia un server di prova (cartelle temporanee)
 *   npm run prova -- --url https://xxx.trycloudflare.com    contro un server già acceso (anche dal tunnel)
 *   opzioni: --giocatori 6   --turni 25   --seme 1   --mappa europa
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  MapDef,
  NavGrid,
  affordableCountries,
  createContext,
  createRng,
  distance,
  isPurchasable,
  relationKey,
  simulatePlan,
  summarize,
  type Action,
  type GameState,
  type PlayerId,
  type Point,
} from '@onpeace/engine';
import { PLAYER_COLORS, toWirePlan, type ClientMsg, type LobbyInfo, type ServerMsg } from '@onpeace/protocol';
import { dataDir, loadRules, readJson, repoRoot } from './data-io';

const arg = (name: string, def: string | null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
};
const PLAYERS = Math.min(8, Math.max(2, Number(arg('giocatori', '6'))));
const TURNS = Math.max(5, Number(arg('turni', '25')));
const SEED = Number(arg('seme', '1'));
const MAP_ID = arg('mappa', 'prova')!;
const TIMEOUT_MS = 10 * 60_000;

const ctx = createContext(MapDef.parse(readJson(join(dataDir, 'maps', `${MAP_ID}.json`))), loadRules());
const nav = new NavGrid(ctx.map);
const BUYABLE = [...ctx.catalog.units.values()].filter(isPurchasable);
const BUILDINGS = [...ctx.catalog.buildings.values()];
const STRATEGIES = [...ctx.catalog.strategies.keys()];
const UPGRADES = [...ctx.catalog.generalUpgrades.keys()];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => console.log(`[prova] ${line}`);
type Rng = ReturnType<typeof createRng>;

// ---------------------------------------------------------------- ordini casuali sulla propria vista

function randomPlan(view: GameState, me: PlayerId, rng: Rng): Action[] {
  const actions: Action[] = [];
  for (const city of Object.values(view.cities)) {
    if (city.owner !== me || city.reinforcements === 0 || rng.next() < 0.4) continue;
    const def = ctx.cities.get(city.id)!;
    const options = BUYABLE.filter((u) => u.domain !== 'naval' || def.port);
    const type = rng.pick(options).id;
    const buildings = rng.next() < 0.08 ? [rng.pick(BUILDINGS).id] : [];
    actions.push({ kind: 'buy', order: { city: city.id, units: [{ type, count: rng.int(1, city.reinforcements) }], buildings } });
  }
  for (const stack of view.stacks) {
    if (stack.owner !== me || stack.units.length === 0 || rng.next() < 0.25) continue;
    const from = { stack: stack.id };
    const withCargo = stack.units.filter((u) => u.cargo.length > 0);
    if (withCargo.length > 0 && rng.next() < 0.5) {
      const a = rng.next() * Math.PI * 2;
      const to: Point = [stack.pos[0] + Math.cos(a), stack.pos[1] + Math.sin(a)];
      actions.push({ kind: 'unload', from, units: summarize(withCargo.flatMap((u) => u.cargo)), to });
      continue;
    }
    const land = stack.units.filter((u) => ctx.catalog.unit(u.type).domain === 'land');
    if (stack.units.some((u) => ctx.catalog.unit(u.type).cargo) && land.length > 0 && rng.next() < 0.4) {
      actions.push({ kind: 'load', from, units: summarize(land) });
      continue;
    }
    const type = rng.pick([...new Set(stack.units.map((u) => u.type))]);
    const def = ctx.catalog.unit(type);
    if (def.move === 0) continue;
    const units = [{ type, count: rng.int(1, stack.units.filter((u) => u.type === type).length) }];
    const reach = def.move * ctx.map.rangeScale;
    const enemies = view.stacks.filter((x) => x.owner !== me && !x.fog && distance(x.pos, stack.pos) <= reach);
    const target = ctx.map.cities
      .filter((c) => view.cities[c.id]!.owner !== me)
      .sort((x, y) => distance(x.pos, stack.pos) - distance(y.pos, stack.pos))[0];
    if (enemies.length > 0 && rng.next() < 0.3) {
      const t = rng.pick(enemies);
      actions.push({ kind: 'move', from, units, path: [t.pos], target: t.id });
    } else if (target && rng.next() < 0.75) {
      const d = distance(target.pos, stack.pos);
      const k = d <= reach ? 1 : (reach * 0.95) / d;
      const to: Point = [stack.pos[0] + (target.pos[0] - stack.pos[0]) * k, stack.pos[1] + (target.pos[1] - stack.pos[1]) * k];
      actions.push({ kind: 'move', from, units, path: [to] });
    } else {
      const a = rng.next() * Math.PI * 2;
      const r = reach * rng.next();
      actions.push({ kind: 'move', from, units, path: [[stack.pos[0] + Math.cos(a) * r, stack.pos[1] + Math.sin(a) * r]] });
    }
  }
  const others = view.players.filter((p) => p.id !== me && p.status === 'active');
  if (others.length > 0 && rng.next() < 0.15) {
    actions.push({ kind: 'diplomacy', to: rng.pick(others).id, proposal: rng.pick(['peace', 'alliance', 'war'] as const) });
  }
  for (const p of view.proposals) if (p.to === me) actions.push({ kind: 'respond', proposal: p.id, accept: rng.next() < 0.6 });
  const allies = others.filter((p) => view.relations[relationKey(me, p.id)]?.relation === 'alliance');
  if (allies.length > 0 && rng.next() < 0.2) actions.push({ kind: 'send_money', to: rng.pick(allies).id, amount: rng.int(1, 300) });

  // come nel browser si tengono gli ordini validi; uno su dieci di quelli sbagliati parte lo stesso
  const preview = simulatePlan(view, ctx, nav, me, actions);
  return actions.filter((_, i) => preview.steps[i]?.ok || rng.next() < 0.1);
}

// ---------------------------------------------------------------- giocatore simulato

interface Stats {
  errors: Map<string, number>;
  maxGameBytes: number;
  maxGameCompressed: number;
  reconnects: number;
  turnTimes: number[];
  orders: number;
  /** Eventi visti dall'host e dagli altri (un evento visto da più giocatori conta una volta per tipo e turno). */
  events: Map<string, Set<string>>;
}
const stats: Stats = {
  errors: new Map(),
  maxGameBytes: 0,
  maxGameCompressed: 0,
  reconnects: 0,
  turnTimes: [],
  orders: 0,
  events: new Map(),
};
const countError = (m: string) => stats.errors.set(m, (stats.errors.get(m) ?? 0) + 1);

class Bot {
  ws: WebSocket | null = null;
  me: PlayerId | null = null;
  token: string | null = null;
  view: GameState | null = null;
  lobby: LobbyInfo | null = null;
  picker: PlayerId | null = null;
  plannedTurn = 0;
  tried = new Set<string>();
  doctrineSent = false;

  constructor(
    readonly name: string,
    readonly color: string,
    readonly rng: Rng,
    readonly wsUrl: string,
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

  /** Cade la linea e si rientra con il token, come chi chiude il portatile. */
  async dropAndRejoin() {
    this.ws?.close();
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
        if (!this.doctrineSent && msg.lobby.phase === 'lobby') {
          this.doctrineSent = true;
          const general = [...UPGRADES].sort(() => this.rng.next() - 0.5).slice(0, ctx.catalog.rules.general.picks);
          this.send({ t: 'doctrine', strategy: this.rng.next() < 0.85 ? this.rng.pick(STRATEGIES) : null, general });
        }
        return;
      case 'status':
        // lo stato arriva dopo la vista: qui la vista è già aggiornata
        this.picker = msg.picker;
        this.maybePick();
        return;
      case 'game':
        if (bytes > stats.maxGameBytes) {
          stats.maxGameBytes = bytes;
          stats.maxGameCompressed = deflateRawSync(JSON.stringify(msg)).length;
        }
        this.view = msg.view;
        for (const e of msg.events) {
          if (!stats.events.has(e.kind)) stats.events.set(e.kind, new Set());
          stats.events.get(e.kind)!.add(`${msg.eventsTurn}:${JSON.stringify(e)}`);
        }
        void this.maybePlay();
        return;
      case 'error':
        countError(msg.message);
        if (this.view?.phase === 'selection') this.maybePick();
        return;
      default:
        return;
    }
  }

  private maybePick() {
    const v = this.view;
    if (!v || v.phase !== 'selection' || this.picker !== this.me || !this.me) return;
    const options = affordableCountries(v, ctx, this.me).filter((c) => !this.tried.has(`${v.turn}:${c}`));
    if (options.length === 0) return;
    const pick = this.rng.pick(options);
    this.tried.add(`${v.turn}:${pick}`);
    this.send({ t: 'pick', country: pick });
  }

  private async maybePlay() {
    const v = this.view;
    const mine = v?.players.find((p) => p.id === this.me);
    if (!v || !this.me || v.phase !== 'playing' || mine?.status !== 'active' || v.turn <= this.plannedTurn) return;
    this.plannedTurn = v.turn;
    await wait(this.rng.int(20, 400)); // il tempo di pensarci
    const plan = randomPlan(v, this.me, this.rng);
    stats.orders += plan.length;
    this.send({ t: 'plan', actions: toWirePlan(plan) });
    if (this.rng.next() < 0.1) this.send({ t: 'chat', text: `turno ${v.turn}: ${plan.length} ordini` });
    this.send({ t: 'ready', done: true });
    if (this.rng.next() < 0.04) await this.dropAndRejoin();
  }
}

// ---------------------------------------------------------------- server di prova (se non c'è --url)

async function startServer(): Promise<{ url: string; logDir: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), 'onpeace-prova-'));
  const port = 3399;
  const proc = spawn(process.execPath, ['--import', 'tsx', join('apps', 'server', 'src', 'main.ts')], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PORT: String(port), DATA_DIR: join(dir, 'games'), LOG_DIR: join(dir, 'logs') },
  });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
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
  log(`${PLAYERS} giocatori, ${TURNS} turni, seme ${SEED}, server ${base}`);

  const rng = createRng(SEED);
  const bots = Array.from(
    { length: PLAYERS },
    (_, i) => new Bot(`Bot${i + 1}`, PLAYER_COLORS[i]!, createRng(rng.int(1, 2 ** 30)), wsUrl),
  );
  const [host, ...guests] = bots as [Bot, ...Bot[]];
  const started = Date.now();

  await host.connect({
    t: 'create',
    name: host.name,
    color: host.color,
    settings: { map: MAP_ID, turnSeconds: 60, startingFunds: 3000, maxTurns: TURNS, rareUnitChancePct: 20, strategies: true, general: true },
  });
  while (!host.lobby) await wait(20);
  const game = host.lobby.id;
  for (const b of guests) await b.connect({ t: 'join', game, name: b.name, color: b.color });
  while ((host.lobby?.players.length ?? 0) < PLAYERS) await wait(20);
  await wait(200); // le dottrine
  host.send({ t: 'start' });
  log(`partita ${game}: scelta dei paesi`);

  let lastTurn = 0;
  let lastAt = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const v = host.view;
    if (v && v.phase !== 'selection' && v.turn !== lastTurn) {
      if (lastTurn > 0) stats.turnTimes.push(Date.now() - lastAt);
      lastTurn = v.turn;
      lastAt = Date.now();
      const active = v.players.filter((p) => p.status === 'active').length;
      const cities = Object.values(v.cities).filter((c) => c.owner !== null).length;
      log(`turno ${v.turn}: ${active} in gioco, ${cities} città con un proprietario`);
    }
    if (v?.phase === 'ended') break;
    await wait(50);
  }

  const ended = host.view?.phase === 'ended';
  const winners = host.view?.winners?.map((id) => host.view!.players.find((p) => p.id === id)?.name).join(', ');
  for (const b of bots) b.ws?.close();

  // registro del server: righe di errore e file per riprodurli
  let serverErrors: string[] = [];
  let dumps: string[] = [];
  let timings: number[] = [];
  if (server) {
    await wait(500);
    server.proc.kill();
    const logDir = server.logDir;
    for (const f of existsSync(logDir) ? readdirSync(logDir).filter((x) => x.endsWith('.log')) : []) {
      const text = readFileSync(join(logDir, f), 'utf8');
      serverErrors = serverErrors.concat(text.split('\n').filter((l) => l.includes('ERRORE')));
      timings = timings.concat([...text.matchAll(/risolto in (\d+) ms/g)].map((m) => Number(m[1])));
    }
    if (existsSync(join(logDir, 'errori'))) dumps = readdirSync(join(logDir, 'errori')).map((f) => join(logDir, 'errori', f));
  }

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  console.log('\n──────────── resoconto della prova generale');
  console.log(`  partita:             ${ended ? `finita al turno ${host.view!.turn}, vince ${winners || 'nessuno'}` : `NON finita (turno ${lastTurn})`}`);
  console.log(`  durata:              ${Math.round((Date.now() - started) / 1000)} s, turno medio ${avg(stats.turnTimes)} ms`);
  if (timings.length) console.log(`  risoluzione:         media ${avg(timings)} ms, massimo ${Math.max(...timings)} ms (dal registro)`);
  console.log(
    `  messaggio più grande: ${Math.round(stats.maxGameBytes / 1024)} kB (vista della partita), ` +
      `compresso ${Math.round(stats.maxGameCompressed / 1024)} kB`,
  );
  console.log(`  cadute e rientri:    ${stats.reconnects}`);
  console.log(`  ordini dati:         ${stats.orders}`);
  const kinds = [...stats.events].map(([k, v]) => `${k} ${v.size}`).sort();
  console.log(`  eventi (circa):      ${kinds.join(', ')}`);
  console.log(`  errori ai giocatori: ${[...stats.errors.values()].reduce((a, b) => a + b, 0)}`);
  for (const [m, n] of [...stats.errors].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${n}× ${m}`);
  if (server) {
    console.log(`  errori del server:   ${serverErrors.length}`);
    for (const l of serverErrors.slice(0, 8)) console.log(`      ${l}`);
    for (const d of dumps) console.log(`      da riprodurre: ${d}`);
  }
  console.log('──────────────────────────────────────────\n');
  const bad = !ended || serverErrors.length > 0 || dumps.length > 0;
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
