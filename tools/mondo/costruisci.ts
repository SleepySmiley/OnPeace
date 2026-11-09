/**
 * Costruisce le mappe reali (mondo e continenti) dai dati di Natural Earth e dalla
 * configurazione in data/mondo/. Il risultato va in data/maps/<id>.json.
 *
 *   npm run mondo                  tutte le mappe
 *   npm run mondo -- europa asia   solo alcune
 *
 * Per cambiare una mappa si modifica la configurazione e si ricostruisce: i file in
 * data/maps/ generati da qui non vanno ritoccati a mano.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import * as pcModule from 'polygon-clipping';
import type { Geom, MultiPolygon as PcMultiPolygon } from 'polygon-clipping';
import {
  MapDef,
  bounds,
  checkMap,
  distance,
  distanceToBoundary,
  hasSeaNearby,
  isSea,
  largestPolygon,
  multiPolygonArea,
  pointInMultiPolygon,
  type CityDef,
  type CountryDef,
  type MultiPolygon,
} from '@onpeace/engine';
import { dataDir, loadRules, readJson } from '../data-io';
import { formatMap } from '../map-format';
import { loadAdmin1, loadCountries, loadPlaces, type GeoMultiPolygon, type LonLat, type NePlace } from './fonti';
import { densify, laea, miller, type Projection } from './proiezioni';

// il pacchetto è CommonJS: in ESM le funzioni stanno sotto "default"
const pc = ((pcModule as unknown as { default?: typeof pcModule }).default ?? pcModule) as typeof pcModule;

/** Unità mappa per punto di raggio: uguale per tutte le mappe, cambia solo quanti km vale un punto. */
const RANGE_SCALE = 16;

// ---------------------------------------------------------------- configurazione
const LonLatS = z.tuple([z.number(), z.number()]);
const IdS = z.string().regex(/^[a-z][a-z0-9_]*$/);

const CityRulesS = z.strictObject({
  popolazioneEsponente: z.number().positive(),
  popolazioneMin: z.number().positive(),
  popolazioneMax: z.number().positive(),
  redditoPerPopolazione: z.number().positive(),
  pilProCapiteRiferimento: z.number().positive(),
  pilEsponente: z.number().min(0),
  pilFattoreMin: z.number().positive(),
  pilFattoreMax: z.number().positive(),
  portoKm: z.number().positive(),
  /** Peso di area e popolazione nel numero di città di ogni paese. */
  pesoArea: z.number().min(0),
  pesoPopolazione: z.number().min(0),
  agganciaKm: z.number().min(0),
});

const MapCfgS = z.strictObject({
  id: IdS,
  nome: z.string().min(1),
  descrizione: z.string(),
  proiezione: z.discriminatedUnion('tipo', [
    z.strictObject({ tipo: z.literal('miller'), meridianoCentrale: z.number(), latMin: z.number(), latMax: z.number() }),
    z.strictObject({
      tipo: z.literal('laea'),
      centro: LonLatS,
      larghezzaKm: z.number().positive(),
      altezzaKm: z.number().positive(),
    }),
  ]),
  kmPerPunto: z.number().positive(),
  paeseMinKm2: z.number().min(0),
  isolaMinKm2: z.number().min(0),
  citta: z.number().int().positive(),
  distanzaMinimaPunti: z.number().min(0),
});
type MapCfg = z.infer<typeof MapCfgS>;

const MapsFileS = z.strictObject({ citta: CityRulesS, mappe: z.array(MapCfgS) });
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
const CitiesFileS = z.strictObject({
  /** Capitale scelta a mano: codice del paese (ADM0_A3 o id) → nome della città in Natural Earth. */
  capitali: z.record(z.string(), z.string()),
  /** Nome da mostrare: nome in Natural Earth (inglese) → nome nostro. */
  nomi: z.record(z.string(), z.string()),
  /** Città da non usare mai, per nome (inglese o italiano). */
  escludi: z.array(z.string()),
  /** Città da mettere sempre, se cadono nella mappa. */
  includi: z.array(z.string()),
});
const GeoFileS = z.strictObject({
  invalicabili: z.array(z.strictObject({ id: IdS, nome: z.string(), contorno: z.array(LonLatS).min(3) })),
  passaggi: z.array(
    z.strictObject({ id: IdS, nome: z.string(), per: z.enum(['land', 'naval']), da: LonLatS, a: LonLatS }),
  ),
});

