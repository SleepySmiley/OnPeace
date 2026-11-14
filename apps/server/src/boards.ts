/**
 * I tabelloni del gioco di conquista (data/territori/*.json) con le regole
 * (data/conquista/regole.json) e gli obiettivi di ciascuno (data/conquista/obiettivi/<id>.json):
 * elenco per la sala d'attesa, file per il client e contesto di gioco per ogni combinazione di opzioni.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BoardDef } from '@onpeace/engine';
import { ConquestRules, createContext, type GameContext } from '@onpeace/conquista';
import type { BoardSummary, RoomSettings } from '@onpeace/protocol';

export interface BoardProvider {
  /** Tabellone proposto quando si crea una partita. */
  readonly defaultId: string;
  /** Regole di base (le opzioni dell'host ne cambiano alcune). */
  readonly rules: ConquestRules;
  has(id: string): boolean;
  /** Impronta del file del tabellone: cambia se cambia il tabellone. */
  hash(id: string): string;
  /** Id dei territori del tabellone (per capire se un salvataggio è ancora giocabile). */
  territoryIds(id: string): string[];
  /** Contesto di gioco del tabellone con le opzioni della stanza. */
  context(settings: RoomSettings): GameContext;
  summaries(): BoardSummary[];
}

/** Le regole con le opzioni scelte dall'host al posto di quelle predefinite. */
export function rulesWith(base: ConquestRules, settings: Pick<RoomSettings, 'placement' | 'turnSeconds'>): ConquestRules {
  return {
    ...base,
    setup: { ...base.setup, placement: settings.placement },
    timers: { ...base.timers, turnSeconds: settings.turnSeconds },
  };
}

interface Entry {
  def: BoardDef;
  objectives: unknown;
  json: Buffer;
  gzip: Buffer;
  etag: string;
  hash: string;
}

export class BoardLibrary implements BoardProvider {
  private readonly entries = new Map<string, Entry>();
  private readonly contexts = new Map<string, GameContext>();
  readonly rules: ConquestRules;
  readonly defaultId: string;

  /** `dataDir`: la cartella data/ del progetto. */
  constructor(dataDir: string, preferred = 'mondo') {
    const read = (...p: string[]) => JSON.parse(readFileSync(join(dataDir, ...p), 'utf8')) as unknown;
    this.rules = ConquestRules.parse(read('conquista', 'regole.json'));
    const dir = join(dataDir, 'territori');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const text = readFileSync(join(dir, file));
      const def = BoardDef.parse(JSON.parse(text.toString('utf8')));
      const objectivesFile = join(dataDir, 'conquista', 'obiettivi', `${def.id}.json`);
      if (!existsSync(objectivesFile)) continue; // senza obiettivi il tabellone non è pronto per giocare
      const objectives = read('conquista', 'obiettivi', `${def.id}.json`);
      // il client riceve il tabellone già validato, senza spazi inutili
      const json = Buffer.from(JSON.stringify(def));
      const hash = createHash('sha1').update(json).digest('base64url').slice(0, 16);
      this.entries.set(def.id, { def, objectives, json, gzip: gzipSync(json), etag: `"${hash}"`, hash });
      // un tabellone con dati sbagliati si scopre all'avvio, non a metà serata
      createContext(def, this.rules, objectives);
    }
    if (this.entries.size === 0) throw new Error(`Nessun tabellone giocabile in ${dir}`);
    this.defaultId = this.entries.has(preferred) ? preferred : this.summaries()[0]!.id;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  private entry(id: string): Entry {
    return this.entries.get(id) ?? this.entries.get(this.defaultId)!;
  }

  hash(id: string): string {
    return this.entry(id).hash;
  }

  territoryIds(id: string): string[] {
    return this.entry(id).def.territories.map((t) => t.id);
  }

  context(settings: RoomSettings): GameContext {
    const entry = this.entry(settings.board);
    const key = `${entry.def.id}|${settings.placement}|${settings.turnSeconds}`;
    let ctx = this.contexts.get(key);
    if (!ctx) {
      ctx = createContext(entry.def, rulesWith(this.rules, settings), entry.objectives);
      this.contexts.set(key, ctx);
    }
    return ctx;
  }

  summaries(): BoardSummary[] {
    return [...this.entries.values()]
      .map(({ def }) => ({
        id: def.id,
        name: def.name,
        description: def.description,
        territories: def.territories.length,
        continents: def.continents.length,
      }))
      .sort((a, b) => (a.id === this.defaultId ? -1 : b.id === this.defaultId ? 1 : a.name.localeCompare(b.name)));
  }

  /** GET /tabelloni (elenco) e /tabelloni/<id>.json. Restituisce false se la richiesta non è per i tabelloni. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/tabelloni' || path === '/tabelloni/') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(JSON.stringify(this.summaries()));
      return true;
    }
    const m = /^\/tabelloni\/([a-z][a-z0-9_]*)\.json$/.exec(path);
    if (!m) return false;
    const entry = this.entries.get(m[1]!);
    if (!entry) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Tabellone non trovato');
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
