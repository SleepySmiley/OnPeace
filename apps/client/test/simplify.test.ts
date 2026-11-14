import { describe, expect, it } from 'vitest';
import { simplifyLine, simplifyRing } from '../src/board/simplify';

type P = [number, number];

/** Distanza massima dei punti tolti dalla linea semplificata. */
function maxError(original: P[], simple: P[]): number {
  const seg = (p: P, a: P, b: P) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = dx * dx + dy * dy;
    const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  return Math.max(...original.map((p) => Math.min(...simple.slice(1).map((b, i) => seg(p, simple[i]!, b)))));
}

describe('simplifyLine', () => {
  it('toglie i punti in linea e tiene gli estremi', () => {
    const line: P[] = [
      [0, 0],
      [1, 0.01],
      [2, -0.01],
      [3, 0],
    ];
    expect(simplifyLine(line, 0.1)).toEqual([
      [0, 0],
      [3, 0],
    ]);
  });

  it('non si scosta più della tolleranza', () => {
    const line: P[] = Array.from({ length: 400 }, (_, i) => [i / 4, Math.sin(i / 9) * 6 + Math.sin(i * 1.7) * 0.3]);
    for (const tol of [0.25, 1, 3]) {
      const s = simplifyLine(line, tol);
      expect(s.length).toBeLessThan(line.length);
      expect(s[0]).toEqual(line[0]);
      expect(s.at(-1)).toEqual(line.at(-1));
      expect(maxError(line, s)).toBeLessThanOrEqual(tol + 1e-9);
    }
  });

  it('tolleranza zero: tutto com’era', () => {
    const line: P[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(simplifyLine(line, 0)).toEqual(line);
  });
});

describe('simplifyRing', () => {
  // due territori affiancati che condividono il lato x = 10, frastagliato
  const jag: P[] = Array.from({ length: 41 }, (_, i) => [10 + Math.sin(i * 1.3) * 0.2 + (i % 7 === 0 ? 2 : 0), i * 0.5]);
  const left: P[] = [[0, 0], ...jag, [0, 20]];
  const right: P[] = [[20, 20], ...[...jag].reverse(), [20, 0]];
  /** Vertici dove cambia il vicino: gli angoli dove il lato in comune comincia e finisce. */
  const fixedAt = (ring: P[], points: P[]) => Uint8Array.from(ring, (p) => (points.some((q) => q[0] === p[0] && q[1] === p[1]) ? 1 : 0));
  const ends = [jag[0]!, jag.at(-1)!];

  it('tiene sempre i punti fissi', () => {
    const s = simplifyRing(left, 1, fixedAt(left, ends));
    for (const p of ends) expect(s).toContainEqual(p);
  });

  it('il lato in comune viene uguale da tutte e due le parti', () => {
    const a = simplifyRing(left, 0.5, fixedAt(left, ends));
    const b = simplifyRing(right, 0.5, fixedAt(right, ends));
    const shared = (r: P[]) => r.filter((p) => p[0] > 5 && p[0] < 15).map((p) => `${p[0]},${p[1]}`);
    expect(shared(a).sort()).toEqual(shared(b).sort());
    expect(shared(a).length).toBeLessThan(jag.length);
  });

  it('un anello troppo piccolo resta com’è', () => {
    const tiny: P[] = [
      [0, 0],
      [0.1, 0],
      [0.1, 0.1],
      [0, 0.1],
    ];
    expect(simplifyRing(tiny, 5)).toEqual(tiny);
  });
});
