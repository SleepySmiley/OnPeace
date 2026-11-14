/**
 * Generatore casuale della partita: sfc32, 128 bit di stato salvati nella partita (riproducibile).
 * Con un seme da 32 bit chiunque potrebbe provarli tutti partendo dalla distribuzione iniziale,
 * che è pubblica, e ricavare obiettivi segreti, ordine del mazzo e dadi futuri: con 128 bit no.
 * Le partite vere vanno seminate con numeri casuali veri (crypto); un numero solo basta per test e prove.
 */
import type { Rng } from '@onpeace/engine';

export type Seed = [number, number, number, number];

/** Stato completo da un seme: quattro numeri (crypto) presi così come sono, o un numero solo allargato. */
export function expandSeed(seed: number | readonly number[]): Seed {
  if (typeof seed !== 'number') {
    if (seed.length !== 4) throw new Error('il seme deve avere 4 numeri');
    return seed.map((x) => x >>> 0) as Seed;
  }
  // splitmix32: semi vicini (1, 2, 3...) danno stati del tutto diversi
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  return [next(), next(), next(), next()];
}

export interface GameRng extends Omit<Rng, 'state'> {
  state(): Seed;
}

export function createGameRng(seed: Seed): GameRng {
  let [a, b, c, d] = seed;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick(items) {
      if (items.length === 0) throw new Error('pick() su array vuoto');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}
