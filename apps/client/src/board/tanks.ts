/**
 * Carri armati come pedine sul tabellone (al posto dei dischi col numero). Le sagome sono le stesse
 * della scena della battaglia: di lato o viste dall'alto. Quattro modi di mostrare quante armate ci
 * sono, da provare (pagina di prova della battaglia): targa sotto il carro, squadra che cresce con
 * una bandierina, carro dall'alto col numero sulla torretta, numero dipinto sulla fiancata.
 */
import { clamp, luminance, screenOf, shade, zoomOf, type PaintEnv, type Rect } from './common';

export type TankTokens = 'pedine' | 'targa' | 'squadra' | 'alto' | 'scafo';

let mode: TankTokens = 'pedine';
/** Pagina di prova: come sono le pedine (i dischi di oggi o i carri). */
export function setTankTokens(m: TankTokens): void {
  mode = m;
}
export function tankTokens(): TankTokens {
  return mode;
}

/** Come si colora un carro nello stile in uso. */
export interface TankTheme {
  line: string;
  track: string;
  wheel: string;
  /** Alone colorato (vetro) invece dell'ombra (carta). */
  glow: boolean;
  font: string;
  plate: string;
  plateInk: string;
}

// ---------------------------------------------------------------- sagome (stesse coordinate della scena)

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

/** Di lato, rivolto a destra: 56 × 36 unità, centro in (0, 0). */
export const SIDE = {
  track: new Path2D('M-22 4h40a6 6 0 0 1 0 12h-40a6 6 0 0 1 0-12z'),
  wheels: [-18, -9, 0, 9, 17].map((x) => circle(x, 10, 3.6)),
  hull: new Path2D('M-24 4l4-9h38l6 9z'),
  barrel: rr(4, -13.5, 22, 3.6, 1.2),
  brake: rr(23, -14.3, 4, 5.2, 1),
  dome: new Path2D('M-12 -5c1-6 4-10 11-10h6c5 0 8 4 9 10z'),
};

/** Scafo più alto, per scriverci il numero sopra (da y −11 a 6). */
const TALL_HULL = new Path2D('M-26 6l4-17h42l7 17z');

/** Visto dall'alto, rivolto a destra: 44 × 32 unità, torretta in (0, 0). */
export const TOP = {
  tracks: [rr(-19, -15, 36, 8, 2.5), rr(-19, 7, 36, 8, 2.5)],
  hull: rr(-17, -10, 32, 20, 4),
  deck: rr(-14, -7, 10, 14, 2),
  barrel: rr(3, -2, 20, 4, 1.4),
  brake: rr(20, -2.8, 4, 5.6, 1),
  dome: circle(0, 0, 7.5),
};

function shadowOn(ctx: CanvasRenderingContext2D, theme: TankTheme, _color: string, lift: number) {
  // sul vetro i territori sono pieni del colore del padrone: un'ombra scura stacca il carro dal suo territorio
  if (theme.glow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 7 + lift * 2;
    ctx.shadowOffsetY = 2 + lift;
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4 + lift;
    ctx.shadowOffsetY = 2 + lift;
  }
}

/** Carro di lato largo `w` pixel, centrato in (x, y); `flip` lo gira a sinistra; `hull`: altezza in più dello scafo (per il numero). */
export function drawSideTank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, theme: TankTheme, opts: { flip?: boolean; lift?: number; tall?: boolean } = {}) {
  const s = w / 54;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(opts.flip ? -s : s, s);
  ctx.lineWidth = 1.1 / s;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = theme.line;
  // l'ombra solo sotto la sagoma intera: prima un riempimento pieno, poi i pezzi
  ctx.save();
  shadowOn(ctx, theme, color, opts.lift ?? 0);
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
  const hull = opts.tall ? TALL_HULL : SIDE.hull;
  const g = ctx.createLinearGradient(0, -8, 0, 5);
  g.addColorStop(0, shade(color, 0.18));
  g.addColorStop(1, shade(color, -0.12));
  ctx.fillStyle = shade(color, -0.5);
  ctx.save();
  if (opts.tall) ctx.translate(0, -6);
  ctx.fill(SIDE.barrel);
  ctx.stroke(SIDE.barrel);
  ctx.fill(SIDE.brake);
  ctx.stroke(SIDE.brake);
  ctx.fillStyle = g;
  ctx.fill(SIDE.dome);
  ctx.stroke(SIDE.dome);
  ctx.restore();
  ctx.fillStyle = g;
  ctx.fill(hull);
  ctx.stroke(hull);
  ctx.restore();
}

/** Carro visto dall'alto largo `w` pixel, torretta in (x, y), scafo girato di `angle` (radianti). */
export function drawTopTank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, theme: TankTheme, angle: number, lift = 0) {
  const s = w / 44;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);
  ctx.lineWidth = 1.1 / s;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = theme.line;
  ctx.save();
  shadowOn(ctx, theme, color, lift);
  ctx.fillStyle = theme.track;
  for (const t of TOP.tracks) ctx.fill(t);
  ctx.fill(TOP.hull);
  ctx.restore();
  ctx.fillStyle = theme.track;
  for (const t of TOP.tracks) {
    ctx.fill(t);
    ctx.stroke(t);
  }
  ctx.fillStyle = color;
  ctx.fill(TOP.hull);
  ctx.stroke(TOP.hull);
  ctx.fillStyle = shade(color, -0.28);
  ctx.fill(TOP.deck);
  ctx.fillStyle = shade(color, -0.5);
  ctx.fill(TOP.barrel);
  ctx.stroke(TOP.barrel);
  ctx.fill(TOP.brake);
  ctx.stroke(TOP.brake);
  ctx.restore();
}

