/**
 * Costruisce i tabelloni a territori (data/territori/<id>.json) dai dati di Natural Earth:
 * i paesi del mondo (paesi.ts) raggruppati in territori e continenti secondo data/mondo/territori.json.
 *
 *   npm run mondo            tutti i tabelloni
 *   npm run mondo -- mondo   solo alcuni
 *
 * I confini per terra si ricavano dalla geografia (paesi che si toccano); quelli via mare
 * sono scritti a mano nella configurazione ("viaMare"), con gli estremi della linea in gradi.
 * "nonConfinanti" toglie un confine per terra che non si vuole (per esempio un punto di contatto).
 * I file in data/territori/ generati da qui non vanno ritoccati a mano.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Geom } from 'polygon-clipping';
import { BoardDef, checkBoard, type BoardLinkDef, type TerritoryDef } from '@onpeace/engine';
import { dataDir, readJson } from '../data-io';
import {
  bounds,
  distanceToBoundary,
  largestPolygon,
  multiPolygonArea,
  pointInMultiPolygon,
  round1,
  tidy,
  type MultiPolygon,
  type Pt,
} from './geometria';
import { FrameCfgS, buildCountries, makeFrame, pc, type Country } from './paesi';

// ---------------------------------------------------------------- configurazione
const IdS = z.string().regex(/^[a-z][a-z0-9_]*$/);
const LonLatS = z.tuple([z.number(), z.number()]);
const BoardCfgS = FrameCfgS.extend({
  id: IdS,
  nome: z.string().min(1),
  descrizione: z.string(),
  /** Dove disegnare la rosa dei venti, in gradi. */
  rosa: LonLatS.optional(),
  continenti: z.array(
    z.strictObject({
      id: IdS,
      /** Dove scrivere nome e bonus del continente, in gradi. */
      etichetta: LonLatS.optional(),
      nome: z.string().min(1),
      bonus: z.number().int().min(0),
      territori: z.array(z.strictObject({ id: IdS, nome: z.string().min(1), paesi: z.array(IdS).min(1) })).min(1),
    }),
  ),
  viaMare: z.array(z.strictObject({ a: IdS, b: IdS, da: LonLatS, verso: LonLatS })),
  nonConfinanti: z.array(z.tuple([IdS, IdS])),
});
type BoardCfg = z.infer<typeof BoardCfgS>;
const FileS = z.strictObject({ tabelloni: z.array(BoardCfgS) });

/** Punto dentro il poligono più grande, il più lontano possibile dai bordi. */
function interiorPoint(shape: MultiPolygon): Pt {
  const main = [largestPolygon(shape)!] as MultiPolygon;
  const [minX, minY, maxX, maxY] = bounds(main);
  let best: Pt = [main[0]![0]![0]![0], main[0]![0]![0]![1]];
  let bestD = -1;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p: Pt = [minX + ((maxX - minX) * i) / steps, minY + ((maxY - minY) * j) / steps];
      if (!pointInMultiPolygon(p, main)) continue;
      const d = distanceToBoundary(p, main);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return [round1(best[0]), round1(best[1])];
}

// ---------------------------------------------------------------- confini tra paesi
/** Vertici di un anello più punti intermedi ogni `step`: i confini dritti (es. il 49° parallelo) hanno pochi vertici. */
function densePoints(ring: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/** Coppie di paesi che si toccano: almeno tre punti del contorno dell'uno a meno di `tol` da punti dell'altro. */
function touchingCountries(countries: readonly Country[], tol: number): Set<string> {
  const cell = (v: number) => Math.floor(v / tol);
  const grid = new Map<string, Set<string>>();
  for (const c of countries)
    for (const poly of c.shape)
      for (const ring of poly)
        for (const [x, y] of densePoints(ring, tol)) {
          const k = `${cell(x)},${cell(y)}`;
          (grid.get(k) ?? grid.set(k, new Set()).get(k)!).add(c.id);
        }
  const counts = new Map<string, number>();
  for (const c of countries) {
    const seenHere = new Map<string, number>();
    for (const poly of c.shape)
      for (const ring of poly)
        for (const [x, y] of densePoints(ring, tol)) {
          const near = new Set<string>();
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) for (const o of grid.get(`${cell(x) + dx},${cell(y) + dy}`) ?? []) near.add(o);
          for (const o of near) if (o !== c.id) seenHere.set(o, (seenHere.get(o) ?? 0) + 1);
        }
    for (const [o, n] of seenHere) {
      const key = [c.id, o].sort().join('|');
      counts.set(key, Math.max(counts.get(key) ?? 0, n));
    }
  }
  return new Set([...counts].filter(([, n]) => n >= 3).map(([k]) => k));
}

