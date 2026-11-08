/**
 * Le mappe del gioco (data/maps/*.json): elenco per la sala d'attesa, file per il client e,
 * al primo uso, contesto delle regole e griglia di navigazione di ciascuna.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { MapDef, NavGrid, createContext, type GameContext, type Rules } from '@onpeace/engine';
import type { MapSummary } from '@onpeace/protocol';

export interface MapWorld {
  ctx: GameContext;
  nav: NavGrid;
}

export interface MapProvider {
  /** Mappa proposta quando si crea una partita. */
  readonly defaultId: string;
  has(id: string): boolean;
  get(id: string): MapWorld;
  summaries(): MapSummary[];
}

interface Entry {
  def: MapDef;
  json: Buffer;
  gzip: Buffer;
  etag: string;
}

/** Ordine nell'elenco: prima il mondo, poi i continenti, la mappa di prova in fondo. */
const ORDER = ['mondo', 'europa', 'asia', 'africa', 'nordamerica', 'sudamerica', 'oceania'];
const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : id === 'prova' ? 1000 : 500);

export class MapLibrary implements MapProvider {
  private readonly entries = new Map<string, Entry>();
  private readonly worlds = new Map<string, MapWorld>();
  readonly defaultId: string;

  constructor(
    dir: string,
    private readonly rules: Rules,
    preferred = 'europa',
  ) {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const text = readFileSync(join(dir, file));
      const def = MapDef.parse(JSON.parse(text.toString('utf8')));
      // il client riceve la mappa già validata, senza spazi inutili
      const json = Buffer.from(JSON.stringify(def));
      const etag = `"${createHash('sha1').update(json).digest('base64url').slice(0, 16)}"`;
      this.entries.set(def.id, { def, json, gzip: gzipSync(json), etag });
    }
    if (this.entries.size === 0) throw new Error(`Nessuna mappa in ${dir}`);
    this.defaultId = this.entries.has(preferred) ? preferred : this.summaries()[0]!.id;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): MapWorld {
    let world = this.worlds.get(id);
    if (!world) {
      const entry = this.entries.get(id) ?? this.entries.get(this.defaultId)!;
      world = { ctx: createContext(entry.def, this.rules), nav: new NavGrid(entry.def) };
      this.worlds.set(id, world);
    }
    return world;
  }

  summaries(): MapSummary[] {
    return [...this.entries.values()]
      .map(({ def }) => ({
        id: def.id,
        name: def.name,
        description: def.description ?? '',
        countries: def.countries.length,
        cities: def.cities.length,
      }))
      .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  }

  /** GET /mappe (elenco) e /mappe/<id>.json. Restituisce false se la richiesta non è per le mappe. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/mappe' || path === '/mappe/') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(JSON.stringify(this.summaries()));
      return true;
    }
    const m = /^\/mappe\/([a-z][a-z0-9_]*)\.json$/.exec(path);
    if (!m) return false;
    const entry = this.entries.get(m[1]!);
    if (!entry) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Mappa non trovata');
      return true;
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
      etag: entry.etag,
      vary: 'accept-encoding',
    };
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers).end();
      return true;
    }
    const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    res.writeHead(200, gzip ? { ...headers, 'content-encoding': 'gzip' } : headers);
    res.end(gzip ? entry.gzip : entry.json);
    return true;
  }
}

/** Una sola mappa già pronta (per i test). */
export function singleMap(world: MapWorld): MapProvider {
  const def = world.ctx.map;
  return {
    defaultId: def.id,
    has: (id) => id === def.id,
    get: () => world,
    summaries: () => [
      { id: def.id, name: def.name, description: def.description ?? '', countries: def.countries.length, cities: def.cities.length },
    ],
  };
}
