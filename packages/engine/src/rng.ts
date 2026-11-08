/**
 * Generatore pseudo-casuale deterministico (mulberry32).
 * Ogni turno usa un seme registrato: con lo stesso seme e le stesse azioni
 * il risultato è identico, quindi replay e test sono riproducibili.
 */
export interface Rng {
  /** Numero in [0, 1). */
  next(): number;
  /** Intero in [min, max] (estremi inclusi). */
  int(min: number, max: number): number;
  /** Elemento casuale di un array non vuoto. */
  pick<T>(items: readonly T[]): T;
  /** Stato interno, per salvare e riprendere la sequenza. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() su array vuoto');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    state: () => s,
  };
}

/** Seme a 32 bit da una stringa (es. id partita + numero turno). */
export function seedFromString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