const RegionS = z.strictObject({ id: IdS, nome: z.string().min(1), membri: z.array(z.string()).min(1) });
const RegionsFileS = z.strictObject({
  /** Territori che passano da un paese all'altro (codici delle suddivisioni). */
  trasferisci: z.array(z.strictObject({ nome: z.string(), da: z.string(), a: z.string(), codici: z.array(z.string()).min(1) })),
  /** Paesi grandi divisi in regioni: codice del paese → regioni, ognuna con le sue suddivisioni. */
  paesi: z.record(z.string(), z.array(RegionS).min(2)),
});

const cfgDir = join(dataDir, 'mondo');
const mapsFile = MapsFileS.parse(readJson(join(cfgDir, 'mappe.json')));
const countriesFile = CountriesFileS.parse(readJson(join(cfgDir, 'paesi.json')));
const citiesFile = CitiesFileS.parse(readJson(join(cfgDir, 'citta.json')));
const geoFile = GeoFileS.parse(readJson(join(cfgDir, 'geografia.json')));
const regionsFile = RegionsFileS.parse(readJson(join(cfgDir, 'regioni.json')));
const rules = loadRules();

// ---------------------------------------------------------------- utilità
type Pt = [number, number];
type MPoly = Pt[][][];

const round1 = (v: number) => Math.round(v * 10) / 10;
const lower = (s: string) => s.toLowerCase();
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'c$1');

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

/** Da risultato di polygon-clipping (anelli chiusi) ad anelli aperti, arrotondati, senza doppioni. */
function tidy(mp: PcMultiPolygon | MPoly): MPoly {
  const out: MPoly = [];
  for (const poly of mp) {
    const rings: Pt[][] = [];
    for (const ring of poly) {
      const r: Pt[] = [];
      for (const [x, y] of ring) {
        const p: Pt = [round1(x!), round1(y!)];
        const prev = r[r.length - 1];
        if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) r.push(p);
      }
      while (r.length > 1 && r[0]![0] === r[r.length - 1]![0] && r[0]![1] === r[r.length - 1]![1]) r.pop();
      if (r.length >= 3) rings.push(r);
      else if (rings.length === 0) break; // contorno degenere: si scarta tutto il poligono
    }
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

const polyArea = (poly: Pt[][]) => multiPolygonArea([poly] as MultiPolygon);

// ---------------------------------------------------------------- paesi (in gradi)
interface GeoCountry {
  id: string;
  /** Codici Natural Earth delle località che appartengono al paese. */
  codes: Set<string>;
  name: string;
  gdpPerCapita: number;
  label: LonLat | null;
  shape: GeoMultiPolygon;
}

function prepareCountries(): GeoCountry[] {
  const excluded = new Set(countriesFile.escludi);
  const list: GeoCountry[] = loadCountries()
    .filter((c) => !excluded.has(c.a3) && c.shape.length > 0)
    .map((c) => ({
      id: lower(c.a3),
      codes: new Set([c.a3, c.iso3].filter(Boolean)),
      name: countriesFile.nomi[c.a3] ?? c.name,
      gdpPerCapita: c.gdpPerCapita,
      label: c.label,
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
    list.push({ id: d.id, codes: new Set(parent.codes), name: d.nome, gdpPerCapita: parent.gdpPerCapita, label: null, shape: piece });
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
        .map((r, i) => ({
          id: r.id,
          codes: new Set(parent.codes),
          name: r.nome,
          gdpPerCapita: parent.gdpPerCapita,
          label: null,
          shape: pieces[i]!,
        }))
        .filter((r) => r.shape.length > 0),
    );
  }
  return list;
}

// ---------------------------------------------------------------- costruzione di una mappa
interface Frame {
  /** Da gradi a unità mappa (y verso il basso). */
  toMap: (p: LonLat) => Pt;
  /** Porta la geometria in gradi nell'intervallo giusto prima di proiettarla. */
  prepare: (mp: GeoMultiPolygon) => GeoMultiPolygon;
  /** Porta un punto in gradi nell'intervallo giusto. */
  preparePoint: (p: LonLat) => LonLat;
  width: number;
  height: number;
  /** Unità mappa per km. */
  scale: number;
}

function makeFrame(cfg: MapCfg): Frame {
  const scale = RANGE_SCALE / cfg.kmPerPunto;
  const pr = cfg.proiezione;
  let project: Projection;
  let box: [number, number, number, number]; // in km: xmin, ymin, xmax, ymax
  let prepare: Frame['prepare'];
  let preparePoint: Frame['preparePoint'];

  if (pr.tipo === 'miller') {
    // si taglia il mondo al meridiano opposto a quello centrale
    const cut = pr.meridianoCentrale - 180;
    project = miller(pr.meridianoCentrale);
    const shift = (mp: GeoMultiPolygon): GeoMultiPolygon =>
      mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + 360, y] as LonLat)));
    prepare = (mp) => {
      const east = pc.intersection(mp as Geom, rect(cut, -90, 180, 90) as Geom) as GeoMultiPolygon;
      const west = pc.intersection(mp as Geom, rect(-180, -90, cut, 90) as Geom) as GeoMultiPolygon;
      return [...east, ...shift(west)];
    };
    preparePoint = ([x, y]) => [x < cut ? x + 360 : x, y];
    const [x0] = project([cut, 0]);
    const [x1] = project([cut + 360, 0]);
    box = [x0, project([0, pr.latMin])[1], x1, project([0, pr.latMax])[1]];
  } else {
    project = laea(pr.centro);
    const center = pr.centro;
    // si tengono solo i poligoni dalla parte del globo che si vede
    const near = (p: LonLat) => {
      const r = Math.PI / 180;
      const c =
        Math.sin(center[1] * r) * Math.sin(p[1] * r) +
        Math.cos(center[1] * r) * Math.cos(p[1] * r) * Math.cos((p[0] - center[0]) * r);
      return c > -0.2;
    };
    prepare = (mp) =>
      mp.filter((poly) => poly[0]!.some(near)).map((poly) => poly.map((ring) => densify(ring, 0.5)));
    preparePoint = (p) => p;
    box = [-pr.larghezzaKm / 2, -pr.altezzaKm / 2, pr.larghezzaKm / 2, pr.altezzaKm / 2];
  }
  const [xmin, ymin, xmax, ymax] = box;
  return {
    toMap: (p) => {
      const [x, y] = project(p);
      return [(x - xmin) * scale, (ymax - y) * scale];
    },
    prepare,
    preparePoint,
    width: round1((xmax - xmin) * scale),
    height: round1((ymax - ymin) * scale),
    scale,
  };
}

