/**
 * Pittura del tabellone in Canvas 2D, stile sala operativa: base satellitare notturna,
 * griglia di latitudine e longitudine, zone di controllo dei giocatori (velatura, tratteggio
 * e bordo luminoso nel loro colore), segnalini tattici con le armate, frecce d'attacco.
 *
 * Due strati: `paintStatic` (base, griglia, zone, confini, rotte: cambia con la vista o i
 * padroni) e `paintOverlay` (selezione, frecce, segnalini e nomi: a ogni fotogramma).
 */
import type { BoardGeometry, Box } from './geometry';
import { millerFrame } from './imagery';

/** Vista: punto schermo = punto mappa × scale + (x, y), in pixel CSS. */
export interface BoardView {
  scale: number;
  x: number;
  y: number;
}

export interface BoardState {
  /** Colore del padrone di ogni territorio (#rrggbb). */
  owners: Map<string, string>;
  armies: Map<string, number>;
  hover: string | null;
  selected: string | null;
}

export const BOARD_COLORS = {
  table: '#04080b',
  ocean: '#050c12',
  grid: '140, 200, 220',
  line: '214, 230, 236',
  ink: '#e6eef2',
  inkDim: '#8fa5b0',
  plate: 'rgba(5, 10, 14, 0.9)',
  neutral: '#6f7c84',
};

