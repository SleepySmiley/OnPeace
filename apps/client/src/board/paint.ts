/**
 * Pittura del tabellone in Canvas 2D. Il look è quello di una plancia da collezione:
 * territori in smalto (cloisonné) incassati tra fili di platino, mare in lacca scura
 * con le linee di profondità incise, rotte via mare come puntinature d'argento.
 *
 * Due strati: `paintStatic` (mare, smalto, fili, rotte: cambia solo con la vista o i
 * padroni) e `paintOverlay` (selezione, pedine e nomi: si ridisegna a ogni fotogramma).
 */
import type { BoardGeometry, Box } from './geometry';

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
  table: '#0a1015',
  lacquerTop: '#14303c',
  lacquerBottom: '#0c1c25',
  engraving: '200, 216, 224',
  platinum: '#8e9aa2',
  platinumLight: '#f3f7f9',
  platinumDark: '#1d252b',
  ink: '#eef2f4',
  inkShadow: '#081015',
  /** Smalto dei territori senza padrone, per continente. */
  unowned: {
    nordamerica: '#5d6b74',
    sudamerica: '#66707a',
    europa: '#59676f',
    africa: '#6a7178',
    asia: '#5f6d70',
    oceania: '#646a77',
  } as Record<string, string>,
};

export const BOARD_FONT = '"Archivo", system-ui, sans-serif';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
/** Mescola un colore con il bianco (t > 0) o con il nero (t < 0). */
function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return `rgb(${Math.round(r + (target - r) * k)}, ${Math.round(g + (target - g) * k)}, ${Math.round(b + (target - b) * k)})`;
}
function luminance(hex: string): number {
  const v = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}

/** Quanto è ingrandita la vista rispetto alla vista d'insieme. */
export function zoomLevel(view: BoardView, fitScale: number): number {
  return view.scale / fitScale;
}

let grain: HTMLCanvasElement | null = null;
/** Grana fine della lacca: rumore casuale, generato una volta. */
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  grain = document.createElement('canvas');
  grain.width = grain.height = 192;
  const g = grain.getContext('2d')!;
  const img = g.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return grain;
}