interface Country {
  geo: GeoCountry;
  id: string;
  name: string;
  shape: MPoly;
  label: Pt | null;
  box: [number, number, number, number];
}

function projectShape(frame: Frame, shape: GeoMultiPolygon): MPoly {
  const prepared = frame.prepare(shape);
  if (prepared.length === 0) return [];
  const projected = prepared.map((poly) => poly.map((ring) => ring.map(frame.toMap)));
  const clipped = pc.intersection(projected as Geom, rect(0, 0, frame.width, frame.height) as Geom);
  return tidy(clipped);
}

/** Distanza dal punto più vicino dell'elenco. */
const clearance = (p: Pt, avoid: readonly Pt[]) => avoid.reduce((m, a) => Math.min(m, distance(p, a)), Infinity);

/** Punto interno lontano dai bordi e dai punti da evitare (le città), per il nome del paese. */
function labelSpot(shape: MPoly, avoid: readonly Pt[]): Pt {
  const main = largestPolygon(shape as MultiPolygon) as Pt[][];
  const target = [main] as MultiPolygon;
  const [minX, minY, maxX, maxY] = bounds(target);
  const near = avoid.filter((a) => a[0] >= minX - 50 && a[0] <= maxX + 50 && a[1] >= minY - 50 && a[1] <= maxY + 50);
  let best: Pt = interiorPoint(shape);
  let bestScore = -Infinity;
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p: Pt = [minX + ((maxX - minX) * i) / steps, minY + ((maxY - minY) * j) / steps];
      if (!pointInMultiPolygon(p, target)) continue;
      const score = Math.min(distanceToBoundary(p, target), clearance(p, near) * 0.9);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return [round1(best[0]), round1(best[1])];
}

