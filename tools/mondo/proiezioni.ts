/**
 * Proiezioni cartografiche: da [longitudine, latitudine] a chilometri sul piano (y verso nord).
 *  - Miller (cilindrica): per il mondo intero, deforma poco le latitudini medie;
 *  - azimutale equivalente di Lambert: per i continenti, aree e forme corrette vicino al centro.
 */
import type { GeoRing, LonLat } from './fonti';

export const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

export type Projection = (p: LonLat) => [number, number];

/** Miller: la longitudine va già portata nell'intervallo voluto (vedi il taglio dell'antimeridiano). */
export function miller(centralMeridian: number): Projection {
  return ([lon, lat]) => [
    EARTH_RADIUS_KM * (lon - centralMeridian) * RAD,
    EARTH_RADIUS_KM * 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD)),
  ];
}

/** Azimutale equivalente di Lambert centrata in `center`. */
export function laea(center: LonLat): Projection {
  const lon0 = center[0] * RAD;
  const lat0 = center[1] * RAD;
  const sin0 = Math.sin(lat0);
  const cos0 = Math.cos(lat0);
  return ([lon, lat]) => {
    const l = lon * RAD - lon0;
    const f = lat * RAD;
    const cosc = sin0 * Math.sin(f) + cos0 * Math.cos(f) * Math.cos(l);
    const k = Math.sqrt(2 / Math.max(1e-9, 1 + cosc));
    return [
      EARTH_RADIUS_KM * k * Math.cos(f) * Math.sin(l),
      EARTH_RADIUS_KM * k * (cos0 * Math.sin(f) - sin0 * Math.cos(f) * Math.cos(l)),
    ];
  };
}

/** Aggiunge punti ai lati più lunghi di `maxDeg` gradi, così nelle proiezioni non cilindriche si incurvano. */
export function densify(ring: GeoRing, maxDeg: number): GeoRing {
  const out: GeoRing = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    out.push(a);
    const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / maxDeg);
    for (let s = 1; s < steps; s++) out.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
  }
  return out;
}
