/**
 * Genera una mappa di prova inventata: continenti da rumore, paesi da celle di Voronoi
 * accorpate, montagne invalicabili e città con porti.
 *
 *   npm run map:generate -- [seme] [nome-file]
 *
 * La mappa generata è solo un punto di partenza: si può poi modificare a mano.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Delaunay } from 'd3-delaunay';
import { contours } from 'd3-contour';
import * as pcModule from 'polygon-clipping';
import type { MultiPolygon as PcMultiPolygon, Polygon as PcPolygon } from 'polygon-clipping';
import { createNoise2D } from 'simplex-noise';
import {
  MapDef,
  bounds,
  checkMap,
  createRng,
  distance,
  distanceToBoundary,
  hasSeaNearby,
  multiPolygonArea,
  pointInMultiPolygon,
  polygonArea,
  ringSignedArea,
  seedFromString,
  type CityDef,
  type CountryDef,
  type MultiPolygon,
  type Point,
} from '@onpeace/engine';
import { dataDir, loadRules } from './data-io';

// ---------------------------------------------------------------- parametri
const seedText = process.argv[2] ?? 'onpeace-prova-1';
const fileName = process.argv[3] ?? 'prova';

const W = 2400;
const H = 1500;
const RANGE_SCALE = 10; // unità mappa per punto raggio
const CELL = 4; // risoluzione della griglia di rumore
const LAND_FRACTION = 0.44;
const VORONOI_SPACING = 46;
const TARGET_COUNTRIES = 13;
const AREA_PER_CITY = 26000;
const MIN_CITY_SPACING = 70;
const MIN_ISLAND_AREA = 9000;
const MIN_LAKE_AREA = 6000;

// il pacchetto è CommonJS: in ESM le funzioni stanno sotto "default"
const polygonClipping = ((pcModule as unknown as { default?: typeof pcModule }).default ??
  pcModule) as typeof pcModule;

const rules = loadRules();
const PORT_RADIUS = rules.defaults.movement.portMaxSeaDistance * RANGE_SCALE;

const rng = createRng(seedFromString(seedText));
const noise = createNoise2D(() => rng.next());
const ridgeNoise = createNoise2D(() => rng.next());

type Pt = [number, number];
type Ring = Pt[];
type Poly = Ring[];
type MPoly = Poly[];

// ---------------------------------------------------------------- utilità
const round1 = (v: number) => Math.round(v * 10) / 10;

function simplifyOpen(points: Pt[], tol: number): Pt[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    const [ax, ay] = points[a]!;
    const [bx, by] = points[b]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]!;
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function simplifyRing(ring: Ring, tol: number): Ring {
  if (ring.length < 8) return ring;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = distance(ring[0]!, ring[i]!);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = simplifyOpen(ring.slice(0, far + 1), tol);
  const b = simplifyOpen([...ring.slice(far), ring[0]!], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Toglie il punto di chiusura duplicato e arrotonda. */
function openRing(ring: number[][]): Ring {
  const pts = ring.map(([x, y]) => [x!, y!] as Pt);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts;
}

function roundMPoly(mp: MPoly): MPoly {
  return mp.map((poly) =>
    poly.map((ring) => {
      const out: Ring = [];
      for (const [x, y] of ring) {
        const p: Pt = [round1(x), round1(y)];
        const prev = out[out.length - 1];
        if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
      }
      return out;
    }),
  );
}

function fromClipping(mp: PcMultiPolygon): MPoly {
  return mp.map((poly) => poly.map((ring) => openRing(ring)));
}

const toClip = (mp: MPoly) => mp as unknown as PcMultiPolygon;

// ---------------------------------------------------------------- 1. rilievo
const gw = Math.ceil(W / CELL);
const gh = Math.ceil(H / CELL);
const height = new Float64Array(gw * gh);