/** Punto interno lontano dai bordi, per l'etichetta o una città di ripiego. */
function interiorPoint(shape: MPoly): Pt {
  const main = largestPolygon(shape as MultiPolygon) as Pt[][];
  const [minX, minY, maxX, maxY] = bounds([main] as MultiPolygon);
  let best: Pt = main[0]![0]!;
  let bestD = -1;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p: Pt = [minX + ((maxX - minX) * i) / steps, minY + ((maxY - minY) * j) / steps];
      if (!pointInMultiPolygon(p, [main] as MultiPolygon)) continue;
      const d = distanceToBoundary(p, [main] as MultiPolygon);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return [round1(best[0]), round1(best[1])];
}

/** Sposta un punto appena fuori dal paese (costa approssimata) poco dentro il confine. */
function snapInside(p: Pt, shape: MPoly, maxDist: number): Pt | null {
  if (pointInMultiPolygon(p, shape as MultiPolygon)) return p;
  for (let r = 0.5; r <= maxDist; r += Math.max(0.5, maxDist / 40)) {
    let best: Pt | null = null;
    let bestD = -1;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const q: Pt = [round1(p[0] + Math.cos(a) * r), round1(p[1] + Math.sin(a) * r)];
      if (!pointInMultiPolygon(q, shape as MultiPolygon)) continue;
      const d = distanceToBoundary(q, shape as MultiPolygon);
      if (d > bestD) {
        bestD = d;
        best = q;
      }
    }
    if (best) return best;
  }
  return null;
}

