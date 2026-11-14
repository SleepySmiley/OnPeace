/**
 * Le pedine del tabellone sono carri armati: un carro di lato nel colore del padrone, col numero
 * delle armate dipinto sulla fiancata, girato verso il nemico confinante più vicino. La sagoma è la
 * stessa dei carri della scena della battaglia. A mappa intera i carri sono più piccoli (i territori
 * sono vicini) e crescono avvicinandosi.
 */
import { clamp, luminance, screenOf, shade, zoomOf, type PaintEnv, type Rect } from './common';

/** Come si colora un carro nello stile in uso. */
export interface TankTheme {
  line: string;
  track: string;
  wheel: string;
  /** Territori pieni del colore del padrone (vetro): serve un'ombra più scura per staccare il carro. */
  deepShadow: boolean;
  font: string;
}

// ---------------------------------------------------------------- sagoma (stesse coordinate della scena)

const rr = (x: number, y: number, w: number, h: number, r: number) => {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
};
const circle = (x: number, y: number, r: number) => {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  return p;
};

/** Di lato, rivolto a destra: 56 × 36 unità, centro in (0, 0). Lo scafo è alto, per scriverci il numero (da y −11 a 6). */
const SIDE = {
  track: new Path2D('M-22 4h40a6 6 0 0 1 0 12h-40a6 6 0 0 1 0-12z'),
  wheels: [-18, -9, 0, 9, 17].map((x) => circle(x, 10, 3.6)),
  hull: new Path2D('M-26 6l4-17h42l7 17z'),
  // torretta e cannone sopra lo scafo alto
  barrel: rr(4, -19.5, 22, 3.6, 1.2),
  brake: rr(23, -20.3, 4, 5.2, 1),
  dome: new Path2D('M-12 -11c1-6 4-10 11-10h6c5 0 8 4 9 10z'),
};

function shadowOn(ctx: CanvasRenderingContext2D, theme: TankTheme, lift: number) {
  ctx.shadowColor = theme.deepShadow ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = theme.deepShadow ? 7 + lift * 2 : 4 + lift;
  ctx.shadowOffsetY = 2 + lift;
}

/** Carro di lato largo `w` pixel, centrato in (x, y); `flip` lo gira a sinistra. */
function drawSideTank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, theme: TankTheme, flip: boolean, lift: number) {
  const s = w / 54;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  ctx.lineWidth = 1.1 / s;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = theme.line;
  // l'ombra solo sotto i cingoli: è il carro che poggia sulla mappa
  ctx.save();
  shadowOn(ctx, theme, lift);
  ctx.fillStyle = theme.track;
  ctx.fill(SIDE.track);
  ctx.restore();
  ctx.fillStyle = theme.track;
  ctx.fill(SIDE.track);
  ctx.stroke(SIDE.track);
  ctx.fillStyle = theme.wheel;
  for (const wh of SIDE.wheels) {
    ctx.fill(wh);
    ctx.stroke(wh);
  }
  const g = ctx.createLinearGradient(0, -21, 0, 6);
  g.addColorStop(0, shade(color, 0.2));
  g.addColorStop(1, shade(color, -0.14));
  ctx.fillStyle = shade(color, -0.5);
  ctx.fill(SIDE.barrel);
  ctx.stroke(SIDE.barrel);
  ctx.fill(SIDE.brake);
  ctx.stroke(SIDE.brake);
  ctx.fillStyle = g;
  ctx.fill(SIDE.dome);
  ctx.stroke(SIDE.dome);
  ctx.fill(SIDE.hull);
  ctx.stroke(SIDE.hull);
  ctx.restore();
}

/** Verso dove guarda la pedina: il nemico confinante più vicino (colore diverso), se c'è. */
function facesLeft(env: PaintEnv, id: string, color: string): boolean {
  const { geo, state } = env;
  const here = geo.board.territories.find((t) => t.id === id)!.anchor;
  let dx = 0;
  let bestD = Infinity;
  for (const n of geo.neighbours.get(id) ?? []) {
    const c = state.owners.get(n);
    if (!c || c === color) continue;
    const a = geo.board.territories.find((t) => t.id === n)?.anchor;
    if (!a) continue;
    // i collegamenti che fanno il giro del mondo non contano
    if (Math.abs(a[0] - here[0]) > geo.width / 2) continue;
    const d = Math.hypot(a[0] - here[0], a[1] - here[1]);
    if (d < bestD) {
      bestD = d;
      dx = (a[0] - here[0]) / (d || 1);
    }
  }
  return dx < -0.2;
}

/**
 * La pedina-carro del territorio `id`, al suo segnaposto. `disc` è il raggio che avevano i dischi a
 * questa distanza: il carro si misura su quello. Dà lo spazio occupato, per non scriverci sopra i nomi.
 */
export function drawTankToken(env: PaintEnv, id: string, armies: number, color: string, disc: number, active: boolean, theme: TankTheme): Rect {
  const { ctx } = env;
  // a mappa intera i territori sono vicini (l'Europa!): carri più piccoli, crescono avvicinandosi
  const r = disc * clamp(0.72 + (zoomOf(env) - 1) * 0.3, 0.72, 1.12);
  const t = env.geo.board.territories.find((x) => x.id === id)!;
  const [x, y0] = screenOf(env, t.anchor);
  const lift = active ? 3 : 0;
  const y = y0 - lift;
  const flip = facesLeft(env, id, color);
  const w = r * 3.5;
  const s = w / 54;
  drawSideTank(ctx, x, y, w, color, theme, flip, lift);
  // il numero sulla fiancata, al centro dello scafo
  const size = clamp(r * 1.0, 11, 17);
  ctx.font = `700 ${size}px ${theme.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = luminance(color) > 0.45 ? '#16110c' : '#ffffff';
  ctx.fillText(String(armies), x + (flip ? 1.5 : -1.5) * s, y - 2.5 * s + size * 0.04);
  return [x - w / 2 - 2, y - 22 * s, x + w / 2 + 2, y + 16 * s + 2];
}
