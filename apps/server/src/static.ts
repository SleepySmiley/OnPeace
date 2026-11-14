/** Serve il client compilato (apps/client/dist), con ritorno a index.html per i link d'invito. */
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function staticHandler(distDir: string) {
  const root = resolve(distDir);
  return (req: IncomingMessage, res: ServerResponse) => {
    if (!existsSync(join(root, 'index.html'))) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Client non compilato: esegui "npm run build" e riavvia il server.');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    // col separatore: senza, "dist-altro" passerebbe per "dist"
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const cache = file.includes(`${join('assets', '')}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache });
    // file sparito o bloccato nel frattempo (es. client ricompilato, OneDrive): si chiude solo la risposta
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  };
}
