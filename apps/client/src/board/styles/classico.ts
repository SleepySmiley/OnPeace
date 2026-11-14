/**
 * Stile "Tavolo classico": il linguaggio dei giochi di conquista da tavolo, disegnato da
 * zero. Continenti in tinte da atlante, mare chiaro con le increspature incise, nomi in
 * maiuscoletto antico, pedine dei giocatori come dischi di plastica impilati.
 */
import {
  clamp,
  dimmed,
  flashLevel,
  luminance,
  noiseTile,
  pendingBadge,
  placeLabels,
  qPoint,
  routePath,
  screenOf,
  selectionArrows,
  shade,
  toMap,
  toScreen,
  visibleTerritories,
  zoomOf,
  type BoardStyle,
  type PaintEnv,
  type Rect,
} from '../common';
import { geometryAt } from '../geometry';

const SERIF = '"IM Fell English SC", Georgia, serif';
const INK = '#2b2219';
/** Tinte dei continenti (nostre, da atlante). */
const CONTINENT: Record<string, string> = {
  nordamerica: '#93ad7e',
  sudamerica: '#d6a65f',
  europa: '#c98468',
  africa: '#86aba6',
  asia: '#b58fa9',
  oceania: '#d4c48e',
};

/** Increspature del mare: piccoli archi sparsi, in unità mappa. */
let waves: HTMLCanvasElement | null = null;
function waveTile(): HTMLCanvasElement {
  if (waves) return waves;
  waves = document.createElement('canvas');
  waves.width = waves.height = 120;
  const g = waves.getContext('2d')!;
  g.strokeStyle = 'rgba(40, 80, 100, 0.55)';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  for (const [x, y] of [
    [18, 26],
    [78, 18],
    [48, 70],
    [100, 92],
    [14, 100],
  ] as const) {
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      g.arc(x + k * 9, y, 4.5, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  }
  return waves;
}

/**
 * Increspature attorno alle coste: quattro bande larghe e trasparenti, la parte più costosa del
 * tabellone da tracciare (centinaia di millisecondi). Si disegnano una volta per livello di zoom
 * su un'immagine in coordinate mappa e poi si riusano.
 */
const ripples = new Map<string, HTMLCanvasElement>();
/** Livelli di zoom delle increspature: 1, 2, 4 o 8 volte la vista d'insieme. */
const BANDS = [1, 2, 4, 8];
const rippleBand = (z: number) => 2 ** clamp(Math.round(Math.log2(Math.max(1, z))), 0, 3);
function rippleImage(env: Pick<PaintEnv, 'geo' | 'fit' | 'dpr'>, band: number): HTMLCanvasElement {
  const { geo, fit, dpr } = env;
  const { width: W, height: H } = geo;
  const k = `${geo.board.id}|${band}|${fit.toFixed(6)}|${dpr}`;
  const done = ripples.get(k);
  if (done) return done;
  // metà della risoluzione dello schermo a quello zoom (sono bande sfumate), al massimo 2,5 milioni di pixel
  const res = Math.min((fit * band * dpr) / 2, Math.sqrt(2.5e6 / (W * H)));
  const img = document.createElement('canvas');
  img.width = Math.ceil(W * res);
  img.height = Math.ceil(H * res);
  const g = img.getContext('2d')!;
  g.setTransform(res, 0, 0, res, 0, 0);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(32, 78, 98, 0.13)';
  // bande larghe e sfumate: bastano contorni precisi a un pixel e mezzo dell'immagine
  const land = geometryAt(geo, res / 3).land;
  for (const w of [46, 32, 20, 10]) {
    g.lineWidth = (w * Math.min(2, Math.sqrt(band))) / (fit * band);
    g.stroke(land);
  }
  if (ripples.size >= BANDS.length) ripples.delete(ripples.keys().next().value!);
  ripples.set(k, img);
  return img;
}

/** Prepara gli altri livelli quando il browser non ha niente da fare, così il primo zoom non si ferma. */
let warming = '';
function warmRipples(env: PaintEnv) {
  const { geo, fit, dpr } = env;
  const k = `${geo.board.id}|${fit.toFixed(6)}|${dpr}`;
  if (warming === k) return;
  warming = k;
  const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 200));
  const next = (i: number) => {
    if (i >= BANDS.length || warming !== k) return;
    idle(() => {
      rippleImage({ geo, fit, dpr }, BANDS[i]!);
      next(i + 1);
    });
  };
  next(0);
}

/**
 * Grana "multiply" rifatta come velo nero normale: moltiplicare per un grigio v con opacità a
 * è lo stesso che coprire di nero con opacità a·(1 − v), ma costa molto meno da disegnare.
 */
