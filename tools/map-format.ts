import type { MapDef } from '@onpeace/engine';

/** JSON leggibile per le mappe: ogni poligono e ogni posizione su una riga, il resto indentato. */
export function formatMap(m: MapDef): string {
  const raw = new Map<string, string>();
  const token = (v: unknown) => {
    const key = `__RAW_${raw.size}__`;
    raw.set(key, JSON.stringify(v));
    return key;
  };
  const obj = {
    ...m,
    countries: m.countries.map((c) => ({
      ...c,
      ...(c.label ? { label: token(c.label) } : {}),
      shape: c.shape.map(token),
    })),
    cities: m.cities.map((c) => ({ ...c, pos: token(c.pos) })),
    noGo: m.noGo.map(token),
    shortcuts: m.shortcuts.map((s) => ({ ...s, from: token(s.from), to: token(s.to) })),
  };
  let text = JSON.stringify(obj, null, 2);
  for (const [key, value] of raw) text = text.replace(`"${key}"`, value);
  return text + '\n';
}
