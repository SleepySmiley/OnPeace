/**
 * Ingresso di `npm run serata`: controlla Node e, se le dipendenze mancano o sono cambiate (primo avvio su
 * un PC, dopo un git pull o un nuovo ZIP), lancia npm install da solo; poi passa a serata.ts.
 * È JavaScript semplice perché deve girare anche quando tsx non è ancora installato.
 * Serata.cmd, serata.command e serata.sh, prima di arrivare qui, procurano Node se sul PC manca.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIN_NODE = 22;
/** Impronta delle dipendenze dell'ultimo npm install riuscito; sparisce con node_modules. */
const STAMP = join(root, 'node_modules', '.onpeace-installato');

/** @param {string} line */
const say = (line) => console.log(`[serata] ${line}`);

if (Number(process.versions.node.split('.')[0]) < MIN_NODE) {
  say(`serve Node ${MIN_NODE} o superiore, qui c'è Node ${process.versions.node}.`);
  say(
    'Avvia con Serata.cmd (Windows), serata.command (Mac) o serata.sh (Linux): la versione giusta la scaricano loro.',
  );
  process.exit(1);
}

/** Impronta di quello che decide le dipendenze: package-lock.json e i package.json di tutti i pacchetti. */
function fingerprint() {
  const files = ['package.json', 'package-lock.json'];
  for (const dir of ['apps', 'packages']) {
    for (const name of readdirSync(join(root, dir)).sort()) {
      files.push(join(dir, name, 'package.json'));
    }
  }
  // anche il sistema: una cartella copiata da Windows a un Mac ha i programmi compilati sbagliati
  const hash = createHash('sha256').update(`${process.platform}-${process.arch}\n`);
  for (const file of files) {
    const path = join(root, file);
    // fine riga normalizzate: lo stesso progetto su Windows e altrove dà la stessa impronta
    hash.update(
      `${file}\n${existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : ''}\n`,
    );
  }
  return hash.digest('hex');
}

const installed = existsSync(STAMP) ? readFileSync(STAMP, 'utf8').trim() : null;
if (installed !== fingerprint()) {
  say(
    existsSync(join(root, 'node_modules'))
      ? 'controllo le dipendenze (sono cambiate o installate a mano)…'
      : 'installo le dipendenze: solo la prima volta, ci vuole qualche minuto…',
  );
  // lo stesso npm che ha lanciato `npm run serata`, se c'è; altrimenti quello del PATH
  const npmCli = process.env.npm_execpath;
  const npmArgs = ['install', '--no-audit', '--no-fund'];
  const npm = npmCli?.endsWith('.js')
    ? spawnSync(process.execPath, [npmCli, ...npmArgs], { cwd: root, stdio: 'inherit' })
    : spawnSync(`npm ${npmArgs.join(' ')}`, { cwd: root, stdio: 'inherit', shell: true });
  if (npm.status !== 0) {
    say(
      'npm install non è riuscito: controlla la connessione e i messaggi qui sopra, poi riprova.',
    );
    process.exit(1);
  }
  // dopo l'installazione: npm può aver riscritto package-lock.json
  writeFileSync(STAMP, `${fingerprint()}\n`);
}

const { register } = await import('tsx/esm/api');
register();
await import(pathToFileURL(join(root, 'tools', 'serata.ts')).href);
