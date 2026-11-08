/** Dati di Natural Earth: versione, file e lettura. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../data-io';

export const NE_VERSION = 'v5.1.2';
export const NE_DIR = join(repoRoot, '.cache', 'natural-earth');
export const NE_COUNTRIES = 'ne_50m_admin_0_countries';
export const NE_PLACES = 'ne_10m_populated_places';
export const NE_FILES = [NE_COUNTRIES, NE_PLACES];

/** Coordinate geografiche: [longitudine, latitudine] in gradi. */
export type LonLat = [number, number];
export type GeoRing = LonLat[];
export type GeoPolygon = GeoRing[];
export type GeoMultiPolygon = GeoPolygon[];

export interface NeCountry {
  a3: string;
  /** Codice ISO, quando è diverso da a3 (le località a volte usano questo). */
  iso3: string;
  name: string;
  /** PIL pro capite in dollari (0 se manca). */
  gdpPerCapita: number;
  label: LonLat;
  shape: GeoMultiPolygon;
}

export interface NePlace {
  name: string;
  nameIt: string;
  a3: string;
  /** Capitale di stato (anche quelle "alternative"). */
  capital: boolean;
  /** Capitale principale secondo Natural Earth. */
  mainCapital: boolean;
  pop: number;
  pos: LonLat;
}

interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon'; coordinates: GeoPolygon } | { type: 'MultiPolygon'; coordinates: GeoMultiPolygon } | { type: 'Point'; coordinates: LonLat };
}

function readGeoJson(name: string): Feature[] {
  const path = join(NE_DIR, `${name}.geojson`);
  if (!existsSync(path)) throw new Error(`manca ${path}: lancia prima "npm run mondo:scarica"`);
  return (JSON.parse(readFileSync(path, 'utf8')) as { features: Feature[] }).features;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function loadCountries(): NeCountry[] {
  return readGeoJson(NE_COUNTRIES).map((f) => {
    const p = f.properties;
    const g = f.geometry;
    const shape = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const pop = num(p.POP_EST);
    return {
      a3: str(p.ADM0_A3),
      iso3: str(p.ISO_A3) === '-99' ? '' : str(p.ISO_A3),
      name: str(p.NAME_IT) || str(p.NAME),
      gdpPerCapita: pop > 0 ? (num(p.GDP_MD) * 1e6) / pop : 0,
      label: [num(p.LABEL_X), num(p.LABEL_Y)],
      shape,
    };
  });
}

/** Tipi di località che non sono città vere e proprie. */
const NOT_CITIES = new Set(['Scientific station', 'Meteorological Station', 'Historic place']);

export function loadPlaces(): NePlace[] {
  const out: NePlace[] = [];
  for (const f of readGeoJson(NE_PLACES)) {
    const p = f.properties;
    if (f.geometry.type !== 'Point' || NOT_CITIES.has(str(p.FEATURECLA))) continue;
    const cls = str(p.FEATURECLA);
    out.push({
      name: str(p.NAME),
      nameIt: str(p.NAME_IT),
      a3: str(p.ADM0_A3),
      capital: num(p.ADM0CAP) === 1 || cls.startsWith('Admin-0 capital'),
      mainCapital: cls === 'Admin-0 capital',
      pop: Math.max(num(p.POP_MAX), num(p.POP_MIN)),
      pos: f.geometry.coordinates,
    });
  }
  return out;
}
