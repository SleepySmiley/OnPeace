/** Dati di Natural Earth: versione, file e lettura. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../data-io';

export const NE_VERSION = 'v5.1.2';
export const NE_DIR = join(repoRoot, '.cache', 'natural-earth');
const NE_COUNTRIES = 'ne_50m_admin_0_countries';
/** Stati e province, solo per i paesi grandi (Stati Uniti, Russia, Cina, India, Canada, Brasile, Australia…). */
const NE_ADMIN1 = 'ne_50m_admin_1_states_provinces';
export const NE_FILES = [NE_COUNTRIES, NE_ADMIN1];

/** Coordinate geografiche: [longitudine, latitudine] in gradi. */
export type LonLat = [number, number];
export type GeoRing = LonLat[];
export type GeoPolygon = GeoRing[];
export type GeoMultiPolygon = GeoPolygon[];

export interface NeCountry {
  a3: string;
  /** Codice ISO, quando è diverso da a3. */
  iso3: string;
  name: string;
  shape: GeoMultiPolygon;
}

interface Feature {
  properties: Record<string, unknown>;
  geometry:
    | { type: 'Polygon'; coordinates: GeoPolygon }
    | { type: 'MultiPolygon'; coordinates: GeoMultiPolygon }
    | { type: 'Point'; coordinates: LonLat };
}

function readGeoJson(name: string): Feature[] {
  const path = join(NE_DIR, `${name}.geojson`);
  if (!existsSync(path)) throw new Error(`manca ${path}: lancia prima "npm run mondo:scarica"`);
  return (JSON.parse(readFileSync(path, 'utf8')) as { features: Feature[] }).features;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function loadCountries(): NeCountry[] {
  return readGeoJson(NE_COUNTRIES).map((f) => {
    const p = f.properties;
    const g = f.geometry;
    const raw = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    // arrotondate a ~10 m come le suddivisioni interne, così i confini in comune coincidono
    const shape = raw.map((poly) => poly.map((ring) => ring.map(([x, y]) => [round4(x), round4(y)] as LonLat)));
    return {
      a3: str(p.ADM0_A3),
      iso3: str(p.ISO_A3) === '-99' ? '' : str(p.ISO_A3),
      name: str(p.NAME_IT) || str(p.NAME),
      shape,
    };
  });
}

/** Suddivisioni interne (stati, province) per codice ISO 3166-2, es. "US-CA". */
export function loadAdmin1(): Map<string, GeoMultiPolygon> {
  const out = new Map<string, GeoMultiPolygon>();
  for (const f of readGeoJson(NE_ADMIN1)) {
    const code = str(f.properties.iso_3166_2);
    const g = f.geometry;
    if (!code || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const shape = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    out.set(code, [...(out.get(code) ?? []), ...shape]);
  }
  return out;
}
