import { distance, pointInMultiPolygon, type MultiPolygon, type Point } from './geometry';
import type { MapDef } from './schema/map';

export interface MapCheckOptions {
  /** Distanza massima dal mare per un porto, in punti raggio. */
  portMaxSeaDistance: number;
  /** Distanza minima tra due città, in punti raggio. */
  minCityDistance?: number;
}

/** true se il punto è in mare, cioè fuori da ogni paese. */
export function isSea(map: MapDef, p: Point): boolean {
  if (p[0] < 0 || p[1] < 0 || p[0] > map.width || p[1] > map.height) return true;
  return !map.countries.some((c) => pointInMultiPolygon(p, c.shape as MultiPolygon));
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
