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
  /** Stella del Generale sulle pile. */
  general: '#f2c14e',
  /** Passaggi di terra (ponti, tunnel, traversate). */
  passage: '#f3ecd6',
} as const;

/**
 * Paesi senza padrone: grigi quasi uguali. Il colore vero spetta solo ai giocatori, così a colpo
 * d'occhio si vede chi possiede cosa; le minime differenze aiutano soltanto a distinguere i
 * confini tra paesi neutrali vicini.
 */
export const NEUTRAL_COLORS = ['#474d52', '#4d5358', '#42484d', '#4a5156'];

/** Opacità del colore del giocatore sopra il grigio dei paesi: lo scurisce appena, per le scritte. */
export const OWNER_FILL_ALPHA = 0.84;

/** Luminanza relativa (WCAG) di un colore #rrggbb. */
function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}

/** Colore leggibile (chiaro o scuro) per testo e simboli sopra lo sfondo dato. */
export function inkOn(background: string): string {
  return luminance(background) > 0.36 ? '#0b1118' : '#ffffff';
}

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

/** Colorazione golosa: paesi confinanti non hanno mai lo stesso grigio (se ce n'è uno libero). */
export function assignCountryColors(map: MapDef, colors: readonly string[] = NEUTRAL_COLORS): Map<string, string> {
  const neighbours = countryNeighbours(map);
  const order = [...map.countries].sort(
    (a, b) => neighbours.get(b.id)!.size - neighbours.get(a.id)!.size,
  );
  const result = new Map<string, string>();
  const used = new Map<string, number>();
  for (const country of order) {
    const taken = new Set([...neighbours.get(country.id)!].map((n) => result.get(n)));
    const free = colors.filter((c) => !taken.has(c));
    const pool = free.length > 0 ? free : colors;
    const color = pool.reduce((best, c) => ((used.get(c) ?? 0) < (used.get(best) ?? 0) ? c : best));
    result.set(country.id, color);
    used.set(color, (used.get(color) ?? 0) + 1);
  }
  return result;
}
