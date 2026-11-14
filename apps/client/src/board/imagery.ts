/**
 * Immagini della Terra sotto il tabellone. Le foto (equirettangolari, NASA) si riproiettano
 * nella proiezione di Miller del tabellone: la longitudine resta lineare, quindi basta
 * ricampionare riga per riga la latitudine e spostare il taglio dell'antimeridiano.
 */
import type { BoardDef, BoardProjection } from '@onpeace/engine';

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

/** Funzioni della proiezione di Miller del tabellone: da gradi a unità mappa e ritorno. */
export function millerFrame(p: BoardProjection, width: number) {
  const scale = 1 / p.kmPerUnit;
  const yKm = (lat: number) => EARTH_RADIUS_KM * 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD));
  const yTop = yKm(p.latMax);
  const cut = p.centralMeridian - 180;
  return {
    /** Latitudine → y mappa. */
    y: (lat: number) => (yTop - yKm(lat)) * scale,
    /** y mappa → latitudine. */
    lat: (y: number) => (Math.atan(Math.exp((yTop - y / scale) / (EARTH_RADIUS_KM * 1.25))) - Math.PI / 4) / (0.4 * RAD),
    /** Longitudine → x mappa (il tabellone comincia dal meridiano opposto a quello centrale). */
    x: (lon: number) => (((((lon - cut) % 360) + 360) % 360) / 360) * width,
    cut,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`immagine non caricata: ${url}`));
    img.src = url;
  });
}

/** Riproietta un'immagine equirettangolare (tutto il globo) nel riquadro del tabellone. */
function reproject(img: HTMLImageElement, board: BoardDef, outWidth: number): HTMLCanvasElement {
  const proj = board.projection!;
  const frame = millerFrame(proj, board.width);
  const s = outWidth / board.width;
  const out = document.createElement('canvas');
  out.width = outWidth;
  out.height = Math.round(board.height * s);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  // colonna della foto dove comincia il tabellone (longitudine del taglio, riportata tra -180 e 180:
  // con un meridiano centrale negativo, per esempio un tabellone delle Americhe, sarebbe fuori dalla foto)
  const sx0 = (((((frame.cut + 180) % 360) + 360) % 360) / 360) * sw;
  const split = (sw - sx0) * (outWidth / sw);
  for (let oy = 0; oy < out.height; oy++) {
    const lat = frame.lat((oy + 0.5) / s);
    const sy = Math.min(sh - 1, Math.max(0, ((90 - lat) / 180) * sh));
    ctx.drawImage(img, sx0, sy, sw - sx0, 1, 0, oy, split, 1);
    ctx.drawImage(img, 0, sy, sx0, 1, split, oy, outWidth - split, 1);
  }
  return out;
}

/**
 * Terreno in scala di grigi dalla foto di giorno: montagne, deserti e foreste, da usare
 * come trama sotto i colori (moltiplicato o in sovrapposizione, a seconda dello stile).
 */
export async function loadRelief(board: BoardDef, outWidth = 4096): Promise<HTMLCanvasElement | null> {
  if (!board.projection) return null;
  const day = await loadImage('/terra/giorno.jpg');
  const dayP = reproject(day, board, outWidth);
  const out = document.createElement('canvas');
  out.width = dayP.width;
  out.height = dayP.height;
  const ctx = out.getContext('2d')!;
  ctx.filter = 'grayscale(1) contrast(1.25) brightness(1.15)';
  ctx.drawImage(dayP, 0, 0);
  ctx.filter = 'none';
  return out;
}