/** Filo di metallo in rilievo: ombra, corpo, riflesso. `w` in pixel CSS. */
function wire(ctx: CanvasRenderingContext2D, path: Path2D, w: number, scale: number, bright = 1) {
  const px = 1 / scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.translate(0.5 * px, 1.1 * px);
  ctx.lineWidth = (w + 1.4) * px;
  ctx.strokeStyle = 'rgba(4, 9, 12, 0.72)';
  ctx.stroke(path);
  ctx.restore();
  ctx.lineWidth = w * px;
  ctx.strokeStyle = BOARD_COLORS.platinum;
  ctx.stroke(path);
  ctx.save();
  ctx.translate(-0.3 * px, -0.45 * px);
  ctx.lineWidth = Math.max(0.6, w * 0.36) * px;
  ctx.strokeStyle = `rgba(243, 247, 249, ${0.85 * bright})`;
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Strato fisso: tavolo, cornice, mare, linee incise, smalto e fili.
 * `ctx` è già grande quanto lo schermo (in pixel del dispositivo).
 */
export function paintStatic(
  ctx: CanvasRenderingContext2D,
  geo: BoardGeometry,
  view: BoardView,
  state: BoardState,
  dpr: number,
  fitScale: number,
) {
  const { width: W, height: H } = geo;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const z = zoomLevel(view, fitScale);
  const k = clamp(z ** 0.45, 1, 2.6);
  const toMap = () => ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
  const toScreen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // tavolo
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const pool = ctx.createRadialGradient(cw / 2, ch * 0.45, 0, cw / 2, ch * 0.45, Math.max(cw, ch) * 0.75);
  pool.addColorStop(0, '#15232c');
  pool.addColorStop(1, BOARD_COLORS.table);
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, cw, ch);

  // cornice: doppio filo di platino attorno alla plancia
  toMap();
  const m1 = 34;
  const m2 = 56;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 28 * dpr;
  ctx.shadowOffsetY = 10 * dpr;
  ctx.fillStyle = '#10222c';
  ctx.fillRect(-m2, -m2, W + 2 * m2, H + 2 * m2);
  ctx.restore();
  const frame = new Path2D();
  frame.rect(-m2, -m2, W + 2 * m2, H + 2 * m2);
  const frameIn = new Path2D();
  frameIn.rect(-m1, -m1, W + 2 * m1, H + 2 * m1);
  wire(ctx, frame, 2.2 * k, view.scale);
  wire(ctx, frameIn, 1.1 * k, view.scale, 0.7);

  // mare in lacca: sfumatura verticale e un riflesso largo in diagonale
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, BOARD_COLORS.lacquerTop);
  sea.addColorStop(1, BOARD_COLORS.lacquerBottom);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, W, H);
  const sheen = ctx.createLinearGradient(W * 0.1, 0, W * 0.55, H);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.45, 'rgba(190, 225, 235, 0.06)');
  sheen.addColorStop(0.55, 'rgba(190, 225, 235, 0.06)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // linee di profondità incise: solco scuro e bordo chiaro, sempre più tenui al largo
  const alphas = [0.34, 0.24, 0.17, 0.12, 0.08];
  geo.waterlines.forEach((path, i) => {
    const a = alphas[i] ?? 0.06;
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.translate(0, 1 / view.scale);
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeStyle = `rgba(0, 0, 0, ${a * 1.2})`;
    ctx.stroke(path);
    ctx.restore();
    ctx.lineWidth = 0.9 / view.scale;
    ctx.strokeStyle = `rgba(${BOARD_COLORS.engraving}, ${a})`;
    ctx.stroke(path);
  });

  // rosa dei venti incisa
  if (geo.board.compass) paintCompass(ctx, geo.board.compass[0], geo.board.compass[1], 190, view.scale);

  // nomi dei continenti e bonus, incisi nel mare
  for (const c of geo.board.continents) {
    if (!c.label) continue;
    const [x, y] = c.label;
    const size = 118;
    const px = 1 / view.scale;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `300 ${size}px ${BOARD_FONT}`;
    ctx.fontStretch = 'expanded';
    ctx.letterSpacing = `${size * 0.1}px`;
    // incisione: solco scuro sotto, bordo di luce sopra, poi il metallo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillText(c.name, x, y + 1.6 * px);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillText(c.name, x, y - px);
    ctx.fillStyle = `rgba(${BOARD_COLORS.engraving}, 0.5)`;
    ctx.fillText(c.name, x, y);
    ctx.font = `500 ${size * 0.42}px ${BOARD_FONT}`;
    ctx.letterSpacing = `${size * 0.06}px`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(`+${c.bonus} armate`, x, y + size * 0.92 + 1.4 * px);
    ctx.fillStyle = `rgba(${BOARD_COLORS.engraving}, 0.62)`;
    ctx.fillText(`+${c.bonus} armate`, x, y + size * 0.92);
    ctx.letterSpacing = '0px';
    ctx.fontStretch = 'normal';
  }
  ctx.restore();

  // grana della lacca, in pixel schermo
  ctx.save();
  toScreen();
  ctx.beginPath();
  ctx.rect(view.x, view.y, W * view.scale, H * view.scale);
  ctx.clip();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat')!;
  ctx.fillRect(0, 0, cw / dpr, ch / dpr);
  ctx.restore();

  toMap();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  // acqua bassa: alone chiaro attorno alle coste
  ctx.save();
  ctx.shadowColor = 'rgba(110, 185, 200, 0.42)';
  ctx.shadowBlur = clamp(16 * k, 10, 30) * dpr;
  ctx.fillStyle = '#16323d';
  ctx.fill(geo.land, 'evenodd');
  ctx.restore();

  // smalto: colore pieno, cupola di luce, bordo incassato
  for (const t of geo.board.territories) {
    const path = geo.paths.get(t.id)!;
    const color = state.owners.get(t.id) ?? BOARD_COLORS.unowned[t.continent] ?? '#5f6a72';
    const [x0, y0, x1, y1] = geo.boxes.get(t.id)!;
    const w = x1 - x0;
    const h = y1 - y0;
    ctx.fillStyle = shade(color, -0.08);
    ctx.fill(path, 'evenodd');

    ctx.save();
    ctx.clip(path, 'evenodd');
    const cx = t.anchor[0] - w * 0.18;
    const cy = t.anchor[1] - h * 0.22;
    const r = Math.max(w, h) * 0.8;
    const dome = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    dome.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
    dome.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)');
    dome.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
    ctx.fillStyle = dome;
    ctx.fillRect(x0, y0, w, h);
    // bordo incassato sotto il filo
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 7 * dpr * Math.min(1.6, k);
    ctx.lineWidth = 3.2 / view.scale;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.stroke(path);
    ctx.restore();
  }

  // grana dello smalto, fissa sullo schermo come la lacca
  ctx.save();
  ctx.clip(geo.land, 'evenodd');
  toScreen();
  ctx.globalAlpha = 0.12;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat')!;
  ctx.fillRect(0, 0, cw / dpr, ch / dpr);
  ctx.restore();

  // fili di platino
  wire(ctx, geo.inner, 1.05 * k, view.scale, 0.55);
  wire(ctx, geo.frontier, 2.1 * k, view.scale, 0.8);
  wire(ctx, geo.coast, 1.45 * k, view.scale, 0.5);
  ctx.restore();

  // rotte via mare: puntinatura d'argento con un rivetto a ogni capo
  paintRoutes(ctx, geo, view, k, dpr);
}

