import {
  bounds,
  distance,
  distanceToBoundary,
  largestPolygon,
  pointInMultiPolygon,
  type MultiPolygon,
  type Point,
} from '@onpeace/engine';

/**
 * Punto dove scrivere il nome di un paese: lontano dai bordi e dai punti da evitare
 * (città e relative etichette delle pile), cercato su una griglia.
 */
export function labelPoint(shape: MultiPolygon, avoid: readonly Point[] = []): Point {
  const main = largestPolygon(shape);
  const target: MultiPolygon = main ? [main] : shape;
  const [minX, minY, maxX, maxY] = bounds(target);
  let best: Point = [(minX + maxX) / 2, (minY + maxY) / 2];
  let bestScore = -Infinity;
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p: Point = [minX + ((maxX - minX) * i) / steps, minY + ((maxY - minY) * j) / steps];
      if (!pointInMultiPolygon(p, target)) continue;
      const edge = distanceToBoundary(p, target);
      const clear = avoid.reduce((m, a) => Math.min(m, distance(p, a)), Infinity);
      const score = Math.min(edge, clear * 0.9);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return best;
}
