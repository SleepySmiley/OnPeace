/**
 * cloudflared, il programma di Cloudflare Tunnel che rende raggiungibile da Internet il server della serata.
 * Se sul PC non è già installato, lo scarica da solo in .cache/cloudflared/ (ultima versione ufficiale da
 * GitHub, controllata con lo SHA256 pubblicato nella release). Lo fa npm install; se lì non è riuscito
 * (per esempio senza Internet), ci riprova npm run serata. Per aggiornarlo basta cancellare la cartella.
 *
 *   npm run tunnel                        tunnel verso il server già acceso (porta 3210)
 *   tsx tools/cloudflared.ts --installa   solo lo scaricamento, se manca (lo lancia npm install)
 *   tsx tools/cloudflared.ts <argomenti>  cloudflared con quegli argomenti
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(root, '.cache', 'cloudflared');
const LOCAL_BIN = join(DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const REPO = 'https://github.com/cloudflare/cloudflared';
const LATEST = 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest';

type Log = (line: string) => void;

const works = (bin: string) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0;

/** cloudflared già pronto: quello installato sul PC (PATH o winget) oppure quello scaricato qui. */
export function findCloudflared(): string | null {
  const candidates = [
    'cloudflared',
    ...(process.platform === 'win32'
      ? ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe']
      : []),
    LOCAL_BIN,
  ];
  return candidates.find(works) ?? null;
}

/** Il file delle release di cloudflared adatto a questo sistema. */
function assetName(): string | null {
  const { platform, arch } = process;
  // Windows su ARM fa girare la versione x64
  if (platform === 'win32') return arch === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
  if (platform === 'darwin') return `cloudflared-darwin-${arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`;
  if (platform === 'linux') {
    const name = ({ x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' } as Record<string, string>)[arch];
    return name ? `cloudflared-linux-${name}` : null;
  }
  return null;
}

async function download(log: Log): Promise<string> {
  const asset = assetName();
  if (!asset) throw new Error(`non c'è una versione per ${process.platform}/${process.arch}`);

  const rel = await fetch(LATEST, {
    headers: { accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!rel.ok) throw new Error(`GitHub risponde HTTP ${rel.status}`);
  const { tag_name: tag, body } = (await rel.json()) as { tag_name: string; body: string };
  // nella descrizione della release: "cloudflared-windows-amd64.exe: <sha256>"
  const line = body.split(/\r?\n/).find((l) => l.startsWith(`${asset}:`));
  const sha = line?.slice(asset.length + 1).trim();
  if (!sha || !/^[0-9a-f]{64}$/.test(sha)) throw new Error(`manca lo SHA256 di ${asset} nella release ${tag}`);

  const res = await fetch(`${REPO}/releases/download/${tag}/${asset}`, { signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw new Error(`scaricamento: HTTP ${res.status}`);
  const mb = Math.round(Number(res.headers.get('content-length') ?? 0) / 1e6);
  log(`scarico cloudflared ${tag}${mb ? ` (${mb} MB)` : ''}, una volta sola…`);
  const data = Buffer.from(await res.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== sha) {
    throw new Error('il file scaricato non corrisponde allo SHA256 pubblicato');
  }

  mkdirSync(DIR, { recursive: true });
  const part = join(DIR, `${asset}.part`);
  writeFileSync(part, data);
  if (asset.endsWith('.tgz')) {
    const tar = spawnSync('tar', ['-xzf', part, '-C', DIR], { stdio: 'ignore' });
    rmSync(part, { force: true });
    if (tar.status !== 0) throw new Error("non riesco a estrarre l'archivio");
  } else {
    renameSync(part, LOCAL_BIN);
  }
  if (process.platform !== 'win32') chmodSync(LOCAL_BIN, 0o755);
  if (!works(LOCAL_BIN)) {
    rmSync(LOCAL_BIN, { force: true });
    throw new Error('scaricato, ma non parte');
  }
  log(`cloudflared pronto in ${relative(root, DIR)}`);
  return LOCAL_BIN;
}

const reason = (e: unknown) =>
  e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);

/** cloudflared pronto da usare: quello che c'è già, altrimenti lo scarica. null se non ci riesce (lo dice in log). */
export async function ensureCloudflared(log: Log): Promise<string | null> {
  const found = findCloudflared();
  if (found) return found;
  try {
    return await download(log);
  } catch (e) {
    log(`non riesco a scaricare cloudflared: ${reason(e)}`);
    return null;
  }
}

// ---------------------------------------------------------------- da riga di comando

const self = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
const isMain = process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self;

if (isMain) {
  const args = process.argv.slice(2);
  const say: Log = (line) => console.log(`[cloudflared] ${line}`);
  if (args[0] === '--installa') {
    // lanciato da npm install: non deve mai farlo fallire
    if (!process.env.CI && !(await ensureCloudflared(say))) {
      say('niente di grave: npm run serata riprova a scaricarlo (oppure: winget install --id Cloudflare.cloudflared).');
    }
  } else {
    const bin = await ensureCloudflared(say);
    if (!bin) process.exit(1);
    // Ctrl+C arriva anche a cloudflared: si aspetta che si chiuda lui
    process.on('SIGINT', () => {});
    spawn(bin, args, { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0));
  }
}