/** Il numero delle armate, centrato in (x, y). */
function number(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, theme: TankTheme, fill: string) {
  ctx.font = `700 ${size}px ${theme.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y + size * 0.04);
}

/** Targhetta col numero (bordo nel colore del giocatore). */
function plate(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, theme: TankTheme): Rect {
  ctx.font = `700 ${size}px ${theme.font}`;
  const w = Math.max(size * 1.5, ctx.measureText(text).width + size * 0.8);
  const h = size * 1.3;
  const box = new Path2D();
  box.roundRect(x - w / 2, y - h / 2, w, h, theme.glow ? h / 2 : 3);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = theme.plate;
  ctx.fill(box);
  ctx.restore();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = color;
  ctx.stroke(box);
  number(ctx, text, x, y, size, theme, theme.plateInk);
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}

/** Verso dove guarda la pedina: il nemico confinante più vicino (colore diverso), se c'è. */
function facing(env: PaintEnv, id: string, color: string): number {
  const { geo, state } = env;
  const here = geo.board.territories.find((t) => t.id === id)!.anchor;
  let best: number | null = null;
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
      best = Math.atan2(a[1] - here[1], a[0] - here[0]);
    }
  }
  return best ?? 0;
}

/**
 * Una pedina-carro sul territorio `id` (al suo segnaposto), nel modo scelto. `r` è il raggio che avrebbe
 * il disco di oggi a questa distanza. Dà lo spazio occupato, per non scriverci sopra i nomi.
 */
export function drawTankToken(env: PaintEnv, id: string, armies: number, color: string, disc: number, active: boolean, theme: TankTheme): Rect {
  const { ctx } = env;
  // a mappa intera i territori sono vicini (l'Europa!): carri più piccoli, crescono avvicinandosi
  const r = disc * clamp(0.72 + (zoomOf(env) - 1) * 0.3, 0.72, 1.12);
  const t = env.geo.board.territories.find((x) => x.id === id)!;
  const [x, y0] = screenOf(env, t.anchor);
  const lift = active ? 3 : 0;
  const y = y0 - lift;
  const text = String(armies);
  const ink = luminance(color) > 0.45 ? '#16110c' : '#ffffff';
  const angle = facing(env, id, color);
  const flip = Math.cos(angle) < -0.2;
  switch (mode) {
    case 'targa': {
      const w = r * 3.1;
      drawSideTank(ctx, x, y - r * 0.45, w, color, theme, { flip, lift });
      const p = plate(ctx, text, x, y + r * 0.85, clamp(r * 0.95, 11, 16), color, theme);
      return [Math.min(x - w / 2, p[0]) - 2, y - r * 1.5, Math.max(x + w / 2, p[2]) + 2, p[3] + 2];
    }
    case 'squadra': {
      // più armate, più carri: 1-2 → 1, 3-5 → 2, 6-9 → 3, 10+ → 4
      const n = armies >= 10 ? 4 : armies >= 6 ? 3 : armies >= 3 ? 2 : 1;
      const w = r * 2.2;
      const spots: [number, number][] = [
        [0, 0],
        [-w * 0.55, r * 0.7],
        [w * 0.55, r * 0.7],
        [0, r * 1.35],
      ].slice(0, n) as [number, number][];
      const oy = -(spots.at(-1)![1] / 2);
      for (const [dx, dy] of spots) drawSideTank(ctx, x + dx, y + dy + oy, w, color, theme, { flip, lift });
      // bandierina col numero, piantata dietro la squadra
      const fx = x + (flip ? 1 : -1) * w * 0.55;
      const top = y + oy - r * 1.55;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = theme.line;
      ctx.beginPath();
      ctx.moveTo(fx, y + oy - r * 0.1);
      ctx.lineTo(fx, top);
      ctx.stroke();
      const size = clamp(r * 0.95, 11, 15);
      ctx.font = `700 ${size}px ${theme.font}`;
      const fw = Math.max(size * 1.2, ctx.measureText(text).width + size * 0.6);
      const fh = size * 1.25;
      const fl = flip ? fx - fw : fx;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.rect(fl, top, fw, fh);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      number(ctx, text, fl + fw / 2, top + fh / 2, size, theme, ink);
      return [Math.min(x - w * 1.1, fl) - 2, top - 2, Math.max(x + w * 1.1, fl + fw) + 2, y + oy + spots.at(-1)![1] + r * 0.6];
    }
    case 'alto': {
      const w = r * 3.4;
      drawTopTank(ctx, x, y, w, color, theme, angle, lift);
      // la torretta è un disco col numero
      const dome = r * 0.8;
      ctx.save();
      if (!theme.glow) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1.5;
      }
      ctx.beginPath();
      ctx.arc(x, y, dome, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(x, y - dome, x, y + dome);
      g.addColorStop(0, shade(color, 0.22));
      g.addColorStop(1, shade(color, -0.1));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = theme.glow ? 1.5 : 1.2;
      ctx.strokeStyle = theme.line;
      ctx.beginPath();
      ctx.arc(x, y, dome, 0, Math.PI * 2);
      ctx.stroke();
      number(ctx, text, x, y, clamp(r * 0.95, 10, 16), theme, ink);
      return [x - w * 0.55, y - w * 0.55, x + w * 0.55, y + w * 0.55];
    }
    case 'scafo':
    default: {
      const w = r * 3.5;
      drawSideTank(ctx, x, y, w, color, theme, { flip, lift, tall: true });
      const s = w / 54;
      number(ctx, text, x + (flip ? 1.5 : -1.5) * s, y - 2.5 * s, clamp(r * 1.0, 11, 17), theme, ink);
      return [x - w / 2 - 2, y - 26 * s, x + w / 2 + 2, y + 16 * s + 2];
    }
  }
}