// ---------------------------------------------------------------- costruzione
function buildBoard(cfg: BoardCfg): BoardDef {
  const frame = makeFrame(cfg);
  const toMap = frame.toMap;
  const countries = buildCountries(frame, cfg);
  const problems: string[] = [];

  // ogni paese in un solo territorio
  const territoryOf = new Map<string, string>();
  for (const cont of cfg.continenti)
    for (const t of cont.territori)
      for (const p of t.paesi) {
        if (!countries.some((c) => c.id === p)) problems.push(`${t.id}: il paese "${p}" non c'è (o è stato unito a un vicino)`);
        if (territoryOf.has(p)) problems.push(`il paese "${p}" sta sia in ${territoryOf.get(p)} sia in ${t.id}`);
        territoryOf.set(p, t.id);
      }
  for (const c of countries) if (!territoryOf.has(c.id)) problems.push(`il paese "${c.id}" (${c.name}) non sta in nessun territorio`);
  if (problems.length > 0) throw new Error(`${cfg.id}:\n  - ${problems.join('\n  - ')}`);

  // forme: unione dei paesi di ogni territorio
  const territories: TerritoryDef[] = [];
  for (const cont of cfg.continenti) {
    for (const t of cont.territori) {
      const shapes = t.paesi.map((p) => countries.find((c) => c.id === p)!.shape);
      const union = shapes.length === 1 ? shapes[0]! : pc.union(...(shapes as unknown as [Geom, ...Geom[]]));
      const shape = tidy(union as Pt[][][]);
      const anchor = interiorPoint(shape as MultiPolygon);
      territories.push({ id: t.id, name: t.nome, continent: cont.id, anchor, label: anchor, shape });
    }
  }

  // confini per terra dai paesi che si toccano
  const unwanted = new Set(cfg.nonConfinanti.map((p) => [...p].sort().join('|')));
  const links = new Map<string, BoardLinkDef>();
  for (const key of touchingCountries(countries, 1.0)) {
    const [p, q] = key.split('|') as [string, string];
    const a = territoryOf.get(p)!;
    const b = territoryOf.get(q)!;
    if (a === b) continue;
    const k = [a, b].sort().join('|');
    if (unwanted.has(k) || links.has(k)) continue;
    const [x, y] = [a, b].sort() as [string, string];
    links.set(k, { a: x, b: y, sea: false });
  }
  for (const k of unwanted) if (!links.has(k)) console.warn(`  [${cfg.id}] nonConfinanti ${k}: non confinavano comunque`);

  // collegamenti via mare
  for (const s of cfg.viaMare) {
    const k = [s.a, s.b].sort().join('|');
    if (links.has(k)) {
      console.warn(`  [${cfg.id}] viaMare ${s.a}–${s.b}: confinano già per terra, linea ignorata`);
      continue;
    }
    const from = toMap(s.da);
    const to = toMap(s.verso);
    const wrap = Math.abs(from[0] - to[0]) > frame.width / 2;
    links.set(k, { a: s.a, b: s.b, sea: true, line: [from, to], ...(wrap ? { wrap: true } : {}) });
  }

  return BoardDef.parse({
    $schema: '../schema/board.schema.json',
    id: cfg.id,
    name: cfg.nome,
    description: `${cfg.descrizione} Dati geografici: Natural Earth (pubblico dominio).`,
    width: frame.width,
    height: frame.height,
    continents: cfg.continenti.map((c) => ({
      id: c.id,
      name: c.nome,
      bonus: c.bonus,
      ...(c.etichetta ? { label: toMap(c.etichetta) } : {}),
    })),
    territories,
    links: [...links.values()].sort((l, m) => l.a.localeCompare(m.a) || l.b.localeCompare(m.b)),
    ...(cfg.rosa ? { compass: toMap(cfg.rosa) } : {}),
    projection: {
      type: 'miller',
      centralMeridian: cfg.proiezione.meridianoCentrale,
      latMin: cfg.proiezione.latMin,
      latMax: cfg.proiezione.latMax,
      kmPerUnit: cfg.kmPerUnita,
    },
  });
}