export const BOARD_FONT = '"IBM Plex Sans Condensed", system-ui, sans-serif';
export const BOARD_MONO = '"IBM Plex Mono", ui-monospace, monospace';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function rgba(hex: string, a: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Quanto è ingrandita la vista rispetto alla vista d'insieme. */
export function zoomLevel(view: BoardView, fitScale: number): number {
  return view.scale / fitScale;
}

/** Tratteggio diagonale nel colore dato, in pixel del dispositivo (cache per colore). */
const hatches = new Map<string, HTMLCanvasElement>();
function hatchTile(color: string, dpr: number): HTMLCanvasElement {
  const k = `${color}@${dpr}`;
  let tile = hatches.get(k);
  if (tile) return tile;
  const size = Math.round(7 * dpr);
  tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const g = tile.getContext('2d')!;
  g.strokeStyle = color;
  g.lineWidth = 1 * dpr;
  g.beginPath();
  // diagonale che continua da una piastrella all'altra
  g.moveTo(-1, size + 1);
  g.lineTo(size + 1, -1);
  g.moveTo(-1 - size, size + 1);
  g.lineTo(1, -1);
  g.moveTo(size - 1, 2 * size + 1);
  g.lineTo(2 * size + 1, size - 1);
  g.stroke();
  hatches.set(k, tile);
  return tile;
}

/**
 * Strato fisso: base satellitare, griglia, zone di controllo, confini e rotte.
 * `ctx` è grande quanto lo schermo (in pixel del dispositivo).
 */
export function paintStatic(
  ctx: CanvasRenderingContext2D,
  geo: BoardGeometry,
  view: BoardView,
  state: BoardState,
  dpr: number,
  fitScale: number,
  earth: HTMLCanvasElement | null,
) {
  const { width: W, height: H } = geo;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const z = zoomLevel(view, fitScale);
  const px = 1 / view.scale; // un pixel CSS in unità mappa
  const toMap = () => ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
  const toScreen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BOARD_COLORS.table;
  ctx.fillRect(0, 0, cw, ch);

  // base satellitare
  toMap();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.fillStyle = BOARD_COLORS.ocean;
  ctx.fillRect(0, 0, W, H);
  if (earth) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(earth, 0, 0, W, H);
  }
  // le terre fuori gioco (Antartide tagliata, isolette) restano più spente dei territori
  ctx.fillStyle = 'rgba(2, 6, 9, 0.35)';
  ctx.fillRect(0, 0, W, H);

  // griglia ogni 15 gradi; equatore e meridiano di Greenwich più marcati
  const proj = geo.board.projection;
  if (proj) {
    const f = millerFrame(proj, W);
    ctx.lineWidth = px;
    for (let lon = -180; lon < 180; lon += 15) {
      const x = f.x(lon);
      ctx.strokeStyle = `rgba(${BOARD_COLORS.grid}, ${lon === 0 ? 0.2 : 0.09})`;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let lat = -45; lat <= 75; lat += 15) {
      const y = f.y(lat);
      ctx.strokeStyle = `rgba(${BOARD_COLORS.grid}, ${lat === 0 ? 0.2 : 0.09})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  // nomi dei continenti nel mare, con il bonus
  for (const c of geo.board.continents) {
    if (!c.label) continue;
    const [x, y] = c.label;
    const size = 92;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${size}px ${BOARD_FONT}`;
    ctx.letterSpacing = `${size * 0.42}px`;
    ctx.fillStyle = `rgba(${BOARD_COLORS.line}, 0.2)`;
    ctx.fillText(c.name.toUpperCase(), x + size * 0.21, y);
    ctx.font = `500 ${size * 0.5}px ${BOARD_MONO}`;
    ctx.letterSpacing = `${size * 0.1}px`;
    ctx.fillStyle = `rgba(${BOARD_COLORS.grid}, 0.5)`;
    ctx.fillText(`BONUS +${c.bonus}`, x, y + size * 1.05);
    ctx.letterSpacing = '0px';
  }

  // zone di controllo: velatura, tratteggio e bordo luminoso interno nel colore del padrone
  for (const t of geo.board.territories) {
    const path = geo.paths.get(t.id)!;
    const color = state.owners.get(t.id) ?? BOARD_COLORS.neutral;
    ctx.fillStyle = rgba(color, 0.24);
    ctx.fill(path, 'evenodd');
    ctx.save();
    ctx.clip(path, 'evenodd');
    toScreen();
    ctx.fillStyle = ctx.createPattern(hatchTile(rgba(color, 0.2), dpr), 'repeat')!;
    ctx.fillRect(0, 0, cw / dpr, ch / dpr);
    toMap();
    ctx.shadowColor = rgba(color, 0.9);
    ctx.shadowBlur = clamp(9 * Math.sqrt(z), 7, 18) * dpr;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6 * px;
    ctx.strokeStyle = rgba(color, 0.95);
    ctx.stroke(path);
    ctx.restore();
  }

  // confini: sottili tra territori dello stesso padrone, netti dove c'è un fronte
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const b of geo.borders) {
    const front = state.owners.get(b.a) !== state.owners.get(b.b);
    if (front) {
      ctx.lineWidth = 1.6 * px;
      ctx.strokeStyle = 'rgba(2, 5, 8, 0.85)';
      ctx.stroke(b.path);
    } else {
      ctx.save();
      ctx.setLineDash([3 * px, 3 * px]);
      ctx.lineWidth = 0.9 * px;
      ctx.strokeStyle = `rgba(${BOARD_COLORS.line}, ${b.frontier ? 0.55 : 0.35})`;
      ctx.stroke(b.path);
      ctx.restore();
    }
  }
  ctx.restore();

  // rotte via mare: tratteggio luminoso con un rombo a ogni approdo
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  for (const route of geo.routes) {
    const path = new Path2D();
    for (const c of route.curves) {
      path.moveTo(c.from[0], c.from[1]);
      path.quadraticCurveTo(c.ctrl[0], c.ctrl[1], c.to[0], c.to[1]);
    }
    ctx.setLineDash([6 * px, 4 * px]);
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = 'rgba(2, 6, 9, 0.6)';
    ctx.stroke(path);
    ctx.lineWidth = 1.3 * px;
    ctx.strokeStyle = `rgba(${BOARD_COLORS.grid}, 0.85)`;
    ctx.stroke(path);
    ctx.setLineDash([]);
    for (const [x, y] of route.ends) {
      const r = 3.2 * px;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fillStyle = `rgba(${BOARD_COLORS.grid}, 0.95)`;
      ctx.fill();
      ctx.lineWidth = px;
      ctx.strokeStyle = 'rgba(2, 6, 9, 0.8)';
      ctx.stroke();
    }
  }
  ctx.restore();

  // cornice: filo sottile, angolari e coordinate sui bordi
  toScreen();
  const x0 = view.x;
  const y0 = view.y;
  const x1 = view.x + W * view.scale;
  const y1 = view.y + H * view.scale;
  ctx.strokeStyle = `rgba(${BOARD_COLORS.grid}, 0.35)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
  const arm = 22;
  ctx.strokeStyle = `rgba(${BOARD_COLORS.grid}, 0.9)`;
  ctx.lineWidth = 2;
  for (const [cx, cy, sx, sy] of [
    [x0 - 5, y0 - 5, 1, 1],
    [x1 + 5, y0 - 5, -1, 1],
    [x0 - 5, y1 + 5, 1, -1],
    [x1 + 5, y1 + 5, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * arm);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * arm, cy);
    ctx.stroke();
  }
  if (proj) {
    const f = millerFrame(proj, W);
    ctx.font = `500 10px ${BOARD_MONO}`;
    ctx.fillStyle = `rgba(${BOARD_COLORS.grid}, 0.6)`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    for (let lon = -180; lon < 180; lon += 30) {
      const x = view.x + f.x(lon) * view.scale;
      if (x < x0 + 20 || x > x1 - 20) continue;
      ctx.fillText(lon === 0 ? '0°' : `${Math.abs(lon)}°${lon < 0 ? 'O' : 'E'}`, x, y0 - 8);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let lat = -45; lat <= 75; lat += 15) {
      const y = view.y + f.y(lat) * view.scale;
      ctx.fillText(lat === 0 ? '0°' : `${Math.abs(lat)}°${lat < 0 ? 'S' : 'N'}`, x0 - 8, y);
    }
  }
}

/** Rettangoli occupati a schermo, per non sovrapporre nomi e segnalini. */
type Rect = [number, number, number, number];
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Freccia curva da `a` a `b` (pixel CSS), accorciata ai due capi. */
function arrow(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, enemy: boolean, trim: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < trim * 2.5) return;
  const ux = dx / len;
  const uy = dy / len;
  const from: [number, number] = [a[0] + ux * trim, a[1] + uy * trim];
  const to: [number, number] = [b[0] - ux * trim, b[1] - uy * trim];
  const bendK = 0.18 * (len - 2 * trim);
  const ctrl: [number, number] = [(from[0] + to[0]) / 2 - uy * bendK, (from[1] + to[1]) / 2 + ux * bendK];
  // direzione d'arrivo, dalla tangente finale della curva
  const tx = to[0] - ctrl[0];
  const ty = to[1] - ctrl[1];
  const tl = Math.hypot(tx, ty);
  const hx = tx / tl;
  const hy = ty / tl;
  const head = enemy ? 11 : 8;
  const base: [number, number] = [to[0] - hx * head, to[1] - hy * head];
  const body = new Path2D();
  body.moveTo(from[0], from[1]);
  body.quadraticCurveTo(ctrl[0], ctrl[1], base[0], base[1]);
  ctx.save();
  ctx.lineCap = 'round';
  if (!enemy) ctx.setLineDash([5, 4]);
  ctx.lineWidth = enemy ? 6 : 4;
  ctx.strokeStyle = 'rgba(2, 5, 8, 0.75)';
  ctx.stroke(body);
  ctx.lineWidth = enemy ? 3 : 1.6;
  ctx.strokeStyle = enemy ? color : 'rgba(230, 238, 242, 0.85)';
  if (enemy) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
  }
  ctx.stroke(body);
  ctx.setLineDash([]);
  const tip = new Path2D();
  tip.moveTo(to[0], to[1]);
  tip.lineTo(base[0] - hy * head * 0.6, base[1] + hx * head * 0.6);
  tip.lineTo(base[0] + hy * head * 0.6, base[1] - hx * head * 0.6);
  tip.closePath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(2, 5, 8, 0.75)';
  ctx.stroke(tip);
  ctx.fillStyle = enemy ? color : 'rgba(230, 238, 242, 0.9)';
  ctx.fill(tip);
  ctx.restore();
}

/**
 * Strato mobile: territorio sotto il mouse, selezione con le frecce verso i confinanti,
 * segnalini con le armate e nomi dove c'è spazio. Disegna sopra quello che c'è già.
 */
export function paintOverlay(
  ctx: CanvasRenderingContext2D,
  geo: BoardGeometry,
  view: BoardView,
  state: BoardState,
  dpr: number,
  fitScale: number,
) {
  const z = zoomLevel(view, fitScale);
  const px = 1 / view.scale;
  const sw = ctx.canvas.width / dpr;
  const sh = ctx.canvas.height / dpr;
  const toMap = () => ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
  const screen = (p: readonly [number, number]): [number, number] => [p[0] * view.scale + view.x, p[1] * view.scale + view.y];
  const colorOf = (id: string) => state.owners.get(id) ?? BOARD_COLORS.neutral;

  // evidenziazioni in coordinate mappa
  toMap();
  const outline = (id: string, width: number, alpha: number, dash: number[] = []) => {
    ctx.save();
    ctx.setLineDash(dash.map((d) => d * px));
    ctx.lineJoin = 'round';
    ctx.lineWidth = width * px;
    ctx.strokeStyle = `rgba(240, 246, 248, ${alpha})`;
    ctx.stroke(geo.paths.get(id)!);
    ctx.restore();
  };
  const tint = (id: string, a: number) => {
    ctx.fillStyle = rgba(colorOf(id), a);
    ctx.fill(geo.paths.get(id)!, 'evenodd');
  };
  if (state.selected) {
    for (const n of geo.neighbours.get(state.selected) ?? []) outline(n, 1.2, 0.7, [4, 3]);
    tint(state.selected, 0.22);
    ctx.save();
    ctx.shadowColor = 'rgba(240, 246, 248, 0.9)';
    ctx.shadowBlur = 10 * dpr;
    outline(state.selected, 1.8, 0.95);
    ctx.restore();
  }
  if (state.hover && state.hover !== state.selected) {
    tint(state.hover, 0.14);
    outline(state.hover, 1.2, 0.8);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const plateH = clamp(17 + (z - 1) * 1.5, 17, 23);

  // frecce dal territorio selezionato: piene verso i nemici, tratteggiate verso i propri
  if (state.selected) {
    const t = geo.board.territories.find((x) => x.id === state.selected)!;
    const a = screen(t.anchor);
    const mine = colorOf(t.id);
    for (const n of geo.neighbours.get(t.id) ?? []) {
      const other = geo.board.territories.find((x) => x.id === n)!;
      const b = screen(other.anchor);
      if (Math.abs(b[0] - a[0]) > (geo.width * view.scale) / 2) continue; // rotta che fa il giro del mondo
      arrow(ctx, a, b, mine, colorOf(n) !== mine, plateH * 0.9);
    }
  }

  // segnalini tattici
  const taken: Rect[] = [];
  const visible = geo.board.territories.filter((t) => {
    const [x, y] = screen(t.anchor);
    return x > -60 && y > -40 && x < sw + 60 && y < sh + 40;
  });
  ctx.font = `600 ${plateH * 0.68}px ${BOARD_MONO}`;
  for (const t of visible) {
    const [x, y] = screen(t.anchor);
    const label = String(state.armies.get(t.id) ?? 0);
    const tw = ctx.measureText(label).width;
    const sym = plateH * 1.25; // riquadro del simbolo
    const w = sym + tw + plateH * 0.55;
    const left = x - w / 2;
    const top = y - plateH / 2;
    taken.push([left - 2, top - 2, left + w + 2, top + plateH + 2]);
    paintPlate(ctx, left, top, w, plateH, sym, colorOf(t.id), label, t.id === state.selected || t.id === state.hover);
  }

  // nomi: prima i territori grandi; solo dove il nome sta nel territorio o la vista è vicina
  const fontSize = clamp(10 + (z - 1) * 0.9, 10, 13.5);
  ctx.font = `600 ${fontSize}px ${BOARD_FONT}`;
  ctx.letterSpacing = `${fontSize * 0.12}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
  const byArea = [...visible].sort((a, b) => area(geo.boxes.get(b.id)!) - area(geo.boxes.get(a.id)!));
  for (const t of byArea) {
    const [x, y] = screen(t.anchor);
    const name = t.name.toUpperCase();
    const box = geo.boxes.get(t.id)!;
    const boxW = (box[2] - box[0]) * view.scale;
    const tw = ctx.measureText(name).width;
    const force = t.id === state.selected || t.id === state.hover;
    if (!force && tw > boxW * 0.95 && z < 2.6) continue;
    const ty = y + plateH / 2 + 4;
    const rect: Rect = [x - tw / 2 - 3, ty - 1, x + tw / 2 + 3, ty + fontSize + 2];
    if (!force && taken.some((o) => overlaps(o, rect))) continue;
    taken.push(rect);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2, 6, 9, 0.85)';
    ctx.strokeText(name, x, ty);
    ctx.fillStyle = force ? '#ffffff' : BOARD_COLORS.ink;
    ctx.fillText(name, x, ty);
  }
  ctx.letterSpacing = '0px';
}

