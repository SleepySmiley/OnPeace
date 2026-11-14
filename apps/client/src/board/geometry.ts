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
  for (const t of board.territories) {
    for (const poly of t.shape) {
      for (const ring of poly) {
        let current: Path2D | null = null;
        let last: Point | null = null;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          let target: Path2D | null = null;
          if (!onFrame(a, b)) {
            const other = owners.get(edgeKey(a, b))!.find((id) => id !== t.id);
            if (!other) target = coast;
            else if (t.id < other) {
              // ogni confine lo disegna una volta sola il territorio con l'id minore
              const k = `${t.id}|${other}`;
              let border = pairs.get(k);
              if (!border) {
                border = { a: t.id, b: other, path: new Path2D(), frontier: continentOf.get(other) !== t.continent };
                pairs.set(k, border);
              }
              target = border.path;
            }
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
    borders: [...pairs.values()],
    coast,
    routes: buildRoutes(board),
  };
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
