/**
 * Proiezione cartografica del tabellone: da [longitudine, latitudine] a chilometri sul piano (y verso nord).
 * Miller (cilindrica): per il mondo intero, deforma poco le latitudini medie. Il client la rifà
 * per le immagini della Terra (board/imagery.ts), coi dati che il tabellone porta in `projection`.
 */
import type { LonLat } from './fonti';

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

export type Projection = (p: LonLat) => [number, number];

/** Miller: la longitudine va già portata nell'intervallo voluto (vedi il taglio dell'antimeridiano). */
export function miller(centralMeridian: number): Projection {
  return ([lon, lat]) => [
    EARTH_RADIUS_KM * (lon - centralMeridian) * RAD,
    EARTH_RADIUS_KM * 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD)),
  ];
}