function fbm(x: number, y: number): number {
  let amp = 1;
  let freq = 1 / 650;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

for (let gy = 0; gy < gh; gy++) {
  for (let gx = 0; gx < gw; gx++) {
    const x = (gx + 0.5) * CELL;
    const y = (gy + 0.5) * CELL;
    const edge = Math.min(x, W - x, y, H - y) / (0.14 * H);
    const fall = edge >= 1 ? 0 : (1 - edge) ** 2;
    height[gy * gw + gx] = fbm(x, y) - fall * 0.9;
  }
}

const sortedHeights = Float64Array.from(height).sort();
const seaLevel = sortedHeights[Math.floor(sortedHeights.length * (1 - LAND_FRACTION))]!;

function heightAt(x: number, y: number): number {
  const gx = Math.min(gw - 1, Math.max(0, Math.floor(x / CELL)));
  const gy = Math.min(gh - 1, Math.max(0, Math.floor(y / CELL)));
  return height[gy * gw + gx]!;
}
const isLandH = (x: number, y: number) => heightAt(x, y) > seaLevel;

// ---------------------------------------------------------------- 2. terre emerse
function contourAt(field: Float64Array, threshold: number): MPoly {
  const [contour] = contours().size([gw, gh]).thresholds([threshold])(Array.from(field));
  if (!contour) return [];
  return contour.coordinates.map((poly) =>
    poly.map((ring) => openRing(ring.map(([x, y]) => [x! * CELL, y! * CELL]))),
  );
}

let land: MPoly = contourAt(height, seaLevel)
  .map((poly) => poly.map((ring) => simplifyRing(ring, 2.5)).filter((r) => r.length >= 3))
  .filter((poly) => poly.length > 0 && Math.abs(ringSignedArea(poly[0]!)) >= MIN_ISLAND_AREA)
  .map(([outer, ...holes]) => [
    outer!,
    ...holes.filter((h) => Math.abs(ringSignedArea(h)) >= MIN_LAKE_AREA),
  ]);
land = fromClipping(polygonClipping.union(toClip(land)));

// ---------------------------------------------------------------- 3. montagne (zone invalicabili)
const ridge = new Float64Array(gw * gh);
for (let gy = 0; gy < gh; gy++) {
  for (let gx = 0; gx < gw; gx++) {
    const i = gy * gw + gx;
    const x = (gx + 0.5) * CELL;
    const y = (gy + 0.5) * CELL;
    const inland = height[i]! - seaLevel;
    // massicci compatti: rumore a bassa frequenza, solo nell'entroterra
    ridge[i] = inland > 0.12 ? ridgeNoise(x / 210, y / 210) : -1;
  }
}
let noGo: MPoly = contourAt(ridge, 0.62)
  .map((poly) => [simplifyRing(poly[0]!, 2)])
  .filter((poly) => poly[0]!.length >= 3 && Math.abs(ringSignedArea(poly[0]!)) > 3500)
  .sort((a, b) => polygonArea(b) - polygonArea(a))
  .slice(0, 7);
if (noGo.length > 0) noGo = fromClipping(polygonClipping.intersection(toClip(noGo), toClip(land)));

// ---------------------------------------------------------------- 4. celle di Voronoi
const sites: Pt[] = [];
for (let y = VORONOI_SPACING / 2; y < H; y += VORONOI_SPACING) {
  for (let x = VORONOI_SPACING / 2; x < W; x += VORONOI_SPACING) {
    sites.push([
      x + (rng.next() - 0.5) * VORONOI_SPACING * 0.8,
      y + (rng.next() - 0.5) * VORONOI_SPACING * 0.8,
    ]);
  }
}
const delaunay = Delaunay.from(sites);
const voronoi = delaunay.voronoi([0, 0, W, H]);
const cells: Ring[] = sites.map((_, i) => openRing(voronoi.cellPolygon(i) as number[][]));

const touchesLand = cells.map((ring, i) => {
  const site = sites[i]!;
  if (isLandH(site[0], site[1])) return true;
  return ring.some(
    ([x, y]) => isLandH(x, y) || isLandH((x + site[0]) / 2, (y + site[1]) / 2),
  );
});

// ---------------------------------------------------------------- 5. paesi
const landSites = sites.map((_, i) => i).filter((i) => touchesLand[i] && isLandH(...sites[i]!));
const seeds: number[] = [rng.pick(landSites)];
while (seeds.length < TARGET_COUNTRIES) {
  let best = -1;
  let bestD = -1;
  for (const i of landSites) {
    const d = Math.min(...seeds.map((s) => distance(sites[i]!, sites[s]!)));
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  seeds.push(best);
}

const owner = new Int32Array(sites.length).fill(-1);
const frontiers: number[][] = seeds.map((s) => [s]);
const sizes: number[] = seeds.map(() => 0);
const weights: number[] = seeds.map(() => 0.75 + rng.next() * 0.6);

for (;;) {
  let c = -1;
  for (let k = 0; k < seeds.length; k++) {
    if (frontiers[k]!.length && (c < 0 || sizes[k]! * weights[k]! < sizes[c]! * weights[c]!)) c = k;
  }
  if (c < 0) break;
  const f = frontiers[c]!;
  const idx = rng.int(0, f.length - 1);
  const cell = f[idx]!;
  f[idx] = f[f.length - 1]!;
  f.pop();
  if (owner[cell] !== -1) continue;
  owner[cell] = c;
  sizes[c]!++;
  for (const nb of delaunay.neighbors(cell)) if (touchesLand[nb] && owner[nb] === -1) f.push(nb);
}

// terre non raggiunte: le componenti grandi diventano paesi, le piccole vanno al vicino
const unassigned = sites.map((_, i) => i).filter((i) => touchesLand[i] && owner[i] === -1);
const visited = new Set<number>();
for (const start of unassigned) {
  if (visited.has(start)) continue;
  const component: number[] = [];
  const queue = [start];
  visited.add(start);
  while (queue.length) {
    const cur = queue.pop()!;
    component.push(cur);
    for (const nb of delaunay.neighbors(cur)) {
      if (touchesLand[nb] && owner[nb] === -1 && !visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  if (component.length >= 25) {
    const id = sizes.length;
    sizes.push(component.length);
    for (const cell of component) owner[cell] = id;
  } else {
    for (const cell of component) {
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < sites.length; j++) {
        if (owner[j]! < 0) continue;
        const d = distance(sites[cell]!, sites[j]!);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      owner[cell] = owner[best]!;
    }
  }
}

// ---------------------------------------------------------------- 6. forme dei paesi
const countryCount = sizes.length;
const shapes: MPoly[] = [];
for (let c = 0; c < countryCount; c++) {
  const myCells = cells.filter((_, i) => owner[i] === c).map((ring) => [ring] as Poly);
  if (myCells.length === 0) {
    shapes.push([]);
    continue;
  }
  const [firstCell, ...otherCells] = myCells as unknown as PcPolygon[];
  const united = polygonClipping.union(firstCell!, ...otherCells);
  const clipped = fromClipping(polygonClipping.intersection(united, toClip(land)));
  shapes.push(roundMPoly(clipped.filter((poly) => polygonArea(poly) >= 1500)));
}

// ---------------------------------------------------------------- 7. nomi
const START = ['al', 'bar', 'cor', 'dal', 'el', 'fer', 'gal', 'har', 'is', 'kal', 'lor', 'mar', 'nor', 'or', 'pel', 'ros', 'sal', 'tar', 'ul', 'vel', 'zan', 'bri', 'dra', 'tor', 'mel', 'ser', 'var', 'lun', 'os', 'cas', 'ven', 'ard'];
const MID = ['a', 'e', 'i', 'o', 'an', 'en', 'ar', 'or', 'el', 'il', 'as', 'u'];
const COUNTRY_END = ['dia', 'ria', 'nia', 'mar', 'vor', 'gard', 'stan', 'ovia', 'esia', 'ana', 'aria', 'ennia'];
const CITY_END = ['polis', 'ona', 'ella', 'ano', 'ino', 'ara', 'esk', 'ent', 'is', 'um', 'avo', 'era', 'ia', 'grad', 'burg', 'ia', 'oro', 'enza'];
const usedNames = new Set<string>();

function makeName(ends: string[], withMid: number): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let name = rng.pick(START);
    if (rng.next() < withMid) name += rng.pick(MID);
    name += rng.pick(ends);
    name = name.replace(/([aeiou])\1+/g, '$1');
    const cap = name[0]!.toUpperCase() + name.slice(1);
    if (!usedNames.has(cap) && cap.length >= 4 && cap.length <= 11) {
      usedNames.add(cap);
      return cap;
    }
  }
  throw new Error('nomi esauriti');
}
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- 8. città
const countries: CountryDef[] = [];
const cities: CityDef[] = [];
const draftMap = { width: W, height: H, countries } as unknown as MapDef;

function samplePoint(shape: MultiPolygon): Point | null {
  const [minX, minY, maxX, maxY] = bounds(shape);
  for (let k = 0; k < 200; k++) {
    const p: Point = [minX + rng.next() * (maxX - minX), minY + rng.next() * (maxY - minY)];
    if (pointInMultiPolygon(p, shape) && !pointInMultiPolygon(p, noGo)) return p;
  }
  return null;
}

const farFromCities = (p: Point) => cities.every((c) => distance(c.pos, p) >= MIN_CITY_SPACING);

for (let c = 0; c < countryCount; c++) {
  const shape = shapes[c]!;
  if (shape.length === 0) continue;
  const name = makeName(COUNTRY_END, 0.35);
  countries.push({ id: slug(name), name, capital: '', shape });
}

for (const country of countries) {
  const shape = country.shape as MultiPolygon;
  const area = multiPolygonArea(shape);
  const target = Math.max(3, Math.min(7, Math.round(area / AREA_PER_CITY)));
  const mine: CityDef[] = [];

  const addCity = (pos: Point, capital: boolean) => {
    const name = makeName(CITY_END, 0.3);
    const population = capital
      ? 1.8 + rng.next() * 1.2
      : 0.3 + 1.9 * rng.next() ** 1.6;
    const city: CityDef = {
      id: slug(name),
      name,
      country: country.id,
      pos: [round1(pos[0]), round1(pos[1])],
      population: Math.round(population * 100) / 100,
      income: Math.round(population * 120 * (0.8 + rng.next() * 0.4)),
      port: false,
    };
    cities.push(city);
    mine.push(city);
  };

  // capitale: il punto più lontano dai confini tra molti candidati
  let capitalPos: Point | null = null;
  let capitalD = -1;
  for (let k = 0; k < 250; k++) {
    const p = samplePoint(shape);
    if (!p) continue;
    const d = distanceToBoundary(p, shape) * (0.7 + rng.next() * 0.3);
    if (d > capitalD && farFromCities(p)) {
      capitalD = d;
      capitalPos = p;
    }
  }
  if (!capitalPos) throw new Error(`${country.name}: impossibile piazzare la capitale`);
  addCity(capitalPos, true);
  country.capital = mine[0]!.id;

  // un porto, se il paese tocca il mare
  for (let k = 0; k < 400; k++) {
    const p = samplePoint(shape);
    if (!p || !farFromCities(p) || distanceToBoundary(p, shape) < 5) continue;
    if (hasSeaNearby(draftMap, p, PORT_RADIUS * 0.8)) {
      addCity(p, false);
      break;
    }
  }

  // le altre città
  for (let k = 0; k < 3000 && mine.length < target; k++) {
    const p = samplePoint(shape);
    if (p && farFromCities(p) && distanceToBoundary(p, shape) >= 12) addCity(p, false);
  }
}

for (const city of cities) city.port = hasSeaNearby(draftMap, city.pos, PORT_RADIUS);

// ---------------------------------------------------------------- 9. verifica e scrittura
const map = MapDef.parse({
  $schema: '../schema/map.schema.json',
  id: slug(fileName) || 'prova',
  name: 'Mappa di prova',
  description: `Mappa inventata generata con il seme "${seedText}".`,
  width: W,
  height: H,
  rangeScale: RANGE_SCALE,
  countries,
  cities,
  noGo: roundMPoly(noGo),
  shortcuts: [],
});

const errors = checkMap(map, {
  portMaxSeaDistance: rules.defaults.movement.portMaxSeaDistance,
  minCityDistance: 4,
});
if (errors.length > 0) {
  console.error('La mappa generata non supera i controlli:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

/** JSON leggibile: ogni poligono su una riga, il resto indentato. */
function formatMap(m: MapDef): string {
  const raw = new Map<string, string>();
  const token = (v: unknown) => {
    const key = `__RAW_${raw.size}__`;
    raw.set(key, JSON.stringify(v));
    return key;
  };
  const obj = {
    ...m,
    countries: m.countries.map((c) => ({ ...c, shape: c.shape.map(token) })),
    cities: m.cities.map((c) => ({ ...c, pos: token(c.pos) })),
    noGo: m.noGo.map(token),
  };
  let text = JSON.stringify(obj, null, 2);
  for (const [key, value] of raw) text = text.replace(`"${key}"`, value);
  return text + '\n';
}

const outPath = join(dataDir, 'maps', `${fileName}.json`);
writeFileSync(outPath, formatMap(map));
const ports = map.cities.filter((c) => c.port).length;
console.log(
  `scritto data/maps/${fileName}.json: ${map.countries.length} paesi, ${map.cities.length} città (${ports} porti), ${map.noGo.length} catene montuose`,
);
