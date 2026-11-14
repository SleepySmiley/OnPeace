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
  // colonna della foto dove comincia il tabellone (longitudine del taglio)
  const sx0 = ((frame.cut + 180) / 360) * sw;
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
 * Base satellitare del tabellone: la Terra di notte (luci delle città) con il rilievo della
 * foto di giorno sovrapposto in trasparenza, tutto spento e virato al freddo come su un
 * display da sala operativa.
 */
export async function loadEarthBase(board: BoardDef, outWidth = 4096): Promise<HTMLCanvasElement | null> {
  if (!board.projection) return null;
  const [night, day] = await Promise.all([loadImage('/terra/notte.jpg'), loadImage('/terra/giorno.jpg')]);
  const nightP = reproject(night, board, outWidth);
  const dayP = reproject(day, board, outWidth);
  const out = document.createElement('canvas');
  out.width = nightP.width;
  out.height = nightP.height;
  const ctx = out.getContext('2d')!;
  // foto di giorno quasi in bianco e nero, spenta: si leggono rilievi, deserti, foreste
  ctx.filter = 'grayscale(0.75) brightness(0.62) contrast(1.3)';
  ctx.drawImage(dayP, 0, 0);
  // viraggio freddo da display notturno
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#7fa3b8';
  ctx.fillRect(0, 0, out.width, out.height);
  // luci delle città: dalla foto notturna si tengono solo i punti luminosi
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = 'brightness(1.25) contrast(4.5) saturate(1.3)';
  ctx.drawImage(nightP, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  return out;
}
