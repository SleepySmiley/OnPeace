import type { MapDef } from '@onpeace/engine';

/** Colori della mappa. */
export const MAP_COLORS = {
  sea: '#0f2533',
  seaGrid: '#9fc3d6',
  shallow: '#2f6275',
  border: '#141c1c',
  mountainFill: '#2b2822',
  mountainLine: '#d8cdb4',
  hover: '#e2b04a',
  city: '#efe8d6',
  cityOutline: '#10161c',
  capital: '#e2b04a',
  port: '#8fd0e4',
  label: '#f3ecd6',
  labelShadow: '#0b1118',
} as const;

/** Toni terrosi per i paesi senza padrone, scelti per tinte ben distinte. */
export const COUNTRY_COLORS = [
  '#7c8a5a', // oliva
  '#a8864e', // ocra
  '#4f8a86', // verde acqua
  '#9a5f52', // terracotta
  '#5f8f5c', // verde
  '#5f7896', // ardesia
  '#8a6380', // malva
  '#a89a6a', // sabbia
  '#7fa08a', // salvia
  '#6d5a86', // prugna
  '#a0704a', // ruggine
  '#6a7a4a', // muschio
];

/** Paesi confinanti: condividono almeno un vertice del bordo (entro 0,5 unità). */
export function countryNeighbours(map: MapDef): Map<string, Set<string>> {
  const key = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const owners = new Map<string, Set<string>>();
  for (const country of map.countries) {
    for (const poly of country.shape) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          const k = key(x, y);
          let set = owners.get(k);
          if (!set) owners.set(k, (set = new Set()));
          set.add(country.id);
        }
      }
    }
  }
  const result = new Map(map.countries.map((c) => [c.id, new Set<string>()]));
  for (const set of owners.values()) {
    if (set.size < 2) continue;
    for (const a of set) for (const b of set) if (a !== b) result.get(a)!.add(b);
  }
  return result;
}

/** Colorazione golosa: paesi confinanti non hanno mai lo stesso colore. */
export function assignCountryColors(map: MapDef): Map<string, string> {
  const neighbours = countryNeighbours(map);
  const order = [...map.countries].sort(
    (a, b) => neighbours.get(b.id)!.size - neighbours.get(a.id)!.size,
  );
  const colors = new Map<string, string>();
  const used = new Map<string, number>();
  for (const country of order) {
    const taken = new Set([...neighbours.get(country.id)!].map((n) => colors.get(n)));
    const free = COUNTRY_COLORS.filter((c) => !taken.has(c));
    const pool = free.length > 0 ? free : COUNTRY_COLORS;
    const color = pool.reduce((best, c) => ((used.get(c) ?? 0) < (used.get(best) ?? 0) ? c : best));
    colors.set(country.id, color);
    used.set(color, (used.get(color) ?? 0) + 1);
  }
  return colors;
}
