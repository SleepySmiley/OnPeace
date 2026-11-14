/**
 * Pezzi comuni a tutti gli stili del tabellone: vista, stato da disegnare, trasformazioni,
 * colori, posizionamento dei nomi senza sovrapposizioni, geometria delle frecce.
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

/** Immagini della Terra già riproiettate (possono mancare finché si caricano). */
export interface BoardAssets {
  /** Terreno in scala di grigi dalla foto di giorno. */
  relief: HTMLCanvasElement | null;
}

export interface PaintEnv {
  ctx: CanvasRenderingContext2D;
  geo: BoardGeometry;
  view: BoardView;
  state: BoardState;
  dpr: number;
  /** Scala della vista d'insieme. */
  fit: number;
  assets: BoardAssets;
}

export interface BoardStyle {
  id: string;
  name: string;
  /** Descrizione di una riga per il selettore. */
  tagline: string;
  /** Colori dei giocatori adatti allo stile. */
  playerColors: string[];
  /** Caratteri da caricare prima di disegnare (sintassi di document.fonts.load). */
  fonts: string[];
  /** Strato fisso: cambia solo con la vista o i padroni. */
  paintStatic(env: PaintEnv): void;
  /** Strato mobile: selezione, frecce, pedine, nomi. */
  paintOverlay(env: PaintEnv): void;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const zoomOf = (env: PaintEnv) => env.view.scale / env.fit;

export function toMap({ ctx, dpr, view }: PaintEnv) {
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
}
export function toScreen({ ctx, dpr }: PaintEnv) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
export function screenOf({ view }: PaintEnv, p: readonly [number, number]): [number, number] {
  return [p[0] * view.scale + view.x, p[1] * view.scale + view.y];
}

export function hexRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
/** Mescola con il bianco (t > 0) o con il nero (t < 0). */
export function shade(hex: string, t: number): string {
  const [r, g, b] = hexRgb(hex);
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const c = (v: number) => Math.round(v + (target - v) * k);
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}
export function luminance(hex: string): number {
  const v = hexRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}

/** Territori con il segnaposto dentro lo schermo (più un margine). */
export function visibleTerritories(env: PaintEnv) {
  const sw = env.ctx.canvas.width / env.dpr;
  const sh = env.ctx.canvas.height / env.dpr;
  return env.geo.board.territories.filter((t) => {
    const [x, y] = screenOf(env, t.anchor);
    return x > -80 && y > -60 && x < sw + 80 && y < sh + 60;
  });
}

export type Rect = [number, number, number, number];
export const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * Nomi dei territori sotto le pedine, dai territori più grandi ai più piccoli: un nome si
 * scrive solo se sta nel territorio (o la vista è vicina) e non copre altro.
 */
export function placeLabels(
  env: PaintEnv,
  taken: Rect[],
  opts: {
    font: string;
    size: number;
    offsetY: number;
    text?: (name: string) => string;
    letterSpacing?: number;
    draw: (text: string, x: number, y: number, active: boolean) => void;
  },
) {
  const { ctx, geo, state, view } = env;
  const z = zoomOf(env);
  toScreen(env);
  ctx.font = opts.font;
  ctx.letterSpacing = `${opts.letterSpacing ?? 0}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
  const list = visibleTerritories(env).sort((a, b) => area(geo.boxes.get(b.id)!) - area(geo.boxes.get(a.id)!));
  for (const t of list) {
    const [x, y] = screenOf(env, t.anchor);
    const text = opts.text ? opts.text(t.name) : t.name;
    const box = geo.boxes.get(t.id)!;
    const tw = ctx.measureText(text).width;
    const active = t.id === state.selected || t.id === state.hover;
    if (!active && tw > (box[2] - box[0]) * view.scale * 0.95 && z < 2.6) continue;
    const ty = y + opts.offsetY;
    const rect: Rect = [x - tw / 2 - 3, ty - 1, x + tw / 2 + 3, ty + opts.size + 2];
    if (!active && taken.some((o) => overlaps(o, rect))) continue;
    taken.push(rect);
    opts.draw(text, x, ty, active);
  }
  ctx.letterSpacing = '0px';
}

export interface ArrowShape {
  from: [number, number];
  ctrl: [number, number];
  /** Punta. */
  to: [number, number];
  /** Direzione d'arrivo (versore). */
  dir: [number, number];
  length: number;
}

/** Curva da `a` a `b` (pixel schermo), accorciata di `trim` ai due capi; null se troppo corta. */
export function arrowShape(a: [number, number], b: [number, number], trim: number, bendK = 0.18): ArrowShape | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < trim * 2.6) return null;
  const ux = dx / len;
  const uy = dy / len;
  const from: [number, number] = [a[0] + ux * trim, a[1] + uy * trim];
  const to: [number, number] = [b[0] - ux * trim, b[1] - uy * trim];
  const bend = bendK * (len - 2 * trim);
  const ctrl: [number, number] = [(from[0] + to[0]) / 2 - uy * bend, (from[1] + to[1]) / 2 + ux * bend];
  const tx = to[0] - ctrl[0];
  const ty = to[1] - ctrl[1];
  const tl = Math.hypot(tx, ty) || 1;
  return { from, ctrl, to, dir: [tx / tl, ty / tl], length: len - 2 * trim };
}

/** Punto della curva quadratica al parametro t. */
export function qPoint(s: ArrowShape, t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * s.from[0] + 2 * u * t * s.ctrl[0] + t * t * s.to[0],
    u * u * s.from[1] + 2 * u * t * s.ctrl[1] + t * t * s.to[1],
  ];
}

/** Per ogni confinante del territorio selezionato: forma della freccia e se è nemico. */
export function selectionArrows(env: PaintEnv, trim: number, bendK?: number) {
  const { geo, state, view } = env;
  if (!state.selected) return [];
  const t = geo.board.territories.find((x) => x.id === state.selected)!;
  const a = screenOf(env, t.anchor);
  const mine = state.owners.get(t.id);
  const out: { id: string; enemy: boolean; shape: ArrowShape }[] = [];
  for (const n of geo.neighbours.get(t.id) ?? []) {
    const other = geo.board.territories.find((x) => x.id === n)!;
    const b = screenOf(env, other.anchor);
    if (Math.abs(b[0] - a[0]) > (geo.width * view.scale) / 2) continue; // rotta che fa il giro del mondo
    const shape = arrowShape(a, b, trim, bendK);
    if (shape) out.push({ id: n, enemy: state.owners.get(n) !== mine, shape });
  }
  return out;
}

/** Percorso delle rotte via mare (coordinate mappa). */
export function routePath(route: BoardGeometry['routes'][number]): Path2D {
  const path = new Path2D();
  for (const c of route.curves) {
    path.moveTo(c.from[0], c.from[1]);
    path.quadraticCurveTo(c.ctrl[0], c.ctrl[1], c.to[0], c.to[1]);
  }
  return path;
}

/** Piastrella di rumore (grana), generata una volta per tinta. */
const noiseTiles = new Map<string, HTMLCanvasElement>();
export function noiseTile(size = 220, amount = 70, key = 'base'): HTMLCanvasElement {
  const k = `${key}-${size}-${amount}`;
  let tile = noiseTiles.get(k);
  if (tile) return tile;
  tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const g = tile.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * amount;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseTiles.set(k, tile);
  return tile;
}