function paintCompass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, scale: number) {
  const line = (a: number) => `rgba(${BOARD_COLORS.engraving}, ${a})`;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1 / scale;
  // cerchi
  for (const [rr, a] of [
    [r, 0.32],
    [r * 0.82, 0.2],
  ] as const) {
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.strokeStyle = line(a);
    ctx.stroke();
  }
  // tacche ogni 15°
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = i % 6 === 0 ? r * 0.74 : r * 0.82;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.strokeStyle = line(0.3);
    ctx.stroke();
  }
  // stella a otto punte: le quattro principali più lunghe, metà piena e metà vuota
  const star = (len: number, wid: number, rot: number, fillA: number) => {
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      const tip: [number, number] = [Math.cos(a) * len, Math.sin(a) * len];
      const l: [number, number] = [Math.cos(a - Math.PI / 4) * wid, Math.sin(a - Math.PI / 4) * wid];
      const rgt: [number, number] = [Math.cos(a + Math.PI / 4) * wid, Math.sin(a + Math.PI / 4) * wid];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(...tip);
      ctx.lineTo(...l);
      ctx.closePath();
      ctx.fillStyle = line(fillA);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(...tip);
      ctx.lineTo(...rgt);
      ctx.closePath();
      ctx.strokeStyle = line(0.4);
      ctx.stroke();
    }
  };
  star(r * 0.62, r * 0.12, Math.PI / 4, 0.18);
  star(r * 0.96, r * 0.16, -Math.PI / 2, 0.36);
  ctx.font = `500 ${r * 0.22}px ${BOARD_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = line(0.55);
  ctx.fillText('N', 0, -r * 1.12);
  ctx.restore();
}

function paintRoutes(ctx: CanvasRenderingContext2D, geo: BoardGeometry, view: BoardView, k: number, dpr: number) {
  const px = 1 / view.scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, geo.width, geo.height);
  ctx.clip();
  ctx.lineCap = 'round';
  for (const route of geo.routes) {
    const path = new Path2D();
    for (const c of route.curves) {
      path.moveTo(c.from[0], c.from[1]);
      path.quadraticCurveTo(c.ctrl[0], c.ctrl[1], c.to[0], c.to[1]);
    }
    const dot = 2.4 * Math.min(1.5, k);
    ctx.setLineDash([0.001, 6.5 * Math.min(1.5, k) * px]);
    ctx.lineWidth = (dot + 1.2) * px;
    ctx.strokeStyle = 'rgba(3, 8, 11, 0.7)';
    ctx.save();
    ctx.translate(0.4 * px, 0.8 * px);
    ctx.stroke(path);
    ctx.restore();
    ctx.lineWidth = dot * px;
    ctx.strokeStyle = 'rgba(226, 235, 240, 0.92)';
    ctx.stroke(path);
    ctx.setLineDash([]);
    for (const [x, y] of route.ends) {
      const r = 3.4 * Math.min(1.6, k) * px;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 3 * dpr;
      ctx.shadowOffsetY = 1 * dpr;
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
      g.addColorStop(0, BOARD_COLORS.platinumLight);
      g.addColorStop(0.6, BOARD_COLORS.platinum);
      g.addColorStop(1, '#4c575e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Rettangoli occupati a schermo, per non sovrapporre nomi e pedine. */
type Rect = [number, number, number, number];
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Raggio delle pedine in pixel CSS. */
export function tokenRadius(view: BoardView, fitScale: number): number {
  return clamp(9.5 + (zoomLevel(view, fitScale) - 1) * 1.6, 9.5, 15);
}

/**
 * Strato mobile: territorio sotto il mouse, selezione e confinanti, pedine con le armate,
 * nomi dei territori dove c'è spazio. Disegna sopra quello che c'è già.
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
  const k = clamp(z ** 0.45, 1, 2.6);
  const toMap = () => ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
  const sw = ctx.canvas.width / dpr;
  const sh = ctx.canvas.height / dpr;

  // evidenziazioni in coordinate mappa
  toMap();
  const lighten = (id: string, a: number) => {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fill(geo.paths.get(id)!, 'evenodd');
    ctx.restore();
  };
  if (state.selected) {
    const neighbours = geo.neighbours.get(state.selected) ?? [];
    for (const n of neighbours) {
      lighten(n, 0.1);
      ctx.save();
      ctx.setLineDash([5 / view.scale, 4 / view.scale]);
      ctx.lineWidth = 1.6 / view.scale;
      ctx.strokeStyle = 'rgba(243, 247, 249, 0.85)';
      ctx.stroke(geo.paths.get(n)!);
      ctx.restore();
    }
    lighten(state.selected, 0.16);
    ctx.save();
    ctx.shadowColor = 'rgba(235, 245, 250, 0.85)';
    ctx.shadowBlur = 12 * dpr;
    wire(ctx, geo.paths.get(state.selected)!, 2.6 * k, view.scale, 1);
    ctx.restore();
  }
  if (state.hover && state.hover !== state.selected) {
    lighten(state.hover, 0.09);
    wire(ctx, geo.paths.get(state.hover)!, 1.8 * k, view.scale, 1);
  }

  // pedine e nomi in pixel CSS
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = tokenRadius(view, fitScale);
  const taken: Rect[] = [];
  const screen = (p: readonly [number, number]): [number, number] => [p[0] * view.scale + view.x, p[1] * view.scale + view.y];
  const visible = geo.board.territories.filter((t) => {
    const [x, y] = screen(t.anchor);
    return x > -40 && y > -40 && x < sw + 40 && y < sh + 40;
  });

  for (const t of visible) {
    const [x, y] = screen(t.anchor);
    const color = state.owners.get(t.id);
    const armies = state.armies.get(t.id) ?? 0;
    taken.push([x - r - 2, y - r - 2, x + r + 2, y + r + 2]);
    paintToken(ctx, x, y, r, color ?? '#7b868e', armies, dpr, t.id === state.selected || t.id === state.hover);
  }

  // nomi: prima i territori grandi; solo dove il nome sta dentro il territorio o la vista è vicina
  const fontSize = clamp(10.5 + (z - 1) * 1.2, 10.5, 15);
  ctx.font = `600 ${fontSize}px ${BOARD_FONT}`;
  ctx.fontStretch = 'expanded';
  ctx.letterSpacing = '0.2px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
  const byArea = [...visible].sort((a, b) => area(geo.boxes.get(b.id)!) - area(geo.boxes.get(a.id)!));
  for (const t of byArea) {
    const [x, y] = screen(t.anchor);
    const box = geo.boxes.get(t.id)!;
    const boxW = (box[2] - box[0]) * view.scale;
    const tw = ctx.measureText(t.name).width;
    const force = t.id === state.selected || t.id === state.hover;
    if (!force && tw > boxW * 0.95 && z < 2.6) continue;
    const ty = y + r + 4;
    const rect: Rect = [x - tw / 2 - 3, ty - 1, x + tw / 2 + 3, ty + fontSize + 2];
    if (!force && taken.some((o) => overlaps(o, rect))) continue;
    taken.push(rect);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = 'rgba(6, 12, 16, 0.82)';
    ctx.strokeText(t.name, x, ty);
    ctx.fillStyle = BOARD_COLORS.ink;
    ctx.fillText(t.name, x, ty);
  }
  ctx.letterSpacing = '0px';
  ctx.fontStretch = 'normal';
}

/** Medaglione smaltato con bordo di platino e il numero di armate. */
function paintToken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  armies: number,
  dpr: number,
  lifted: boolean,
) {
  ctx.save();
  // ombra portata
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = (lifted ? 10 : 6) * dpr;
  ctx.shadowOffsetY = (lifted ? 3.5 : 2) * dpr;
  const rim = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  rim.addColorStop(0, BOARD_COLORS.platinumLight);
  rim.addColorStop(0.5, BOARD_COLORS.platinum);
  rim.addColorStop(1, '#3f4a51');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(x, y - (lifted ? 1.5 : 0), r + 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const cy = y - (lifted ? 1.5 : 0);
  // smalto a cupola
  const enamel = ctx.createRadialGradient(x - r * 0.35, cy - r * 0.45, r * 0.1, x, cy, r * 1.05);
  enamel.addColorStop(0, shade(color, 0.32));
  enamel.addColorStop(0.55, color);
  enamel.addColorStop(1, shade(color, -0.38));
  ctx.fillStyle = enamel;
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // filo interno scuro
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.stroke();
  // riflesso in alto
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const gloss = ctx.createLinearGradient(x, cy - r, x, cy);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.ellipse(x, cy - r * 0.42, r * 0.78, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // numero
  const light = luminance(color) > 0.36;
  const label = String(armies);
  const size = r * (label.length > 2 ? 0.9 : 1.08);
  ctx.font = `700 ${size}px ${BOARD_FONT}`;
  ctx.fontStretch = 'condensed';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.45)';
  ctx.fillText(label, x, cy + r * 0.07 + 0.8);
  ctx.fillStyle = light ? '#0d1418' : '#f6f8f9';
  ctx.fillText(label, x, cy + r * 0.07);
  ctx.fontStretch = 'normal';
}
