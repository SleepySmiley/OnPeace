import type { Point } from '@onpeace/engine';

/** Trasformazione mondo → schermo: schermo = mondo × scale + offset. */
export class Camera {
  scale = 1;
  x = 0;
  y = 0;
  minScale = 0.1;
  maxScale = 10;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {}

  /** Spazio occupato dall'interfaccia sopra la mappa (es. barra in alto). */
  insetTop = 0;

  /** Inquadra tutta la mappa nella parte di finestra libera dall'interfaccia. */
  fit(viewW: number, viewH: number, margin = 0.96): void {
    const freeH = viewH - this.insetTop;
    this.scale = Math.min(viewW / this.worldWidth, freeH / this.worldHeight) * margin;
    this.minScale = this.scale * 0.8;
    this.maxScale = this.scale * 12;
    this.x = (viewW - this.worldWidth * this.scale) / 2;
    this.y = this.insetTop + (freeH - this.worldHeight * this.scale) / 2;
  }

  toScreen(p: Point): Point {
    return [p[0] * this.scale + this.x, p[1] * this.scale + this.y];
  }

  toWorld(sx: number, sy: number): Point {
    return [(sx - this.x) / this.scale, (sy - this.y) / this.scale];
  }

  /** Zoom mantenendo fermo il punto sotto il cursore. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.x = sx - wx * this.scale;
    this.y = sy - wy * this.scale;
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }
}
