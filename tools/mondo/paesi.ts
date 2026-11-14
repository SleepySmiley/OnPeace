/**
 * Paesi del mondo pronti per il tabellone: le forme di Natural Earth sistemate secondo
 * data/mondo/paesi.json (esclusi, uniti, divisi, nomi) e data/mondo/regioni.json (paesi grandi
 * divisi in regioni, territori riassegnati), poi proiettate sul piano del tabellone, senza isolette
 * e con i paesi troppo piccoli uniti al vicino.
 */
import { join } from 'node:path';
import { z } from 'zod';
import * as pcModule from 'polygon-clipping';
import type { Geom } from 'polygon-clipping';
import { dataDir, readJson } from '../data-io';
import { loadAdmin1, loadCountries, type GeoMultiPolygon, type LonLat } from './fonti';
import { bounds, multiPolygonArea, pointInMultiPolygon, round1, tidy, type MPoly, type MultiPolygon, type Pt } from './geometria';
import { miller } from './proiezioni';

// il pacchetto è CommonJS: in ESM le funzioni stanno sotto "default"
export const pc = ((pcModule as unknown as { default?: typeof pcModule }).default ?? pcModule) as typeof pcModule;

// ---------------------------------------------------------------- configurazione
const IdS = z.string().regex(/^[a-z][a-z0-9_]*$/);