function buildMap(cfg: MapCfg, geoCountries: GeoCountry[], places: NePlace[]): MapDef {
  const frame = makeFrame(cfg);
  const km2 = frame.scale * frame.scale; // unità² per km²
  const warn = (msg: string) => console.warn(`  [${cfg.id}] ${msg}`);

  // 1. paesi proiettati e ritagliati, senza isolette
  let countries: Country[] = [];
  for (const geo of geoCountries) {
    const shape = projectShape(frame, geo.shape).filter((poly) => polyArea(poly) >= cfg.isolaMinKm2 * km2);
    if (shape.length === 0) continue;
    countries.push({ geo, id: geo.id, name: geo.name, shape, label: null, box: bounds(shape as MultiPolygon) });
  }

  // 2. paesi troppo piccoli: uniti al vicino con cui condividono più confine, altrimenti tolti
  const key = (p: Pt) => `${p[0]},${p[1]}`;
  const owners = new Map<string, Set<Country>>();
  for (const c of countries)
    for (const poly of c.shape)
      for (const ring of poly) for (const p of ring) (owners.get(key(p)) ?? owners.set(key(p), new Set()).get(key(p))!).add(c);
  const area = (c: Country) => multiPolygonArea(c.shape as MultiPolygon);
  /** Unisce un paese al vicino con cui condivide più confine; se non confina con nessuno lo toglie. */
  const absorb = (small: Country) => {
    const shared = new Map<Country, number>();
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
    for (const code of small.geo.codes) neighbour.geo.codes.add(code);
    for (const poly of neighbour.shape) for (const ring of poly) for (const p of ring) owners.get(key(p))?.add(neighbour);
  };
  for (const small of [...countries].sort((a, b) => area(a) - area(b))) {
    if (area(small) >= cfg.paeseMinKm2 * km2) break;
    absorb(small);
  }

  // 2b. buchi rimasti senza paese dentro (San Marino e Vaticano, troppo piccoli e già scartati,
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
  const insideOther = (p: Pt, self: Country) =>
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

  const draft = { width: frame.width, height: frame.height, countries: [] as CountryDef[] } as unknown as MapDef;
  const countryAt = (p: Pt) =>
    countries.find(
      (c) =>
        p[0] >= c.box[0] && p[0] <= c.box[2] && p[1] >= c.box[1] && p[1] <= c.box[3] && pointInMultiPolygon(p, c.shape as MultiPolygon),
    );

  // 3. zone invalicabili, solo sulla terraferma
  const noGo: MPoly = [];
  for (const z of geoFile.invalicabili) {
    const zone = projectShape(frame, [[z.contorno]]);
    if (zone.length === 0) continue;
    const [x0, y0, x1, y1] = bounds(zone as MultiPolygon);
    const land = countries.filter((c) => c.box[0] <= x1 && c.box[2] >= x0 && c.box[1] <= y1 && c.box[3] >= y0);
    if (land.length === 0) continue;
    const landUnion = pc.union(...(land.map((c) => c.shape) as [Geom, ...Geom[]]));
    noGo.push(...tidy(pc.intersection(zone as Geom, landUnion)));
  }
  const inNoGo = (p: Pt) => pointInMultiPolygon(p, noGo as MultiPolygon);

  // 4. località: proiettate e assegnate a un paese
  const excluded = new Set(citiesFile.escludi.map(lower));
  interface Candidate {
    place: NePlace;
    country: Country;
    pos: Pt;
  }
  const snapMax = mapsFile.citta.agganciaKm * frame.scale;
  const candidates: Candidate[] = [];
  for (const place of places) {
    if (excluded.has(lower(place.name)) || excluded.has(lower(place.nameIt))) continue;
    const pos = frame.toMap(frame.preparePoint(place.pos));
    if (pos[0] < 0 || pos[1] < 0 || pos[0] > frame.width || pos[1] > frame.height) continue;
    // poco fuori dalla costa (o fuori per l'arrotondamento): si aggancia al paese giusto, se è vicino
    const rounded: Pt = [round1(pos[0]), round1(pos[1])];
    // (tra i paesi con lo stesso codice, per esempio le regioni di un paese grande, il più vicino)
    const country =
      countryAt(pos) ??
      countries
        .filter((c) => c.geo.codes.has(place.a3))
        .map((c) => ({ c, d: distanceToBoundary(pos, c.shape as MultiPolygon) }))
        .sort((a, b) => a.d - b.d)[0]?.c;
    const at = country ? snapInside(rounded, country.shape, snapMax) : null;
    if (!country || !at || inNoGo(at)) continue;
    candidates.push({ place, country, pos: at });
  }
  // lembi di paesi tagliati dal bordo della mappa, senza nessuna città: vanno al vicino
  for (const country of [...countries]) {
    if (!candidates.some((c) => c.country === country)) {
      warn(`${country.name}: nessuna città dentro la mappa, unito al vicino o tolto`);
      absorb(country);
    }
  }

  // 5. scelta delle città: la capitale, poi le più popolose ben distanziate, in proporzione al paese
  const minDist = cfg.distanzaMinimaPunti * RANGE_SCALE;
  const chosen: Candidate[] = [];
  const capitalOf = new Map<Country, Candidate>();
  const byCountry = new Map<Country, Candidate[]>();
  for (const c of candidates) (byCountry.get(c.country) ?? byCountry.set(c.country, []).get(c.country)!).push(c);
  for (const list of byCountry.values()) list.sort((a, b) => b.place.pop - a.place.pop);

  for (const country of [...countries]) {
    const list = byCountry.get(country) ?? [];
    const override = [...country.geo.codes, country.id]
      .map((code) => citiesFile.capitali[code])
      .find((name) => name !== undefined);
    let capital =
      (override ? list.find((c) => lower(c.place.name) === lower(override) || lower(c.place.nameIt) === lower(override)) : undefined) ??
      list.find((c) => c.place.mainCapital && country.geo.codes.has(c.place.a3)) ??
      list.find((c) => c.place.capital && country.geo.codes.has(c.place.a3)) ??
      list[0];
    if (override && capital && lower(capital.place.name) !== lower(override) && lower(capital.place.nameIt) !== lower(override)) {
      warn(`capitale "${override}" non trovata in ${country.name}`);
    }
    if (!capital) {
      // nessuna località nei dati: una città col nome del paese al centro
      const pos = interiorPoint(country.shape);
      warn(`${country.name}: nessuna città nei dati, ne creo una al centro`);
      capital = {
        place: { name: country.name, nameIt: country.name, a3: '', capital: true, mainCapital: true, pop: 100_000, pos: [0, 0] },
        country,
        pos,
      };
      byCountry.set(country, [capital]);
    }
    capitalOf.set(country, capital);
    chosen.push(capital);
  }

  // tra paesi diversi basta metà distanza (città di confine, capitali vicine)
  const tooClose = (c: Candidate, min: number) =>
    chosen.some((o) => distance(o.pos, c.pos) < (o.country === c.country ? min : min / 2));
  for (const name of citiesFile.includi.map(lower)) {
    const c = candidates.find((x) => lower(x.place.name) === name || lower(x.place.nameIt) === name);
    if (c && !chosen.includes(c) && !tooClose(c, minDist / 4)) chosen.push(c);
  }

  const popOf = (country: Country) => (byCountry.get(country) ?? []).reduce((s, c) => s + c.place.pop, 0) / 1e6;
  const weight = (country: Country) =>
    mapsFile.citta.pesoArea * Math.sqrt(area(country) / km2 / 1e5) + mapsFile.citta.pesoPopolazione * Math.sqrt(popOf(country) / 10);
  const totalWeight = countries.reduce((s, c) => s + weight(c), 0);
  const quota = new Map(countries.map((c) => [c, Math.max(1, Math.round((cfg.citta * weight(c)) / totalWeight))]));
  const count = new Map<Country, number>();
  for (const c of chosen) count.set(c.country, (count.get(c.country) ?? 0) + 1);
  const rest = candidates.filter((c) => !chosen.includes(c)).sort((a, b) => b.place.pop - a.place.pop);
  for (const c of rest) {
    if (chosen.length >= cfg.citta) break;
    if ((count.get(c.country) ?? 0) >= quota.get(c.country)! || c.place.pop <= 0 || tooClose(c, minDist)) continue;
    chosen.push(c);
    count.set(c.country, (count.get(c.country) ?? 0) + 1);
  }

  // 6. città di paesi diversi quasi sovrapposte (es. Kinshasa e Brazzaville): si allontanano un po',
  //    restando ognuna nel proprio paese, così sulla mappa si distinguono
  const minSep = RANGE_SCALE * 1.05; // un po' di margine per gli arrotondamenti
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < chosen.length; i++) {
      for (let j = i + 1; j < chosen.length; j++) {
        const a = chosen[i]!;
        const b = chosen[j]!;
        const d = distance(a.pos, b.pos);
        if (d >= minSep) continue;
        const [ux, uy] = d > 0 ? [(b.pos[0] - a.pos[0]) / d, (b.pos[1] - a.pos[1]) / d] : [1, 0];
        const push = (c: Candidate, sign: number, amount: number): boolean => {
          const q: Pt = [round1(c.pos[0] + sign * ux * amount), round1(c.pos[1] + sign * uy * amount)];
          if (!pointInMultiPolygon(q, c.country.shape as MultiPolygon) || inNoGo(q)) return false;
          c.pos = q;
          return true;
        };
        const need = minSep - d;
        if (!(push(a, -1, need / 2) && push(b, 1, need / 2)) && !push(b, 1, need)) push(a, -1, need);
      }
    }
  }

  // 7. paesi e città nel formato del gioco
  // nome del paese: dove lo mette Natural Earth, se non copre una città; altrimenti lontano dalle città
  const cityPoints = chosen.map((c) => c.pos);
  const countryDefs: CountryDef[] = countries.map((c) => {
    let label: Pt | null = null;
    if (c.geo.label) {
      const l = frame.toMap(frame.preparePoint(c.geo.label));
      const free = clearance(l, cityPoints) >= RANGE_SCALE * 1.5;
      if (free && pointInMultiPolygon(l, c.shape as MultiPolygon) && !inNoGo(l)) label = [round1(l[0]), round1(l[1])];
    }
    return { id: c.id, name: c.name, capital: '', label: label ?? labelSpot(c.shape, cityPoints), shape: c.shape };
  });
  draft.countries = countryDefs;

  const cr = mapsFile.citta;
  const usedIds = new Set<string>();
  const cities: CityDef[] = [];
  const idOfCandidate = new Map<Candidate, string>();
  for (const c of chosen) {
    const name = citiesFile.nomi[c.place.name] ?? (c.place.nameIt || c.place.name);
    let id = slug(name) || slug(c.place.name) || 'citta';
    if (usedIds.has(id)) id = `${id}_${c.country.id}`;
    for (let n = 2; usedIds.has(id); n++) id = `${slug(name)}_${n}`;
    usedIds.add(id);
    idOfCandidate.set(c, id);
    const population = Math.min(cr.popolazioneMax, Math.max(cr.popolazioneMin, (c.place.pop / 1e6) ** cr.popolazioneEsponente));
    const gdp = c.country.geo.gdpPerCapita;
    const factor =
      gdp > 0 ? Math.min(cr.pilFattoreMax, Math.max(cr.pilFattoreMin, (gdp / cr.pilProCapiteRiferimento) ** cr.pilEsponente)) : 1;
    cities.push({
      id,
      name,
      country: c.country.id,
      pos: c.pos,
      population: Math.round(population * 100) / 100,
      income: Math.round(cr.redditoPerPopolazione * population * factor),
      port: false,
    });
  }
  for (const def of countryDefs) {
    const country = countries.find((c) => c.id === def.id)!;
    def.capital = idOfCandidate.get(capitalOf.get(country)!)!;
  }
  for (const city of cities) city.port = hasSeaNearby(draft, city.pos, cr.portoKm * frame.scale);

  // 8. passaggi: estremi spostati, se serve, sul terreno giusto (la costa è approssimata)
  const shortcuts: MapDef['shortcuts'] = [];
  for (const s of geoFile.passaggi) {
    const ends = [s.da, s.a].map((p) => frame.toMap(frame.preparePoint(p)));
    if (ends.some((p) => p[0] < 0 || p[1] < 0 || p[0] > frame.width || p[1] > frame.height)) continue;
    const wantSea = s.per === 'naval';
    const fixed = ends.map((p) => {
      for (let r = 0; r <= 20 * frame.scale; r += 0.5) {
        for (let k = 0; k < (r === 0 ? 1 : 24); k++) {
          const a = (k / 24) * Math.PI * 2;
          const q: Pt = [round1(p[0] + Math.cos(a) * r), round1(p[1] + Math.sin(a) * r)];
          if (isSea(draft, q) === wantSea && !inNoGo(q)) return q;
        }
      }
      return null;
    });
    if (fixed[0] && fixed[1]) shortcuts.push({ id: s.id, from: fixed[0], to: fixed[1], for: s.per });
    else warn(`passaggio ${s.id}: estremi non sistemabili`);
  }

  return MapDef.parse({
    $schema: '../schema/map.schema.json',
    id: cfg.id,
    name: cfg.nome,
    description: `${cfg.descrizione} Dati geografici: Natural Earth (pubblico dominio).`,
    width: frame.width,
    height: frame.height,
    rangeScale: RANGE_SCALE,
    countries: countryDefs,
    cities,
    noGo,
    shortcuts,
  });
}