/**
 * Segnalino tattico: a sinistra il simbolo della fanteria (riquadro con la croce di
 * Sant'Andrea, come nelle carte militari) nel colore del giocatore, a destra le armate.
 */
function paintPlate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sym: number,
  color: string,
  label: string,
  active: boolean,
) {
  ctx.save();
  ctx.shadowColor = active ? rgba(color, 0.9) : 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = active ? 12 : 6;
  ctx.shadowOffsetY = active ? 0 : 1.5;
  ctx.fillStyle = BOARD_COLORS.plate;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // simbolo
  const pad = 2.5;
  const sx = x + pad;
  const sy = y + pad;
  const sw = sym - pad * 2;
  const sh = h - pad * 2;
  ctx.fillStyle = color;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = 'rgba(2, 6, 9, 0.9)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy + 2);
  ctx.lineTo(sx + sw - 2, sy + sh - 2);
  ctx.moveTo(sx + sw - 2, sy + 2);
  ctx.lineTo(sx + 2, sy + sh - 2);
  ctx.stroke();
  ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
  // bordo
  ctx.lineWidth = 1;
  ctx.strokeStyle = active ? '#ffffff' : rgba(color, 0.95);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // armate
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f2f6f8';
  ctx.fillText(label, x + sym + (w - sym) / 2 - 0.5, y + h / 2 + 0.5);
}
