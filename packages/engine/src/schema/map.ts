import { z } from 'zod';
import { Id } from './rules';

export const PointS = z.tuple([z.number(), z.number()]);
export const RingS = z.array(PointS).min(3);
/** Primo anello = contorno esterno, gli altri = buchi (laghi). */
export const PolygonS = z.array(RingS).min(1);
export const MultiPolygonS = z.array(PolygonS);

export const CountryDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** Id della città capitale (deve appartenere al paese). */
  capital: Id,
  shape: MultiPolygonS.min(1),
});
export type CountryDef = z.infer<typeof CountryDef>;

export const CityDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  country: Id,
  pos: PointS,
  /** Popolazione in milioni: determina rinforzi e pesa sul reddito. */
  population: z.number().positive(),
  /** Reddito nominale per turno (al 100%). */
  income: z.number().int().min(0),
  /** Le unità navali si comprano solo nei porti. */
  port: z.boolean(),
});
export type CityDef = z.infer<typeof CityDef>;

/** Breve passaggio attraversabile: stretto per truppe di terra o istmo/canale per navi. */
export const ShortcutDef = z.strictObject({
  id: Id,
  from: PointS,
  to: PointS,
  for: z.enum(['land', 'naval']),
});

export const MapDef = z.strictObject({
  $schema: z.string().optional(),
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Unità mappa che corrispondono a 1 punto di raggio (movimento/vista). */
  rangeScale: z.number().positive(),
  countries: z.array(CountryDef).min(2),
  cities: z.array(CityDef).min(2),
  /** Zone invalicabili: solo gli aerei le attraversano, senza fermarsi. */
  noGo: MultiPolygonS.default([]),
  shortcuts: z.array(ShortcutDef).default([]),
});
export type MapDef = z.infer<typeof MapDef>;