const veils = new Map<string, HTMLCanvasElement>();
function grainVeil(tile: HTMLCanvasElement, alpha: number, key: string): HTMLCanvasElement {
  const done = veils.get(key);
  if (done) return done;
  const veil = document.createElement('canvas');
  veil.width = tile.width;
  veil.height = tile.height;
  const src = tile.getContext('2d')!.getImageData(0, 0, tile.width, tile.height);
  const g = veil.getContext('2d')!;
  const out = g.createImageData(tile.width, tile.height);
  for (let i = 0; i < src.data.length; i += 4) out.data[i + 3] = Math.round(255 * alpha * (1 - src.data[i]! / 255));
  g.putImageData(out, 0, 0);
  veils.set(key, veil);
  return veil;
}

/** Panno verde del tavolo con la sua grana: dipende solo dalla misura dello schermo. */
let felt: HTMLCanvasElement | null = null;
function feltImage(cw: number, ch: number, dpr: number): HTMLCanvasElement {
  if (felt && felt.width === cw && felt.height === ch) return felt;
  felt = document.createElement('canvas');
  felt.width = cw;
  felt.height = ch;
  const g = felt.getContext('2d')!;
  const grad = g.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
  grad.addColorStop(0, '#1f4232');
  grad.addColorStop(1, '#0f231a');
  g.fillStyle = grad;
  g.fillRect(0, 0, cw, ch);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalAlpha = 0.12;
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(noiseTile(200, 110, 'panno'), 'repeat')!;
  g.fillRect(0, 0, cw / dpr, ch / dpr);
  return felt;
}

