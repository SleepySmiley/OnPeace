/**
 * Griglia di navigazione: la mappa rasterizzata in celle terra / mare / invalicabile.
 * Serve a controllare velocemente i percorsi; vicino alle coste si ricorre al test esatto.
 */
import { pointInMultiPolygon, type MultiPolygon, type Point, type Ring } from './geometry';
import { isSea } from './map-check';
import type { MapDef } from './schema/map';

export type Terrain = 'sea' | 'land' | 'nogo';

// 0 = mare (valore iniziale della griglia)
const LAND = 1;
const NOGO = 2;

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly cells: Uint8Array;

  constructor(
    readonly map: MapDef,
    readonly cell = map.rangeScale / 2,
  ) {
    this.cols = Math.ceil(map.width / cell);
    this.rows = Math.ceil(map.height / cell);
    this.cells = new Uint8Array(this.cols * this.rows);
    for (const country of map.countries) this.fill(country.shape.flat() as Ring[], LAND);
    for (const poly of map.noGo) this.fill(poly as Ring[], NOGO);
  }

  /** Riempimento a scansione (pari-dispari) degli anelli di un'area. */
  private fill(rings: Ring[], value: number): void {
    for (let r = 0; r < this.rows; r++) {
      const y = (r + 0.5) * this.cell;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [ax, ay] = ring[j]!;
          const [bx, by] = ring[i]!;
          if (ay > y !== by > y) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil(xs[k]! / this.cell - 0.5));
        const c1 = Math.min(this.cols - 1, Math.floor(xs[k + 1]! / this.cell - 0.5));
        for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c] = value;
      }
    }
  }

  /** Terreno approssimato (per cella). */
  cellTerrain(p: Point): Terrain | 'out' {
    const c = Math.floor(p[0] / this.cell);
    const r = Math.floor(p[1] / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 'out';
    const v = this.cells[r * this.cols + c];
    return v === LAND ? 'land' : v === NOGO ? 'nogo' : 'sea';
  }

  /** Terreno esatto: usa la griglia e, se serve, il test sui poligoni. */
  terrainAt(p: Point): Terrain | 'out' {
    if (p[0] < 0 || p[1] < 0 || p[0] > this.map.width || p[1] > this.map.height) return 'out';
    if (pointInMultiPolygon(p, this.map.noGo as MultiPolygon)) return 'nogo';
    return isSea(this.map, p) ? 'sea' : 'land';
  }

  /** Terreno con la griglia, verificato col test esatto quando la cella confina con altro terreno. */
  terrainFast(p: Point): Terrain | 'out' {
    const t = this.cellTerrain(p);
    if (t === 'out') return t;
    const h = this.cell;
    const around = [
      this.cellTerrain([p[0] + h, p[1]]),
      this.cellTerrain([p[0] - h, p[1]]),
      this.cellTerrain([p[0], p[1] + h]),
      this.cellTerrain([p[0], p[1] - h]),
    ];
    return around.every((a) => a === t || a === 'out') ? t : this.terrainAt(p);
  }
}
