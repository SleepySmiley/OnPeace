/**
 * Geometria del tabellone pronta per il disegno: percorsi dei territori, confini tra ogni
 * coppia di territori, coste e rotte via mare. Si calcola una volta quando si carica il tabellone.
 */
import type { BoardDef, Point } from '@onpeace/engine';

export type Box = [number, number, number, number];

export interface SeaRoute {
  a: string;
  b: string;
  /** Una o due curve (due se la rotta esce da un bordo e rientra dall'altro). */
  curves: { from: Point; ctrl: Point; to: Point }[];
  ends: Point[];
}

/** Tratto di confine in comune tra due territori (a < b). */
export interface Border {
  a: string;
  b: string;
  path: Path2D;
  /** Confine tra continenti diversi. */
  frontier: boolean;
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
  borders: Border[];
  /** Lati che danno sul mare. */
  coast: Path2D;
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

  // lati consecutivi della stessa specie uniti in linee spezzate
  const coast = new Path2D();
  const pairs = new Map<string, Border>();
  const eps = 0.6;
  const onFrame = (a: Point, b: Point) =>
    (Math.abs(a[0]) < eps && Math.abs(b[0]) < eps) ||
    (Math.abs(a[0] - W) < eps && Math.abs(b[0] - W) < eps) ||
    (Math.abs(a[1]) < eps && Math.abs(b[1]) < eps) ||
    (Math.abs(a[1] - H) < eps && Math.abs(b[1] - H) < eps);
  /** Tracciato del confine tra due territori; ogni confine lo disegna solo il territorio con l'id minore. */
  const borderPath = (t: string, other: string): Path2D | null => {
    if (t > other) return null;
    const k = `${t}|${other}`;
    let border = pairs.get(k);
    if (!border) {
      border = { a: t, b: other, path: new Path2D(), frontier: continentOf.get(other) !== continentOf.get(t) };
      pairs.set(k, border);
    }
    return border.path;
  };
  const alongside = edgesNear(board, NEAR);
  for (const t of board.territories) {
    for (const poly of t.shape) {
      for (const ring of poly) {
        let current: Path2D | null = null;
        let last: Point | null = null;
        const emit = (a: Point, b: Point, target: Path2D | null) => {
          if (!target) {
            current = null;
            return;
          }
          if (target !== current || !last || last[0] !== a[0] || last[1] !== a[1]) target.moveTo(a[0], a[1]);
          target.lineTo(b[0], b[1]);
          current = target;
          last = b;
        };
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          if (onFrame(a, b)) {
            emit(a, b, null);
            continue;
          }
          const other = owners.get(edgeKey(a, b))!.find((id) => id !== t.id);
          if (other) {
            emit(a, b, borderPath(t.id, other));
            continue;
          }
          // lato senza gemello identico: i paesi uniti nei territori non hanno sempre gli stessi vertici
          // (incroci a T, scarti di pochi decimi), quindi si guarda a pezzi se corre lungo un altro territorio
          const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
          let p: Point = a;
          for (let k = 1; k <= n; k++) {
            const q: Point = k === n ? b : [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
            const near = alongside([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], t.id);
            emit(p, q, near ? borderPath(t.id, near) : coast);
            p = q;
          }
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
    borders: [...pairs.values()],
    coast,
    routes: buildRoutes(board),
  };
}

// ---------------------------------------------------------------- lati vicini
/** Un lato a meno di tanto dal contorno di un altro territorio è confine, non costa (unità della mappa). */
const NEAR = 0.5;
/** Lunghezza dei pezzi in cui si controlla un lato senza gemello. */
const STEP = 2;

/** Ricerca del territorio (diverso da `self`) il cui contorno passa a meno di `tol` da un punto. */
function edgesNear(board: BoardDef, tol: number): (p: Point, self: string) => string | null {
  const C = 16;
  const grid = new Map<string, { t: string; a: Point; b: Point }[]>();
  for (const t of board.territories)
    for (const poly of t.shape)
      for (const ring of poly)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const [x0, x1] = [Math.floor((Math.min(a[0], b[0]) - tol) / C), Math.floor((Math.max(a[0], b[0]) + tol) / C)];
          const [y0, y1] = [Math.floor((Math.min(a[1], b[1]) - tol) / C), Math.floor((Math.max(a[1], b[1]) + tol) / C)];
          for (let x = x0; x <= x1; x++)
            for (let y = y0; y <= y1; y++) {
              const k = `${x},${y}`;
              (grid.get(k) ?? grid.set(k, []).get(k)!).push({ t: t.id, a, b });
            }
        }
  return (p, self) => {
    let best: string | null = null;
    let bestD = tol;
    for (const e of grid.get(`${Math.floor(p[0] / C)},${Math.floor(p[1] / C)}`) ?? []) {
      if (e.t === self) continue;
      const d = distanceToSegment(p, e.a, e.b);
      if (d < bestD) {
        bestD = d;
        best = e.t;
      }
    }
    return best;
  };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// ---------------------------------------------------------------- rotte via mare
function buildRoutes(board: BoardDef): SeaRoute[] {
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
  const routes: SeaRoute[] = [];
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
