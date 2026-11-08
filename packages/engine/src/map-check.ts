import { bounds, distance, pointInMultiPolygon, type MultiPolygon, type Point, type Polygon } from './geometry';
import type { MapDef } from './schema/map';

/**
 * Poligono con i lati divisi in fasce orizzontali: il test punto-in-poligono (pari-dispari su
 * tutti gli anelli, buchi compresi) guarda solo i lati della fascia del punto.
 */
class IndexedPolygon {
  readonly box: [number, number, number, number];
  private readonly bandH: number;
  private readonly bands: number[][];

  constructor(polygon: Polygon) {
    this.box = bounds([polygon]);
    const [, minY, , maxY] = this.box;
    const count = Math.max(1, Math.min(256, Math.ceil(polygon.reduce((n, r) => n + r.length, 0) / 32)));
    this.bandH = Math.max((maxY - minY) / count, 1e-9);
    this.bands = Array.from({ length: count }, () => []);
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j]!;
        const [bx, by] = ring[i]!;
        const b0 = this.band(Math.min(ay, by));
        const b1 = this.band(Math.max(ay, by));
        for (let b = b0; b <= b1; b++) this.bands[b]!.push(ax, ay, bx, by);
      }
    }
  }

  private band(y: number): number {
    return Math.min(this.bands.length - 1, Math.max(0, Math.floor((y - this.box[1]) / this.bandH)));
  }

  contains([x, y]: Point): boolean {
    const [minX, minY, maxX, maxY] = this.box;
    if (x < minX || x > maxX || y < minY || y > maxY) return false;
    const edges = this.bands[this.band(y)]!;
    let inside = false;
    for (let k = 0; k < edges.length; k += 4) {
      const ax = edges[k]!;
      const ay = edges[k + 1]!;
      const bx = edges[k + 2]!;
      const by = edges[k + 3]!;
      if (by > y !== ay > y && x < ((ax - bx) * (y - by)) / (ay - by) + bx) inside = !inside;
    }
    return inside;
  }
}

/** Indice della terraferma: griglia di caselle, ognuna con i poligoni che la toccano. */
interface LandIndex {
  cell: number;
  cols: number;
  buckets: (IndexedPolygon[] | undefined)[];
}

// Le mappe non cambiano dopo la lettura: l'indice si calcola una volta per mappa.
const landIndexes = new WeakMap<MapDef, LandIndex>();

function landIndex(map: MapDef): LandIndex {
  let index = landIndexes.get(map);
  if (index) return index;
  const cell = Math.max(map.width, map.height) / 64;
  const cols = Math.ceil(map.width / cell) + 1;
  const rows = Math.ceil(map.height / cell) + 1;
  const buckets: (IndexedPolygon[] | undefined)[] = new Array(cols * rows);
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.floor(v / cell)));
  for (const country of map.countries) {
    for (const polygon of country.shape as MultiPolygon) {
      const indexed = new IndexedPolygon(polygon);
      const [minX, minY, maxX, maxY] = indexed.box;
      for (let r = clamp(minY, rows - 1); r <= clamp(maxY, rows - 1); r++) {
        for (let c = clamp(minX, cols - 1); c <= clamp(maxX, cols - 1); c++) (buckets[r * cols + c] ??= []).push(indexed);
      }
    }
  }
  index = { cell, cols, buckets };
  landIndexes.set(map, index);
  return index;
}

export interface MapCheckOptions {
  /** Distanza massima dal mare per un porto, in punti raggio. */
  portMaxSeaDistance: number;
  /** Distanza minima tra due città, in punti raggio. */
  minCityDistance?: number;
}

/** true se il punto è in mare, cioè fuori da ogni paese. */
export function isSea(map: MapDef, p: Point): boolean {
  if (p[0] < 0 || p[1] < 0 || p[0] > map.width || p[1] > map.height) return true;
  const index = landIndex(map);
  const bucket = index.buckets[Math.floor(p[1] / index.cell) * index.cols + Math.floor(p[0] / index.cell)];
  return !bucket?.some((polygon) => polygon.contains(p));
}

/** true se c'è mare entro `radius` unità mappa dal punto (campionamento su cerchi). */
export function hasSeaNearby(map: MapDef, p: Point, radius: number): boolean {
  for (const r of [radius / 3, (2 * radius) / 3, radius]) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      if (isSea(map, [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r])) return true;
    }
  }
  return false;
}

/**
 * Controlli di coerenza di una mappa. Restituisce l'elenco degli errori (vuoto = ok).
 * Serve soprattutto quando la mappa viene modificata a mano.
 */
export function checkMap(map: MapDef, options: MapCheckOptions): string[] {
  const errors: string[] = [];
  const countries = new Map(map.countries.map((c) => [c.id, c]));
  if (countries.size !== map.countries.length) errors.push('id di paese duplicati');

  const cityIds = new Set<string>();
  const citiesByCountry = new Map<string, number>();
  for (const city of map.cities) {
    if (cityIds.has(city.id)) errors.push(`città duplicata: ${city.id}`);
    cityIds.add(city.id);
    const country = countries.get(city.country);
    if (!country) {
      errors.push(`${city.id}: paese inesistente "${city.country}"`);
      continue;
    }
    citiesByCountry.set(city.country, (citiesByCountry.get(city.country) ?? 0) + 1);
    if (!pointInMultiPolygon(city.pos, country.shape as MultiPolygon)) {
      errors.push(`${city.id}: la posizione non è dentro il paese ${country.id}`);
    }
    if (pointInMultiPolygon(city.pos, map.noGo as MultiPolygon)) {
      errors.push(`${city.id}: si trova in una zona invalicabile`);
    }
    if (city.port && !hasSeaNearby(map, city.pos, options.portMaxSeaDistance * map.rangeScale)) {
      errors.push(`${city.id}: segnata come porto ma non ha il mare vicino`);
    }
  }

  for (const country of map.countries) {
    const capital = map.cities.find((c) => c.id === country.capital);
    if (!capital) errors.push(`${country.id}: capitale inesistente "${country.capital}"`);
    else if (capital.country !== country.id) {
      errors.push(`${country.id}: la capitale ${capital.id} appartiene a ${capital.country}`);
    }
    if (!citiesByCountry.get(country.id)) errors.push(`${country.id}: nessuna città`);
  }

  if (options.minCityDistance) {
    const min = options.minCityDistance * map.rangeScale;
    for (let i = 0; i < map.cities.length; i++) {
      for (let j = i + 1; j < map.cities.length; j++) {
        const a = map.cities[i]!;
        const b = map.cities[j]!;
        if (distance(a.pos, b.pos) < min) errors.push(`${a.id} e ${b.id} sono troppo vicine`);
      }
    }
  }

  for (const s of map.shortcuts) {
    const ok = [s.from, s.to].every((p) => (s.for === 'land' ? !isSea(map, p) : isSea(map, p)));
    if (!ok) errors.push(`${s.id}: gli estremi devono stare su ${s.for === 'land' ? 'terra' : 'mare'}`);
  }

  return errors;
}