/** JSON leggibile: ogni poligono e ogni punto su una riga. */
function formatBoard(b: BoardDef): string {
  const raw = new Map<string, string>();
  const token = (v: unknown) => {
    const key = `__RAW_${raw.size}__`;
    raw.set(key, JSON.stringify(v));
    return key;
  };
  const obj = {
    ...b,
    territories: b.territories.map((t) => ({ ...t, anchor: token(t.anchor), label: token(t.label), shape: t.shape.map(token) })),
    links: b.links.map(token),
  };
  let text = JSON.stringify(obj, null, 2);
  for (const [key, value] of raw) text = text.replace(`"${key}"`, value);
  return text + '\n';
}

/** Riassunto per continente: territori, territori di confine, accessi dall'esterno. */
function summary(b: BoardDef): string {
  const contOf = new Map(b.territories.map((t) => [t.id, t.continent]));
  const lines: string[] = [];
  for (const c of b.continents) {
    const own = b.territories.filter((t) => t.continent === c.id).map((t) => t.id);
    const external = b.links.filter((l) => (contOf.get(l.a) === c.id) !== (contOf.get(l.b) === c.id));
    const borderTerr = new Set(external.flatMap((l) => [l.a, l.b]).filter((id) => contOf.get(id) === c.id));
    lines.push(`  ${c.name}: ${own.length} territori, ${borderTerr.size} di confine, ${external.length} accessi, bonus ${c.bonus}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- avvio
const file = FileS.parse(readJson(join(dataDir, 'mondo', 'territori.json')));
const wanted = process.argv.slice(2);
const configs = file.tabelloni.filter((t) => wanted.length === 0 || wanted.includes(t.id));
if (configs.length === 0) {
  console.error(`nessun tabellone con questi id; quelli configurati: ${file.tabelloni.map((t) => t.id).join(', ')}`);
  process.exit(1);
}
const outDir = join(dataDir, 'territori');
mkdirSync(outDir, { recursive: true });
let failed = false;
for (const cfg of configs) {
  const t0 = Date.now();
  const board = buildBoard(cfg);
  const errors = checkBoard(board);
  if (errors.length > 0) {
    failed = true;
    console.error(`${cfg.id}: il tabellone non supera i controlli:`);
    for (const e of errors) console.error(`  - ${e}`);
    continue;
  }
  const text = formatBoard(board);
  writeFileSync(join(outDir, `${cfg.id}.json`), text);
  const area = (t: TerritoryDef) => multiPolygonArea(t.shape as MultiPolygon);
  const sizes = board.territories.map(area).sort((a, b) => a - b);
  console.log(
    `${cfg.id}: ${board.territories.length} territori, ${board.links.length} confini ` +
      `(${board.links.filter((l) => l.sea).length} via mare), ${Math.round(text.length / 1024)} kB, ` +
      `area min/max ${Math.round(sizes[0]! / sizes[sizes.length - 1]! * 1000) / 10}%, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  console.log(summary(board));
}
if (failed) process.exit(1);
