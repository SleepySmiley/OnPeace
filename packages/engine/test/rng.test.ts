import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from '../src';

describe('rng', () => {
  it('stesso seme, stessa sequenza', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('semi diversi, sequenze diverse', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('int() resta negli estremi e li raggiunge', () => {
    const rng = createRng(seedFromString('dadi'));
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('seedFromString è stabile', () => {
    expect(seedFromString('partita-1:turno-3')).toBe(seedFromString('partita-1:turno-3'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
