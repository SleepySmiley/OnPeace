/**
 * Geometria del tabellone pronta per il disegno: percorsi dei territori, fili tra territori
 * (divisi in coste, confini interni e confini tra continenti), linee di profondità del mare
 * e rotte via mare. Si calcola una volta sola quando si carica il tabellone.
 */
import { contours } from 'd3-contour';
import type { BoardDef, Point } from '@onpeace/engine';

export type Box = [number, number, number, number];

export interface SeaRoute {
  a: string;
  b: string;
  /** Una o due curve (due se la rotta esce da un bordo e rientra dall'altro). */
  curves: { from: Point; ctrl: Point; to: Point }[];
  ends: Point[];
}

export interface BoardGeometry {
  board: BoardDef;
  width: number;
  height: number;
  /** Contorno di ogni territorio, in coordinate mappa (riempimento evenodd). */
  paths: Map<string, Path2D>;
  boxes: Map<string, Box>;
  continentOf: Map<string, string>;
  neighbours: Map<string, string[]>;
  /** Tutte le terre insieme. */
  land: Path2D;
  /** Fili: coste, confini tra territori dello stesso continente, confini tra continenti. */
  coast: Path2D;
  inner: Path2D;
  frontier: Path2D;
  /** Linee di profondità attorno alle coste, dalla più vicina alla più lontana. */
  waterlines: Path2D[];
  routes: SeaRoute[];
}

const key = (p: Point) => `${p[0]},${p[1]}`;
const edgeKey = (a: Point, b: Point) => {
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

export function buildGeometry(board: BoardDef): BoardGeometry {
  const W = board.width;
  const H = board.height;
  const paths = new Map<string, Path2D>();
  const boxes = new Map<string, Box>();
  const continentOf = new Map(board.territories.map((t) => [t.id, t.continent]));
  const land = new Path2D();

  // chi possiede ogni lato: un lato in comune tra due territori è un confine, altrimenti è costa
  const owners = new Map<string, string[]>();
  for (const t of board.territories) {
    const path = new Path2D();
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of t.shape) {
      for (const ring of poly) {
        ring.forEach(([x, y], i) => {
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        });
        path.closePath();
        for (let i = 0; i < ring.length; i++) {
          const k = edgeKey(ring[i]!, ring[(i + 1) % ring.length]!);
          const list = owners.get(k);
          if (!list) owners.set(k, [t.id]);
          else if (!list.includes(t.id)) list.push(t.id);
        }
      }
    }
    paths.set(t.id, path);
    boxes.set(t.id, [x0, y0, x1, y1]);
    land.addPath(path);
  }

  // fili: lati consecutivi della stessa specie uniti in linee spezzate
  const coast = new Path2D();
  const inner = new Path2D();
  const frontier = new Path2D();
  const eps = 0.6;
  const onFrame = (a: Point, b: Point) =>
    (Math.abs(a[0]) < eps && Math.abs(b[0]) < eps) ||
    (Math.abs(a[0] - W) < eps && Math.abs(b[0] - W) < eps) ||
    (Math.abs(a[1]) < eps && Math.abs(b[1]) < eps) ||
    (Math.abs(a[1] - H) < eps && Math.abs(b[1] - H) < eps);
  for (const t of board.territories) {
    for (const poly of t.shape) {
      for (const ring of poly) {
        let current: Path2D | null = null;
        let last: Point | null = null;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          let target: Path2D | null;
          if (onFrame(a, b)) target = null;
          else {
            const other = owners.get(edgeKey(a, b))!.find((id) => id !== t.id);
            if (!other) target = coast;
            else if (t.id > other) target = null; // lo disegna l'altro territorio
            else target = continentOf.get(other) === t.continent ? inner : frontier;
          }
          if (!target) {
            current = null;
            continue;
          }
          if (target !== current || !last || last[0] !== a[0] || last[1] !== a[1]) target.moveTo(a[0], a[1]);
          target.lineTo(b[0], b[1]);
          current = target;
          last = b;
        }
      }
    }
  }

  const neighbours = new Map<string, string[]>(board.territories.map((t) => [t.id, []]));
  for (const l of board.links) {
    neighbours.get(l.a)?.push(l.b);
    neighbours.get(l.b)?.push(l.a);
  }

  return {
    board,
    width: W,
    height: H,
    paths,
    boxes,
    continentOf,
    neighbours,
    land,
    coast,
    inner,
    frontier,
    waterlines: buildWaterlines(board, land, [26, 62, 112, 180, 270]),
    routes: buildRoutes(board),
  };
}

