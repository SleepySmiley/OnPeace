/**
 * Serata di gioco con un solo comando: compila il client se serve, avvia il server e Cloudflare Tunnel,
 * mostra l'indirizzo per gli amici e apre il browser. Se il server cade lo riavvia (le partite riprendono
 * dai salvataggi); se cade il tunnel lo riapre (con un indirizzo nuovo, che il server passa ai browser).
 *
 *   npm run serata                 tutto
 *   npm run serata -- --locale     senza tunnel (solo questo PC o la rete di casa)
 *   npm run serata -- --build      ricompila comunque il client
 *   npm run serata -- --no-open    non apre il browser
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const PORT = Number(process.env.PORT ?? 3210);
const LOCAL = `http://localhost:${PORT}`;
// non "api.trycloudflare.com": cloudflared lo scrive nei messaggi d'errore quando il tunnel non parte
const TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;
/** Il server esce con 2 quando non ha senso riavviarlo (es. porta occupata). */
const EXIT_NO_RESTART = 2;

const say = (line = '') => console.log(`[serata] ${line}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- compilazione del client

function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const name of readdirSync(path)) max = Math.max(max, newest(join(path, name)));
  return max;
}

function clientIsStale(): boolean {
  const index = join(root, 'apps', 'client', 'dist', 'index.html');
  if (!existsSync(index)) return true;
  const built = statSync(index).mtimeMs;
  const sources = [
    'apps/client/src',
    'apps/client/public',
    'apps/client/index.html',
    'apps/client/vite.config.ts',
    'packages/engine/src',
    'packages/conquista/src',
    'packages/protocol/src',
    'data',
  ];
  return sources.some((s) => newest(join(root, s)) > built);
}

if (args.has('--build') || clientIsStale()) {
  say('compilo il client (serve dopo ogni modifica al codice o ai dati)…');
  const build = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
  if (build.status !== 0) {
    say('compilazione fallita: correggi gli errori qui sopra e riprova.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------- server (riavviato se cade)

let stopping = false;
let server: ChildProcess | null = null;
let publicUrl: string | null = null;
const crashes: number[] = [];

function startServer(): void {
  server = spawn(process.execPath, ['--import', 'tsx', join('apps', 'server', 'src', 'main.ts')], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, PORT: String(PORT) },
  });
  server.on('exit', (code) => {
    server = null;
    if (stopping) return;
    if (code === EXIT_NO_RESTART || code === 0) {
      say(code === 0 ? 'il server si è chiuso.' : 'il server non può partire (vedi sopra).');
      void stop(1);
      return;
    }
    const now = Date.now();
    crashes.push(now);
    while (crashes.length > 0 && now - crashes[0]! > 60_000) crashes.shift();
    if (crashes.length > 5) {
      say('il server cade di continuo: mi fermo. Il registro è in logs/.');
      void stop(1);
      return;
    }
    say(`il server è caduto (codice ${code}): lo riavvio, le partite riprendono dai salvataggi.`);
    setTimeout(() => {
      if (stopping) return;
      startServer();
      tellServer();
    }, 1000);
  });
}

function tellServer(msg: object = { t: 'publicUrl', publicUrl }): void {
  try {
    if (server?.connected) server.send(msg);
  } catch {
    // il server si sta chiudendo
  }
}

async function reachable(url: string, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && !stopping) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return true;
    } catch {
      // non ancora pronto
    }
    await wait(700);
  }
  return false;
}

// ---------------------------------------------------------------- tunnel

function findCloudflared(): string | null {
  const candidates = [
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { stdio: 'ignore' });
    if (r.status === 0) return c;
  }
  return null;
}

let tunnel: ChildProcess | null = null;
/** Riaperture del tunnel di fila senza indirizzo (es. senza Internet): si aspetta sempre di più, fino a un minuto. */
let tunnelFailures = 0;

function startTunnel(bin: string): void {
  const recent: string[] = [];
  let found = false;
  tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', LOCAL], { stdio: ['ignore', 'pipe', 'pipe'] });
  const onData = (chunk: Buffer) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      recent.push(line);
      if (recent.length > 30) recent.shift();
      const m = !found && TUNNEL_URL.exec(line);
      if (m) {
        found = true;
        tunnelFailures = 0;
        void tunnelReady(m[0]);
      }
    }
  };
  tunnel.stdout!.on('data', onData);
  tunnel.stderr!.on('data', onData);
  setTimeout(() => {
    if (!found && !stopping && tunnel) {
      say('il tunnel non ha ancora dato un indirizzo. Ultimi messaggi di cloudflared:');
      for (const l of recent.slice(-10)) console.log(`    ${l}`);
    }
  }, 45_000);
  tunnel.on('exit', (code) => {
    tunnel = null;
    if (stopping) return;
    say(`il tunnel si è chiuso (codice ${code}): lo riapro. L'indirizzo per gli amici cambierà.`);
    for (const l of recent.slice(-5)) console.log(`    ${l}`);
    publicUrl = null;
    tellServer();
    if (!found) tunnelFailures++;
    setTimeout(() => !stopping && startTunnel(bin), Math.min(60_000, 3000 * 2 ** tunnelFailures));
  });
}

async function tunnelReady(url: string): Promise<void> {
  publicUrl = url;
  tellServer();
  say(`tunnel aperto: ${url} — verifico che si raggiunga…`);
  const ok = await reachable(url, 60_000);
  if (stopping || publicUrl !== url) return;
  banner(ok ? '✓ raggiungibile da Internet' : '⚠ non ancora raggiungibile: riprova tra poco');
}

// ---------------------------------------------------------------- avvio e chiusura

function banner(tunnelNote: string): void {
  const line = '─'.repeat(64);
  console.log(`\n${line}`);
  console.log('  OnPeace è pronto');
  console.log(`    Tu (host):   ${LOCAL}`);
  if (publicUrl) console.log(`    Amici:       ${publicUrl}   ${tunnelNote}`);
  else console.log('    Amici:       solo da questo PC (avviato senza tunnel)');
  console.log('  Crea la partita e manda agli amici il link della sala d’attesa.');
  console.log('  Registro ed errori: logs/   ·   Per chiudere tutto: Ctrl+C');
  console.log(`${line}\n`);
}

function openBrowser(url: string): void {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
}

async function stop(code = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  say('chiudo: salvo le partite e chiudo il tunnel…');
  tellServer({ t: 'shutdown' });
  tunnel?.kill();
  const until = Date.now() + 5000;
  while ((server || tunnel) && Date.now() < until) await wait(100);
  server?.kill();
  tunnel?.kill();
  process.exit(code);
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

startServer();
if (!(await reachable(LOCAL, 30_000))) {
  if (!stopping) {
    say('il server non risponde: controlla i messaggi qui sopra.');
    await stop(1);
  }
} else {
  if (!args.has('--no-open')) openBrowser(LOCAL);
  if (args.has('--locale')) {
    banner('');
  } else {
    const bin = findCloudflared();
    if (bin) {
      say('apro il tunnel Cloudflare…');
      startTunnel(bin);
    } else {
      say('cloudflared non trovato: installalo con "winget install --id Cloudflare.cloudflared" e riavvia.');
      banner('');
    }
  }
}