const CountriesFileS = z.strictObject({
  escludi: z.array(z.string()),
  unisci: z.record(z.string(), z.string()),
  dividi: z.array(
    z.strictObject({
      da: z.string(),
      id: IdS,
      nome: z.string().min(1),
      riquadro: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
  ),
  nomi: z.record(z.string(), z.string()),
});

const RegionS = z.strictObject({ id: IdS, nome: z.string().min(1), membri: z.array(z.string()).min(1) });
const RegionsFileS = z.strictObject({
  /** Territori che passano da un paese all'altro (codici delle suddivisioni). */
  trasferisci: z.array(z.strictObject({ nome: z.string(), da: z.string(), a: z.string(), codici: z.array(z.string()).min(1) })),
  /** Paesi grandi divisi in regioni: codice del paese → regioni, ognuna con le sue suddivisioni. */
  paesi: z.record(z.string(), z.array(RegionS).min(2)),
});

/** Inquadratura del tabellone (in data/mondo/territori.json). */
export const FrameCfgS = z.strictObject({
  /** Miller. Il meridiano centrale sta tra 0 e 180: il taglio del mondo al meridiano opposto è scritto per questi valori. */
  proiezione: z.strictObject({
    tipo: z.literal('miller'),
    meridianoCentrale: z.number().min(0).max(180),
    latMin: z.number(),
    latMax: z.number(),
  }),
  /** Chilometri per unità del tabellone (all'equatore). */
  kmPerUnita: z.number().positive(),
  /** I paesi più piccoli si uniscono al vicino con cui hanno più confine. */
  paeseMinKm2: z.number().min(0),
  /** Le isole più piccole si tolgono. */
  isolaMinKm2: z.number().min(0),
});
export type FrameCfg = z.infer<typeof FrameCfgS>;

// ---------------------------------------------------------------- paesi in gradi
interface GeoCountry {
  id: string;
  /** Codici Natural Earth del paese (per trovarlo dalla configurazione). */
  codes: Set<string>;
  name: string;
  shape: GeoMultiPolygon;
}

function rect(x0: number, y0: number, x1: number, y1: number): Pt[][] {
  return [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ];
}

function prepareCountries(): GeoCountry[] {
  const cfgDir = join(dataDir, 'mondo');
  const countriesFile = CountriesFileS.parse(readJson(join(cfgDir, 'paesi.json')));
  const regionsFile = RegionsFileS.parse(readJson(join(cfgDir, 'regioni.json')));
  const excluded = new Set(countriesFile.escludi);
  const list: GeoCountry[] = loadCountries()
    .filter((c) => !excluded.has(c.a3) && c.shape.length > 0)
    .map((c) => ({
      id: c.a3.toLowerCase(),
      codes: new Set([c.a3, c.iso3].filter(Boolean)),
      name: countriesFile.nomi[c.a3] ?? c.name,
      shape: c.shape,
    }));
  const byCode = (a3: string) => list.find((c) => c.codes.has(a3));

  for (const [from, to] of Object.entries(countriesFile.unisci)) {
    const a = byCode(from);
    const b = byCode(to);
    if (!a || !b) {
      if (!a) console.warn(`  (paesi.json) unisci: "${from}" non c'è nei dati`);
      continue;
    }
    b.shape = pc.union(b.shape as Geom, a.shape as Geom) as GeoMultiPolygon;
    for (const code of a.codes) b.codes.add(code);
    list.splice(list.indexOf(a), 1);
  }

  for (const d of countriesFile.dividi) {
    const parent = byCode(d.da);
    if (!parent) {
      console.warn(`  (paesi.json) dividi: "${d.da}" non c'è nei dati`);
      continue;
    }
    const box = rect(...d.riquadro) as Geom;
    const piece = pc.intersection(parent.shape as Geom, box) as GeoMultiPolygon;
    if (piece.length === 0) continue;
    parent.shape = pc.difference(parent.shape as Geom, box) as GeoMultiPolygon;
    list.push({ id: d.id, codes: new Set(parent.codes), name: d.nome, shape: piece });
  }

  // coordinate arrotondate a ~10 m: confini e coste dei due insiemi di dati quasi coincidenti
  // mandano in crisi le operazioni sui poligoni, arrotondati invece si comportano bene
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const snap = (mp: GeoMultiPolygon): GeoMultiPolygon =>
    mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => [r4(x), r4(y)] as LonLat)));
  const admin1 = new Map([...loadAdmin1()].map(([code, shape]) => [code, snap(shape)]));
  /** Unione delle suddivisioni indicate (avvisa se un codice non esiste). */
  const unionOf = (codes: string[], where: string): GeoMultiPolygon => {
    const parts = codes.flatMap((code) => {
      const shape = admin1.get(code);
      if (!shape) console.warn(`  (regioni.json) ${where}: suddivisione "${code}" non c'è nei dati`);
      return shape ? [shape as Geom] : [];
    });
    return parts.length === 0 ? [] : (pc.union(...(parts as [Geom, ...Geom[]])) as GeoMultiPolygon);
  };

  for (const t of regionsFile.trasferisci) {
    const from = byCode(t.da);
    const to = byCode(t.a);
    if (!from || !to) {
      console.warn(`  (regioni.json) trasferisci ${t.nome}: paese mancante`);
      continue;
    }
    from.shape = snap(from.shape);
    to.shape = snap(to.shape);
    const piece = pc.intersection(from.shape as Geom, unionOf(t.codici, t.nome) as Geom) as GeoMultiPolygon;
    from.shape = pc.difference(from.shape as Geom, piece as Geom) as GeoMultiPolygon;
    to.shape = pc.union(to.shape as Geom, piece as Geom) as GeoMultiPolygon;
  }

  for (const [code, regions] of Object.entries(regionsFile.paesi)) {
    const parent = byCode(code);
    if (!parent) {
      console.warn(`  (regioni.json) paese "${code}" non c'è nei dati`);
      continue;
    }
    // ogni regione prende la parte del paese coperta dalle sue suddivisioni, senza sovrapporsi alle precedenti
    let rest = snap(parent.shape);
    const pieces = regions.map((r) => {
      const piece = pc.intersection(rest as Geom, unionOf(r.membri, r.nome) as Geom) as GeoMultiPolygon;
      rest = pc.difference(rest as Geom, piece as Geom) as GeoMultiPolygon;
      return piece;
    });
    // quello che resta (coste disegnate in modo un po' diverso nei due insiemi di dati) va alla regione più vicina
    const extra: GeoMultiPolygon[] = pieces.map(() => []);
    for (const poly of rest) {
      const p = poly[0]![0]!;
      let best = 0;
      let bestD = Infinity;
      pieces.forEach((piece, i) => {
        for (const pp of piece) {
          for (const q of pp[0]!) {
            const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
        }
      });
      extra[best]!.push(poly);
    }
    extra.forEach((polys, i) => {
      if (polys.length > 0) pieces[i] = pc.union(pieces[i] as Geom, polys as Geom) as GeoMultiPolygon;
    });
    list.splice(
      list.indexOf(parent),
      1,
      ...regions
        .map((r, i) => ({ id: r.id, codes: new Set(parent.codes), name: r.nome, shape: pieces[i]! }))
        .filter((r) => r.shape.length > 0),
    );
  }
  return list;
}

// ---------------------------------------------------------------- inquadratura
export interface Frame {
  width: number;
  height: number;
  /** Unità² del tabellone per km². */
  km2: number;
  /** Da gradi a unità del tabellone (y verso il basso), arrotondato a un decimale. */
  toMap(p: LonLat): Pt;
  /** Da forma in gradi a forma sul tabellone, ritagliata ai bordi. */
  project(shape: GeoMultiPolygon): MPoly;
}