// ---------------------------------------------------------------- linee di profondità
/** Distanza euclidea esatta (Felzenszwalb-Huttenlocher) su una griglia: 0 sulla terra. */
function distanceField(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? 0 : INF;

  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (s <= z[k]!) {
        k--;
        s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      d[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    pass(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    pass(w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]!;
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]!);
  return out;
}

/** Due passate di Chaikin: angoli smussati, linee morbide come incise a mano. */
function chaikin(ring: Point[]): Point[] {
  let pts = ring;
  for (let it = 0; it < 2; it++) {
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = out;
  }
  return pts;
}

function buildWaterlines(board: BoardDef, land: Path2D, levels: number[]): Path2D[] {
  const cell = 8;
  const gw = Math.ceil(board.width / cell);
  const gh = Math.ceil(board.height / cell);
  const canvas = document.createElement('canvas');
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(1 / cell, 1 / cell);
  ctx.fill(land, 'evenodd');
  const pixels = ctx.getImageData(0, 0, gw, gh).data;
  const mask = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) mask[i] = pixels[i * 4 + 3]! > 100 ? 1 : 0;
  const dist = distanceField(mask, gw, gh);
  for (let i = 0; i < dist.length; i++) dist[i] = dist[i]! * cell;

  const generator = contours().size([gw, gh]).thresholds(levels);
  const edge = 1.5;
  const nearEdge = (p: Point) => p[0] < edge || p[1] < edge || p[0] > gw - edge || p[1] > gh - edge;
  return levels.map((level) => {
    const path = new Path2D();
    const geom = generator.contour(Array.from(dist), level);
    for (const poly of geom.coordinates) {
      for (const raw of poly) {
        const ring = chaikin(raw.slice(0, -1) as unknown as Point[]);
        let pen = false;
        for (let i = 0; i <= ring.length; i++) {
          const p = ring[i % ring.length]!;
          // i tratti lungo i bordi della mappa non sono coste: si salta
          if (nearEdge(p)) {
            pen = false;
            continue;
          }
          if (pen) path.lineTo(p[0] * cell, p[1] * cell);
          else path.moveTo(p[0] * cell, p[1] * cell);
          pen = true;
        }
      }
    }
    return path;
  });
}

// ---------------------------------------------------------------- rotte via mare
function buildRoutes(board: BoardDef): SeaRoute[] {
  const routes: SeaRoute[] = [];
  /** Punto di controllo della curva: a metà strada, spostato di lato (verso nord) in proporzione alla lunghezza. */
  const bend = (from: Point, to: Point, amount: number): Point => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    let nx = -dy;
    let ny = dx;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    return [(from[0] + to[0]) / 2 + nx * amount, (from[1] + to[1]) / 2 + ny * amount];
  };
  for (const l of board.links) {
    if (!l.sea || !l.line) continue;
    const [p, q] = l.line;
    if (l.wrap) {
      const [left, right] = p[0] < q[0] ? [p, q] : [q, p];
      const y = (left[1] + right[1]) / 2;
      const toLeft: Point = [0, y];
      const toRight: Point = [board.width, y];
      routes.push({
        a: l.a,
        b: l.b,
        curves: [
          { from: left, ctrl: bend(left, toLeft, 0.12), to: toLeft },
          { from: right, ctrl: bend(right, toRight, 0.12), to: toRight },
        ],
        ends: [left, right],
      });
    } else {
      routes.push({ a: l.a, b: l.b, curves: [{ from: p, ctrl: bend(p, q, 0.16), to: q }], ends: [p, q] });
    }
  }
  return routes;
}