// ---------------------------------------------------------------- avvio
const wanted = process.argv.slice(2);
const configs = mapsFile.mappe.filter((m) => wanted.length === 0 || wanted.includes(m.id));
if (configs.length === 0) {
  console.error(`nessuna mappa con questi id; quelle configurate: ${mapsFile.mappe.map((m) => m.id).join(', ')}`);
  process.exit(1);
}

const geoCountries = prepareCountries();
const places = loadPlaces();
let failed = false;
for (const cfg of configs) {
  const t0 = Date.now();
  const map = buildMap(cfg, geoCountries, places);
  const errors = checkMap(map, { portMaxSeaDistance: rules.defaults.movement.portMaxSeaDistance });
  if (errors.length > 0) {
    failed = true;
    console.error(`${cfg.id}: la mappa non supera i controlli:`);
    for (const e of errors) console.error(`  - ${e}`);
    continue;
  }
  const text = formatMap(map);
  writeFileSync(join(dataDir, 'maps', `${cfg.id}.json`), text);
  const vertices = map.countries.reduce((n, c) => n + c.shape.flat().reduce((m, r) => m + r.length, 0), 0);
  console.log(
    `${cfg.id}: ${map.countries.length} paesi, ${map.cities.length} città (${map.cities.filter((c) => c.port).length} porti), ` +
      `${map.shortcuts.length} passaggi, ${vertices} vertici, ${Math.round(map.width)}×${Math.round(map.height)}, ` +
      `${Math.round(text.length / 1024)} kB, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}
if (failed) process.exit(1);
