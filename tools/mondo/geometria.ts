/** Geometria 2D per costruire il tabellone. Coordinate in unità del tabellone. */

export type Point = readonly [number, number];
/** Anello chiuso implicitamente (l'ultimo punto non ripete il primo). */
export type Ring = readonly Point[];
/** Primo anello = contorno esterno, gli altri = buchi. */
export type Polygon = readonly Ring[];
export type MultiPolygon = readonly Polygon[];

/** Ray casting: true se il punto è dentro l'anello. */
export function pointInRing(p: Point, ring: Ring): boolean {
  let inside = false;
  const [x, y] = p;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: Point, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(p, outer)) return false;
  return !holes.some((hole) => pointInRing(p, hole));
}

export function pointInMultiPolygon(p: Point, mp: MultiPolygon): boolean {
  return mp.some((polygon) => pointInPolygon(p, polygon));
}

/** Area con segno (shoelace): positiva se antioraria in coordinate y-su. */
export function ringSignedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0] - ring[i]![0]) * (ring[j]![1] + ring[i]![1]);
  }
  return sum / 2;
}

export function polygonArea(polygon: Polygon): number {
  const [outer, ...holes] = polygon;
  if (!outer) return 0;
  return Math.abs(ringSignedArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringSignedArea(h)), 0);
}

export function multiPolygonArea(mp: MultiPolygon): number {
  return mp.reduce((s, p) => s + polygonArea(p), 0);
}

/** Il poligono più grande di un multipoligono. */
export function largestPolygon(mp: MultiPolygon): Polygon | undefined {
  let best: Polygon | undefined;
  let bestArea = -1;
  for (const p of mp) {
    const a = polygonArea(p);
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  return best;
}

/** Distanza minima tra un punto e un segmento. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distanza minima tra un punto e il bordo di un multipoligono. */
export function distanceToBoundary(p: Point, mp: MultiPolygon): number {
  let best = Infinity;
  for (const polygon of mp) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        best = Math.min(best, distanceToSegment(p, ring[j]!, ring[i]!));
      }
    }
  }
  return best;
}

/** Riquadro che contiene il multipoligono: [minX, minY, maxX, maxY]. */
export function bounds(mp: MultiPolygon): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of mp) {
    for (const [x, y] of polygon[0] ?? []) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

// ---------------------------------------------------------------- risultati di polygon-clipping
export type Pt = [number, number];
export type MPoly = Pt[][][];

export const round1 = (v: number) => Math.round(v * 10) / 10;

/** Da risultato di polygon-clipping (anelli chiusi) ad anelli aperti, arrotondati, senza doppioni. */
export function tidy(mp: readonly (readonly (readonly (readonly number[])[])[])[]): MPoly {
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
