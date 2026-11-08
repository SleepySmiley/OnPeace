import {
  bounds,
  distanceToBoundary,
  largestPolygon,
  pointInMultiPolygon,
  type MultiPolygon,
  type Point,
} from '@onpeace/engine';

/**
 * Punto dove scrivere il nome di un paese: il più lontano dai bordi
 * (approssimato su una griglia), così l'etichetta sta ben dentro il paese.
 */
export function labelPoint(shape: MultiPolygon): Point {
  const main = largestPolygon(shape);
  const target: MultiPolygon = main ? [main] : shape;
  const [minX, minY, maxX, maxY] = bounds(target);
  let best: Point = [(minX + maxX) / 2, (minY + maxY) / 2];
  let bestD = -1;
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p: Point = [minX + ((maxX - minX) * i) / steps, minY + ((maxY - minY) * j) / steps];
      if (!pointInMultiPolygon(p, target)) continue;
      const d = distanceToBoundary(p, target);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}
