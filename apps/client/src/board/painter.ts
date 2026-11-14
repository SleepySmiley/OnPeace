/**
 * Il tabellone su un canvas: disegno a due strati e comandi della vista. Lo strato fisso (mare,
 * territori, confini) si ridisegna solo quando cambiano la vista o i padroni; sopra, a ogni
 * fotogramma, selezione, frecce, pedine e nomi. Si trascina per spostarsi, la rotella ingrandisce.
 */
import type { BoardAssets, BoardState, BoardStyle, BoardView, PaintEnv } from './common';
import { flashLevel } from './common';
import { geometryAt, type BoardGeometry } from './geometry';
import { loadRelief } from './imagery';

export interface PainterEvents {
  onHover(id: string | null): void;
  /** Clic su un territorio (null: mare o fuori dal tabellone). */
  onClick(id: string | null, how: { shift: boolean; right: boolean }): void;
  /** La vista è cambiata (spostamento, zoom, ridimensionamento). */
  onView?(): void;
}

/** Spazio occupato dai pannelli sui bordi: la vista d'insieme centra il tabellone in quello che resta. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Terreno della Terra per tabellone: si scarica e si riproietta una volta sola. */
const reliefs = new Map<string, Promise<HTMLCanvasElement | null>>();

export class BoardPainter {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cache = document.createElement('canvas');
  private readonly cacheCtx = this.cache.getContext('2d')!;
  private readonly hitCtx = document.createElement('canvas').getContext('2d')!;
  private cacheView: BoardView | null = null;
  private dpr = 1;
  private view: BoardView = { scale: 1, x: 0, y: 0 };
  private fitScale = 1;
  private frameQueued = false;
  private idleTimer = 0;
  private ownersKey = '';
  private readonly assets: BoardAssets = { relief: null };
  private drag: { x: number; y: number; vx: number; vy: number; moved: number; button: number } | null = null;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private readonly resizeObserver: ResizeObserver;
  private destroyed = false;
  private readonly off: (() => void)[] = [];
  private flight = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly geo: BoardGeometry,
    private style: BoardStyle,
    private state: BoardState,
    private readonly events: PainterEvents,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ownersKey = this.keyOf(state);
    this.listen();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    const id = geo.board.id;
    if (!reliefs.has(id)) reliefs.set(id, loadRelief(geo.board).catch(() => null));
    void reliefs.get(id)!.then((relief) => {
      if (this.destroyed || !relief) return;
      this.assets.relief = relief;
      this.renderStatic();
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    for (const f of this.off) f();
    window.clearTimeout(this.idleTimer);
    cancelAnimationFrame(this.flight);
  }

  // ---------------------------------------------------------------- dall'esterno

  setState(state: BoardState): void {
    this.state = state;
    const key = this.keyOf(state);
    const owners = key !== this.ownersKey;
    this.ownersKey = key;
    // lo strato fisso di alcuni stili è colorato coi padroni (Vetro): solo lì va rifatto se cambiano
    if (owners && this.style.ownersInStatic) this.renderStatic();
    else this.requestFrame();
  }

  async setStyle(style: BoardStyle): Promise<void> {
    this.style = style;
    await Promise.all(style.fonts.map((f) => document.fonts.load(f))).catch(() => undefined);
    if (!this.destroyed && this.style === style) this.renderStatic();
  }

  setInsets(insets: Insets): void {
    const same = (Object.keys(insets) as (keyof Insets)[]).every((k) => insets[k] === this.insets[k]);
    if (same) return;
    this.insets = insets;
    this.resetView();
  }

  /** Torna alla vista d'insieme. */
  resetView(): void {
    const fit = this.fitView();
    this.fitScale = fit.scale;
    this.view = fit;
    this.renderStatic();
    this.events.onView?.();
  }

  /** Porta un territorio nella parte libera dello schermo, se è fuori vista. */
  reveal(id: string): void {
    const t = this.geo.board.territories.find((x) => x.id === id);
    if (!t) return;
    const [x, y] = this.screenOf(t.anchor);
    const { w, h } = this.size();
    const i = this.insets;
    const margin = 60;
    if (x > i.left + margin && x < w - i.right - margin && y > i.top + margin && y < h - i.bottom - margin) return;
    const cx = i.left + (w - i.left - i.right) / 2;
    const cy = i.top + (h - i.top - i.bottom) / 2;
    this.view = { ...this.view, x: this.view.x + cx - x, y: this.view.y + cy - y };
    this.viewChanged();
  }

  /** Posizione sullo schermo (pixel CSS dentro il canvas) del segnaposto di un territorio, con la vista attuale o con `view`. */
  territoryOnScreen(id: string, view: BoardView = this.view): [number, number] | null {
    const t = this.geo.board.territories.find((x) => x.id === id);
    return t ? [t.anchor[0] * view.scale + view.x, t.anchor[1] * view.scale + view.y] : null;
  }

  /** La vista in questo momento. */
  currentView(): BoardView {
    return { ...this.view };
  }

  /**
   * La vista che inquadra questi territori nel riquadro libero `box` (pixel CSS: sinistra, alto,
   * destra, basso), senza ingrandire troppo i territori piccoli né rimpicciolire sotto la vista d'insieme.
   */
  viewFor(ids: string[], box: { left: number; top: number; right: number; bottom: number }, maxZoom = 5): BoardView {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of ids) {
      const b = this.geo.boxes.get(id);
      if (!b) continue;
      x0 = Math.min(x0, b[0]);
      y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]);
      y1 = Math.max(y1, b[3]);
    }
    if (!Number.isFinite(x0)) return { ...this.view };
    const bw = Math.max(1, box.right - box.left);
    const bh = Math.max(1, box.bottom - box.top);
    const scale = Math.min(this.fitScale * maxZoom, Math.max(this.fitScale, Math.min(bw / (x1 - x0), bh / (y1 - y0))));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return { scale, x: box.left + bw / 2 - cx * scale, y: box.top + bh / 2 - cy * scale };
  }

  /**
   * La vista centrata tra i segnaposti di questi territori nel riquadro `box`, ingrandita finché i due più
   * lontani stanno a `spread` pixel (senza scendere sotto la vista d'insieme né salire oltre `maxZoom`).
   */
  viewAround(ids: string[], box: { left: number; top: number; right: number; bottom: number }, spread: number, maxZoom = 5): BoardView {
    const pts = ids.map((id) => this.geo.board.territories.find((t) => t.id === id)?.anchor).filter((p) => p !== undefined);
    if (pts.length === 0) return { ...this.view };
    let far = 0;
    for (const a of pts) for (const b of pts) far = Math.max(far, Math.hypot(a[0] - b[0], a[1] - b[1]));
    const scale = Math.min(this.fitScale * maxZoom, Math.max(this.fitScale, spread / Math.max(far, 1)));
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { scale, x: (box.left + box.right) / 2 - cx * scale, y: (box.top + box.bottom) / 2 - cy * scale };
  }

  /** Porta la vista a `to` con un movimento di macchina da presa (ms); si ferma se si trascina la mappa. */
  flyTo(to: BoardView, ms = 600): Promise<void> {
    cancelAnimationFrame(this.flight);
    const from = { ...this.view };
    if (ms <= 0) {
      this.view = { ...to };
      this.viewChanged();
      return Promise.resolve();
    }
    // allontanandosi, l'ultima immagine nitida copre solo un pezzo dello schermo: si disegna subito quella
    // dell'arrivo (durante il volo si vede ingrandita, poi torna nitida)
    if (to.scale < from.scale * 0.98) {
      this.view = { ...to };
      this.renderStatic();
      this.view = from;
    }
    // si interpola sulla scala in logaritmo e sul punto del tabellone al centro dello schermo: niente scivolate di lato
    const { w, h } = this.size();
    const mid = (v: BoardView) => [(w / 2 - v.x) / v.scale, (h / 2 - v.y) / v.scale] as const;
    const [ax, ay] = mid(from);
    const [bx, by] = mid(to);
    const t0 = performance.now();
    return new Promise((done) => {
      const step = (now: number) => {
        if (this.destroyed || this.drag) return done();
        const k = Math.min(1, (now - t0) / ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
        const scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * e);
        const px = ax + (bx - ax) * e;
        const py = ay + (by - ay) * e;
        this.view = { scale, x: w / 2 - px * scale, y: h / 2 - py * scale };
        this.viewChanged();
        if (k < 1) this.flight = requestAnimationFrame(step);
        else done();
      };
      this.flight = requestAnimationFrame(step);
    });
  }

  // ---------------------------------------------------------------- disegno

  private keyOf(state: BoardState): string {
    return [...state.owners.values()].join(',');
  }

  private size() {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }

  private screenOf(p: readonly [number, number]): [number, number] {
    return [p[0] * this.view.scale + this.view.x, p[1] * this.view.scale + this.view.y];
  }

  /** Per disegnare: contorni col dettaglio che lo schermo mostra a questa scala (i clic usano quelli pieni). */
  private env(target: CanvasRenderingContext2D): PaintEnv {
    return { ctx: target, geo: geometryAt(this.geo, this.view.scale), view: this.view, state: this.state, dpr: this.dpr, fit: this.fitScale, assets: this.assets };
  }

  private fitView(): BoardView {
    const { w, h } = this.size();
    const i = this.insets;
    const fw = Math.max(200, w - i.left - i.right);
    const fh = Math.max(150, h - i.top - i.bottom);
    // spazio attorno per la cornice
    const scale = Math.min((fw - 60) / this.geo.width, (fh - 60) / this.geo.height);
    return { scale, x: i.left + (fw - this.geo.width * scale) / 2, y: i.top + (fh - this.geo.height * scale) / 2 };
  }

  private resize(): void {
    const { w, h } = this.size();
    if (w === 0 || h === 0) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.cache]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.resetView();
  }

  private renderStatic(): void {
    if (this.canvas.width === 0) return;
    this.style.paintStatic(this.env(this.cacheCtx));
    this.cacheView = { ...this.view };
    this.requestFrame();
  }

  private draw(): void {
    this.frameQueued = false;
    if (this.destroyed) return;
    const { ctx, canvas, cache, cacheView, view, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (cacheView) {
      // finché si trascina o si ingrandisce si sposta l'ultima immagine; quella nitida arriva da ferma
      const s = view.scale / cacheView.scale;
      ctx.setTransform(s, 0, 0, s, (view.x - cacheView.x * s) * dpr, (view.y - cacheView.y * s) * dpr);
      ctx.drawImage(cache, 0, 0);
    }
    this.style.paintOverlay(this.env(ctx));
    // lampi delle battaglie: si continua a disegnare finché non si sono spenti
    const now = performance.now();
    if ([...(this.state.flashes?.keys() ?? [])].some((id) => flashLevel(this.state, id, now) > 0)) this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frameQueued) return;
    this.frameQueued = true;
    requestAnimationFrame(() => this.draw());
  }

  private viewChanged(): void {
    this.requestFrame();
    this.events.onView?.();
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.renderStatic(), 140);
  }

  // ---------------------------------------------------------------- comandi

  private territoryAt(sx: number, sy: number): string | null {
    const x = (sx - this.view.x) / this.view.scale;
    const y = (sy - this.view.y) / this.view.scale;
    for (const t of this.geo.board.territories) {
      const b = this.geo.boxes.get(t.id)!;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (this.hitCtx.isPointInPath(this.geo.paths.get(t.id)!, x, y, 'evenodd')) return t.id;
    }
    return null;
  }

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private listen(): void {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => c.removeEventListener(type, fn as EventListener, opts));
    };
    on('contextmenu', (e) => e.preventDefault());
    on('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: 0, button: e.button };
    });
    let hover: string | null = null;
    on('pointermove', (e) => {
      const d = this.drag;
      if (d && d.button === 0) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        d.moved = Math.max(d.moved, Math.hypot(dx, dy));
        if (d.moved > 4) {
          c.classList.add('dragging');
          this.view = { ...this.view, x: d.vx + dx, y: d.vy + dy };
          this.viewChanged();
          return;
        }
      }
      const [x, y] = this.local(e);
      const hit = this.territoryAt(x, y);
      c.classList.toggle('pointing', hit !== null);
      if (hit !== hover) {
        hover = hit;
        this.events.onHover(hit);
      }
    });
    on('pointerup', (e) => {
      c.classList.remove('dragging');
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved > 4) return;
      const [x, y] = this.local(e);
      this.events.onClick(this.territoryAt(x, y), { shift: e.shiftKey, right: d.button === 2 });
    });
    on('pointerleave', () => {
      if (hover !== null) {
        hover = null;
        this.events.onHover(null);
      }
    });
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        const [x, y] = this.local(e);
        const factor = Math.exp(-e.deltaY * 0.0016);
        const scale = Math.min(this.fitScale * 14, Math.max(this.fitScale * 0.9, this.view.scale * factor));
        const k = scale / this.view.scale;
        this.view = { scale, x: x - (x - this.view.x) * k, y: y - (y - this.view.y) * k };
        this.viewChanged();
      },
      { passive: false },
    );
  }
}