export const classico: BoardStyle = {
  id: 'classico',
  name: 'Tavolo classico',
  tagline: 'Lo stile dei giochi di conquista da tavolo',
  playerColors: ['#2f5fb3', '#c8302c', '#2e8b47', '#e2b72f', '#7b3fa0', '#e07a1f', '#2fa7b5', '#d65a99'],
  fonts: [`400 16px ${SERIF}`],

  paintStatic(env: PaintEnv) {
    const { ctx, geo, view, dpr, assets } = env;
    const { width: W, height: H } = geo;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const px = 1 / view.scale;
    const z = zoomOf(env);

    // panno verde del tavolo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(feltImage(cw, ch, dpr), 0, 0);

    // plancia: bordo color crema con filo scuro
    toMap(env);
    const m = 90;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 26 * dpr;
    ctx.shadowOffsetY = 10 * dpr;
    ctx.fillStyle = '#efe6cf';
    ctx.fillRect(-m, -m, W + 2 * m, H + 2 * m);
    ctx.restore();
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = INK;
    ctx.strokeRect(-m * 0.55, -m * 0.55, W + m * 1.1, H + m * 1.1);
    ctx.lineWidth = px;
    ctx.strokeRect(-m * 0.4, -m * 0.4, W + m * 0.8, H + m * 0.8);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    // mare
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#a9cfd9');
    sea.addColorStop(1, '#93bccb');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
    const wavePattern = ctx.createPattern(waveTile(), 'repeat')!;
    wavePattern.setTransform(new DOMMatrix().scale(2.2));
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = wavePattern;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // increspature attorno alle coste
    ctx.drawImage(rippleImage(env, rippleBand(z)), 0, 0, W, H);
    warmRipples(env);
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#93bccb';
    ctx.fill(geo.land, 'evenodd');

    // territori nella tinta del continente, ognuno appena diverso dal vicino
    const counter = new Map<string, number>();
    for (const t of geo.board.territories) {
      const k = counter.get(t.continent) ?? 0;
      counter.set(t.continent, k + 1);
      const base = CONTINENT[t.continent] ?? '#bbbbbb';
      ctx.fillStyle = shade(base, [0, 0.08, -0.06, 0.14, -0.1][k % 5]!);
      ctx.fill(geo.paths.get(t.id)!, 'evenodd');
    }
    if (assets.relief) {
      ctx.save();
      ctx.clip(geo.land, 'evenodd');
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.28;
      ctx.drawImage(assets.relief, 0, 0, W, H);
      ctx.restore();
    }

    // confini
    ctx.lineCap = 'round';
    for (const b of geo.borders) {
      ctx.lineWidth = (b.frontier ? 2.6 : 1.1) * Math.min(1.7, Math.sqrt(z)) * px;
      ctx.strokeStyle = b.frontier ? INK : 'rgba(43, 34, 25, 0.8)';
      ctx.stroke(b.path);
    }
    ctx.lineWidth = 1.5 * Math.min(1.7, Math.sqrt(z)) * px;
    ctx.strokeStyle = INK;
    ctx.stroke(geo.coast);

    // rotte
    for (const route of geo.routes) {
      ctx.setLineDash([9 * px, 6 * px]);
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = INK;
      ctx.stroke(routePath(route));
      ctx.setLineDash([]);
    }

    // cartigli dei continenti
    for (const c of geo.board.continents) {
      if (!c.label) continue;
      const [x, y] = c.label;
      const size = 108;
      ctx.font = `400 ${size}px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = `${size * 0.08}px`;
      ctx.fillStyle = 'rgba(30, 52, 64, 0.62)';
      ctx.fillText(c.name, x, y);
      ctx.letterSpacing = '0px';
      // bonus in un ovale col colore del continente
      const by = y + size * 0.95;
      ctx.beginPath();
      ctx.ellipse(x, by, size * 0.62, size * 0.34, 0, 0, Math.PI * 2);
      ctx.fillStyle = CONTINENT[c.id] ?? '#cccccc';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = `400 ${size * 0.46}px ${SERIF}`;
      ctx.fillStyle = INK;
      ctx.fillText(`+${c.bonus}`, x, by + size * 0.02);
    }

    // rosa dei venti
    if (geo.board.compass) {
      const [x, y] = geo.board.compass;
      const r = 210;
      ctx.save();
      ctx.translate(x, y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const len = i % 2 === 0 ? r : r * 0.6;
        const w = i % 2 === 0 ? r * 0.16 : r * 0.11;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
          ctx.lineTo(Math.cos(a + (side * Math.PI) / 2) * w, Math.sin(a + (side * Math.PI) / 2) * w);
          ctx.closePath();
          ctx.fillStyle = side < 0 ? INK : '#efe6cf';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.font = `400 ${r * 0.34}px ${SERIF}`;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -r * 1.18);
      ctx.restore();
    }
    ctx.restore();

    // carta stampata: grana leggera su tutta la plancia
    ctx.save();
    ctx.beginPath();
    ctx.rect(-m, -m, W + 2 * m, H + 2 * m);
    ctx.clip();
    toScreen(env);
    ctx.fillStyle = ctx.createPattern(grainVeil(noiseTile(220, 80, 'stampa'), 0.1, 'stampa'), 'repeat')!;
    ctx.fillRect(0, 0, cw / dpr, ch / dpr);
    ctx.restore();
  },

  paintOverlay(env: PaintEnv) {
    const { ctx, geo, view, state } = env;
    const z = zoomOf(env);
    const px = 1 / view.scale;
    const colorOf = (id: string) => state.owners.get(id) ?? '#888888';

    toMap(env);
    // fuori gioco adesso: un velo d'inchiostro
    const dim = dimmed(state, geo.board.territories);
    ctx.fillStyle = 'rgba(43, 34, 25, 0.34)';
    for (const id of dim) ctx.fill(geo.paths.get(id)!, 'evenodd');
    const now = performance.now();
    for (const id of state.flashes?.keys() ?? []) {
      const k = flashLevel(state, id, now);
      if (k <= 0) continue;
      ctx.fillStyle = `rgba(255, 244, 214, ${0.6 * k})`;
      ctx.fill(geo.paths.get(id)!, 'evenodd');
    }
    if (state.selected) {
      for (const n of state.arrows ? state.arrows.to : (geo.neighbours.get(state.selected) ?? [])) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fill(geo.paths.get(n)!, 'evenodd');
      }
      ctx.fillStyle = 'rgba(255, 250, 230, 0.35)';
      ctx.fill(geo.paths.get(state.selected)!, 'evenodd');
      ctx.lineWidth = 3.2 * px;
      ctx.strokeStyle = INK;
      ctx.stroke(geo.paths.get(state.selected)!);
    }
    if (state.target && geo.paths.has(state.target)) {
      ctx.fillStyle = 'rgba(255, 250, 230, 0.3)';
      ctx.fill(geo.paths.get(state.target)!, 'evenodd');
      ctx.setLineDash([7 * px, 4 * px]);
      ctx.lineWidth = 2.6 * px;
      ctx.strokeStyle = INK;
      ctx.stroke(geo.paths.get(state.target)!);
      ctx.setLineDash([]);
    }
    if (state.hover && state.hover !== state.selected) {
      ctx.fillStyle = 'rgba(255, 250, 230, 0.22)';
      ctx.fill(geo.paths.get(state.hover)!, 'evenodd');
    }

    toScreen(env);
    const r = clamp(11 + (z - 1) * 1.5, 11, 17);
    // frecce piene col colore di chi attacca
    const mine = state.selected ? colorOf(state.selected) : INK;
    for (const { enemy, chosen, shape } of selectionArrows(env, r + 4, 0.2)) {
      const head = 15;
      const tEnd = 1 - head / Math.max(1, shape.length);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 20; i++) pts.push(qPoint(shape, (i / 20) * tEnd));
      const body = new Path2D();
      body.moveTo(pts[0]![0], pts[0]![1]);
      for (const p of pts) body.lineTo(p[0], p[1]);
      const [hx, hy] = shape.dir;
      const base = pts[pts.length - 1]!;
      const tip = new Path2D();
      tip.moveTo(shape.to[0], shape.to[1]);
      tip.lineTo(base[0] - hy * 10, base[1] + hx * 10);
      tip.lineTo(base[0] + hy * 10, base[1] - hx * 10);
      tip.closePath();
      ctx.save();
      // scelto il bersaglio, le altre frecce passano in secondo piano
      if (state.target && !chosen) ctx.globalAlpha = 0.38;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = enemy ? (chosen ? 11 : 9) : chosen ? 8 : 6;
      ctx.strokeStyle = INK;
      if (!enemy) ctx.setLineDash([8, 6]);
      ctx.stroke(body);
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
      ctx.stroke(tip);
      ctx.fillStyle = INK;
      ctx.fill(tip);
      if (enemy) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = mine;
        ctx.stroke(body);
        ctx.fillStyle = mine;
        ctx.fill(tip);
      }
      ctx.restore();
    }

    // pedine: dischi di plastica impilati (più armate, pila più alta)
    const taken: Rect[] = [];
    for (const t of state.tokens === false ? [] : visibleTerritories(env)) {
      const [x, y] = screenOf(env, t.anchor);
      const color = colorOf(t.id);
      const armies = state.armies.get(t.id) ?? 0;
      const active = t.id === state.selected || t.id === state.hover;
      const discs = clamp(Math.ceil(armies / 4), 1, 4);
      const th = r * 0.32; // spessore di un disco
      const ry = r * 0.55;
      const lift = active ? 3 : 0;
      const topY = y - (discs - 1) * th * 0.5 - lift;
      taken.push([x - r - 2, topY - ry - 2, x + r + 2, y + (discs - 1) * th * 0.5 + th + ry + 2]);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 3 + lift;
      ctx.beginPath();
      ctx.ellipse(x, y + (discs - 1) * th * 0.5 + th, r, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = shade(color, -0.4);
      ctx.fill();
      ctx.restore();
      for (let i = discs - 1; i >= 0; i--) {
        const cy = topY + i * th;
        // fianco
        ctx.beginPath();
        ctx.ellipse(x, cy + th, r, ry, 0, 0, Math.PI);
        ctx.lineTo(x - r, cy);
        ctx.ellipse(x, cy, r, ry, 0, Math.PI, 0, true);
        ctx.closePath();
        const side = ctx.createLinearGradient(x - r, 0, x + r, 0);
        side.addColorStop(0, shade(color, -0.35));
        side.addColorStop(0.4, shade(color, -0.05));
        side.addColorStop(1, shade(color, -0.45));
        ctx.fillStyle = side;
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.stroke();
        // faccia superiore
        ctx.beginPath();
        ctx.ellipse(x, cy, r, ry, 0, 0, Math.PI * 2);
        const top = ctx.createLinearGradient(x, cy - ry, x, cy + ry);
        top.addColorStop(0, shade(color, 0.22));
        top.addColorStop(1, color);
        ctx.fillStyle = top;
        ctx.fill();
        ctx.stroke();
      }
      ctx.font = `700 ${r * 0.95}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = luminance(color) > 0.4 ? '#1b1510' : '#ffffff';
      ctx.fillText(String(armies), x, topY + 0.5);
      const add = state.pending?.get(t.id);
      if (add) pendingBadge(env, x + r * 0.55, topY - ry - 4, add, { font: '700 11px Georgia, serif', fill: '#efe6cf', ink: INK, edge: INK });
    }

    const fs = clamp(11 + (z - 1) * 1, 11, 15);
    placeLabels(env, taken, {
      font: `400 ${fs}px ${SERIF}`,
      size: fs,
      offsetY: r + 6,
      draw: (text, x, y) => {
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(244, 238, 222, 0.85)';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = INK;
        ctx.fillText(text, x, y);
      },
    });
  },
};