/** Il mondo tagliato al meridiano opposto a quello centrale e proiettato con Miller. */
export function makeFrame(cfg: FrameCfg): Frame {
  const scale = 1 / cfg.kmPerUnita;
  const pr = cfg.proiezione;
  const cut = pr.meridianoCentrale - 180;
  const project = miller(pr.meridianoCentrale);
  const shift = (mp: GeoMultiPolygon): GeoMultiPolygon =>
    mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + 360, y] as LonLat)));
  /** Porta la geometria in gradi dalla parte giusta del taglio. */
  const prepare = (mp: GeoMultiPolygon): GeoMultiPolygon => {
    const east = pc.intersection(mp as Geom, rect(cut, -90, 180, 90) as Geom) as GeoMultiPolygon;
    const west = pc.intersection(mp as Geom, rect(-180, -90, cut, 90) as Geom) as GeoMultiPolygon;
    return [...east, ...shift(west)];
  };
  const [xmin] = project([cut, 0]);
  const [xmax] = project([cut + 360, 0]);
  const ymin = project([0, pr.latMin])[1];
  const ymax = project([0, pr.latMax])[1];
  const raw = (p: LonLat): Pt => {
    const [x, y] = project(p);
    return [(x - xmin) * scale, (ymax - y) * scale];
  };
  const width = round1((xmax - xmin) * scale);
  const height = round1((ymax - ymin) * scale);
  return {
    width,
    height,
    km2: scale * scale,
    toMap([x, y]) {
      const [mx, my] = raw([x < cut ? x + 360 : x, y]);
      return [round1(mx), round1(my)];
    },
    project(shape) {
      const prepared = prepare(shape);
      if (prepared.length === 0) return [];
      const projected = prepared.map((poly) => poly.map((ring) => ring.map(raw)));
      return tidy(pc.intersection(projected as Geom, rect(0, 0, width, height) as Geom));
    },
  };
}

// ---------------------------------------------------------------- paesi sul tabellone
export interface Country {
  id: string;
  name: string;
  shape: MPoly;
}

export function buildCountries(frame: Frame, cfg: FrameCfg): Country[] {
  const polyArea = (poly: Pt[][]) => multiPolygonArea([poly] as MultiPolygon);
  interface Placed extends Country {
    box: [number, number, number, number];
  }

  // 1. paesi proiettati e ritagliati, senza isolette
  let countries: Placed[] = [];
  for (const geo of prepareCountries()) {
    const shape = frame.project(geo.shape).filter((poly) => polyArea(poly) >= cfg.isolaMinKm2 * frame.km2);
    if (shape.length === 0) continue;
    countries.push({ id: geo.id, name: geo.name, shape, box: bounds(shape as MultiPolygon) });
  }

  // 2. paesi troppo piccoli: uniti al vicino con cui condividono più confine, altrimenti tolti
  const key = (p: Pt) => `${p[0]},${p[1]}`;
  const owners = new Map<string, Set<Placed>>();
  for (const c of countries)
    for (const poly of c.shape)
      for (const ring of poly) for (const p of ring) (owners.get(key(p)) ?? owners.set(key(p), new Set()).get(key(p))!).add(c);
  const area = (c: Placed) => multiPolygonArea(c.shape as MultiPolygon);
  const absorb = (small: Placed) => {
    const shared = new Map<Placed, number>();
    for (const poly of small.shape)
      for (const ring of poly)
        for (const p of ring)
          for (const o of owners.get(key(p)) ?? [])
            if (o !== small && countries.includes(o)) shared.set(o, (shared.get(o) ?? 0) + 1);
    const neighbour = [...shared.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    countries = countries.filter((c) => c !== small);
    if (!neighbour) return;
    neighbour.shape = tidy(pc.union(neighbour.shape as Geom, small.shape as Geom));
    neighbour.box = bounds(neighbour.shape as MultiPolygon);
    for (const poly of neighbour.shape) for (const ring of poly) for (const p of ring) owners.get(key(p))?.add(neighbour);
  };
  for (const small of [...countries].sort((a, b) => area(a) - area(b))) {
    if (area(small) >= cfg.paeseMinKm2 * frame.km2) break;
    absorb(small);
  }

  // 3. buchi rimasti senza paese dentro (San Marino e Vaticano, troppo piccoli e già scartati,
  // lasciavano due buchi nell'Italia: per il gioco erano mare). Le enclavi vere (il Lesotho) restano.
  const ringCenter = (ring: readonly Pt[]): Pt => {
    let x = 0;
    let y = 0;
    for (const p of ring) {
      x += p[0];
      y += p[1];
    }
    return [x / ring.length, y / ring.length];
  };
  const insideOther = (p: Pt, self: Placed) =>
    countries.some(
      (c) =>
        c !== self &&
        p[0] >= c.box[0] &&
        p[0] <= c.box[2] &&
        p[1] >= c.box[1] &&
        p[1] <= c.box[3] &&
        pointInMultiPolygon(p, c.shape as MultiPolygon),
    );
  for (const c of countries) {
    c.shape = c.shape.map(([outer, ...holes]) => [outer!, ...holes.filter((h) => insideOther(ringCenter(h), c))]);
  }

  return countries.map(({ id, name, shape }) => ({ id, name, shape }));
}
