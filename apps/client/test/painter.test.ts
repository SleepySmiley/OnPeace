/**
 * Il pittore del tabellone senza browser: canvas, osservatore e fotogrammi finti, quanto basta per
 * provare camera, trascinamento, clic e ridimensionamento. E il velo sui confinanti dello stile classico.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardState, BoardStyle, BoardView, PaintEnv } from '../src/board/common';
import type { BoardGeometry } from '../src/board/geometry';
import { loadRelief } from '../src/board/imagery';
import { BoardPainter } from '../src/board/painter';
import { classico } from '../src/board/styles/classico';

vi.mock('../src/board/imagery', () => ({ loadRelief: vi.fn(async () => null) }));

const { FakePath } = vi.hoisted(() => {
  class FakePath {
    moveTo() {}
    lineTo() {}
    closePath() {}
    arc() {}
    roundRect() {}
    quadraticCurveTo() {}
    addPath() {}
  }
  // i carri (tanks.ts) fanno i loro percorsi appena caricati
  (globalThis as { Path2D?: unknown }).Path2D = FakePath;
  return { FakePath };
});

/** Contesto 2D che non disegna niente; `fill` si può spiare. */
function fakeContext(canvas: unknown, onFill?: (style: string, path: unknown) => void) {
  const t: Record<string | symbol, unknown> = { canvas };
  return new Proxy(t, {
    get(target, k) {
      if (k in target) return target[k];
      if (k === 'fill') return (path: unknown) => onFill?.(String(target.fillStyle), path);
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'isPointInPath') return () => true;
      if (typeof k === 'string' && k.startsWith('create')) return () => ({ addColorStop() {}, setTransform() {} });
      return () => undefined;
    },
    set(target, k, v) {
      target[k] = v;
      return true;
    },
  });
}

type Handler = (e: Record<string, unknown>) => void;

function fakeCanvas(w = 1000, h = 600) {
  const listeners = new Map<string, Handler>();
  const classes = new Set<string>();
  const captured = new Set<number>();
  const canvas = {
    width: 300,
    height: 150,
    clientWidth: w,
    clientHeight: h,
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
    },
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    // come nel browser: rilasciare la cattura manda lostpointercapture
    releasePointerCapture: (id: number) => {
      if (captured.delete(id)) listeners.get('lostpointercapture')?.({ pointerId: id });
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    getContext: () => fakeContext(canvas),
  };
  const fire = (type: string, e: Record<string, unknown> = {}) => listeners.get(type)?.({ pointerId: 1, shiftKey: false, ...e });
  return { canvas, classes, captured, fire };
}

let clock = 0;
let rafId = 0;
const rafs = new Map<number, (now: number) => void>();
let observed: { cb: () => void; box?: string } | null = null;
let deviceBox = true;
let nowSpy: { mockRestore(): void } | null = null;

function frames(n: number) {
  for (let i = 0; i < n; i++) {
    clock += 16;
    vi.advanceTimersByTime(16);
    const list = [...rafs.values()];
    rafs.clear();
    for (const f of list) f(clock);
  }
}

beforeEach(() => {
  clock = 1000;
  rafs.clear();
  observed = null;
  deviceBox = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('document', { createElement: () => fakeCanvas().canvas, fonts: { load: async () => [] } });
  vi.stubGlobal('requestAnimationFrame', (f: (now: number) => void) => {
    rafs.set(++rafId, f);
    return rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafs.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly cb: () => void) {}
      observe(_el: unknown, opts?: { box?: string }) {
        if (opts?.box === 'device-pixel-content-box' && !deviceBox) throw new TypeError('box non supportato');
        observed = { cb: this.cb, box: opts?.box };
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  nowSpy?.mockRestore();
});

const board = () => ({
  id: 'prova',
  width: 2000,
  height: 1000,
  territories: [{ id: 'a', name: 'A', continent: 'europa', anchor: [400, 300] }],
  continents: [],
});

const geometry = (def = board()) =>
  ({
    board: def,
    width: 2000,
    height: 1000,
    paths: new Map([['a', new FakePath()]]),
    boxes: new Map([['a', [0, 0, 2000, 1000]]]),
    continentOf: new Map(),
    neighbours: new Map(),
    borders: [],
    routes: [],
  }) as unknown as BoardGeometry;

const state: BoardState = { owners: new Map(), armies: new Map(), hover: null, selected: null, arrows: null };

function setup(geo = geometry()) {
  const fake = fakeCanvas();
  const painted = { static: 0 };
  const style: BoardStyle = {
    id: 'prova',
    name: 'prova',
    tagline: '',
    playerColors: [],
    fonts: [],
    paintStatic: () => void painted.static++,
    paintOverlay: () => undefined,
  };
  const onClick = vi.fn();
  const p = new BoardPainter(fake.canvas as unknown as HTMLCanvasElement, geo, style, state, { onHover: () => undefined, onClick });
  return { p, onClick, painted, ...fake };
}

function expectView(a: BoardView, b: BoardView) {
  expect(a.scale).toBeCloseTo(b.scale, 6);
  expect(a.x).toBeCloseTo(b.x, 4);
  expect(a.y).toBeCloseTo(b.y, 4);
}

// vista d'insieme di un canvas 1000×600 per un tabellone 2000×1000: scala 0,47, margini 30 e 65
const FIT: BoardView = { scale: 0.47, x: 30, y: 65 };
const CLOSE: BoardView = { scale: 1.88, x: -900, y: -400 };

describe('camera del tabellone', () => {
  it('restingView: durante il volo dà l’arrivo, poi la vista ferma', async () => {
    const { p } = setup();
    expectView(p.restingView(), FIT);
    const flown = p.flyTo(CLOSE, 600);
    frames(10);
    expect(p.restingView()).toEqual(CLOSE);
    expect(p.currentView().scale).toBeLessThan(CLOSE.scale);
    frames(30);
    await flown;
    expectView(p.currentView(), CLOSE);
    expect(p.restingView()).toEqual(p.currentView());
  });

  it('un volo nuovo prende il posto di quello in corso, anche per restingView', () => {
    const { p } = setup();
    let first = false;
    void p.flyTo(CLOSE, 600).then(() => (first = true));
    frames(5);
    void p.flyTo(FIT, 600);
    expect(p.restingView()).toEqual(FIT);
    frames(60);
    expectView(p.currentView(), FIT);
    expect(first).toBe(false);
  });

  it('flyTo chiude un trascinamento in corso e arriva lo stesso', async () => {
    const { p, fire, classes, captured, onClick } = setup();
    fire('pointerdown', { button: 0, clientX: 500, clientY: 300 });
    fire('pointermove', { buttons: 1, clientX: 560, clientY: 330 });
    expect(classes.has('dragging')).toBe(true);
    const flown = p.flyTo(CLOSE, 300);
    expect(classes.has('dragging')).toBe(false);
    expect(captured.size).toBe(0);
    // il tasto è ancora giù: la mappa non segue più il puntatore
    fire('pointermove', { buttons: 1, clientX: 700, clientY: 400 });
    frames(25);
    await flown;
    expectView(p.currentView(), CLOSE);
    fire('pointerup', { button: 0, clientX: 700, clientY: 400 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('un clic durante il volo non lo ferma', async () => {
    const { p, fire, onClick } = setup();
    const flown = p.flyTo(CLOSE, 760);
    frames(40);
    fire('pointerdown', { button: 0, clientX: 500, clientY: 300 });
    frames(3);
    fire('pointerup', { button: 0, clientX: 500, clientY: 300 });
    expect(onClick).toHaveBeenCalledOnce();
    frames(20);
    await flown;
    expectView(p.currentView(), CLOSE);
  });

  it('trascinare davvero durante il volo lo ferma, e la mappa parte da dove era arrivata', async () => {
    const { p, fire } = setup();
    let resolved = false;
    void p.flyTo(CLOSE, 600).then(() => (resolved = true));
    frames(15);
    fire('pointerdown', { button: 0, clientX: 500, clientY: 300 });
    frames(3);
    const reached = p.currentView();
    fire('pointermove', { buttons: 1, clientX: 510, clientY: 300 });
    await Promise.resolve();
    expect(resolved).toBe(true);
    expectView(p.currentView(), reached);
    expect(p.restingView()).toEqual(p.currentView());
    fire('pointermove', { buttons: 1, clientX: 530, clientY: 290 });
    expect(p.currentView().x).toBeCloseTo(reached.x + 20, 6);
    expect(p.currentView().y).toBeCloseTo(reached.y - 10, 6);
    frames(30);
    expect(p.currentView().x).toBeCloseTo(reached.x + 20, 6);
  });
});

describe('trascinamento e clic', () => {
  it('pointercancel e lostpointercapture chiudono il trascinamento, senza clic', () => {
    for (const ending of ['pointercancel', 'lostpointercapture']) {
      const { p, fire, classes, onClick } = setup();
      fire('pointerdown', { button: 0, clientX: 500, clientY: 300 });
      fire('pointermove', { buttons: 1, clientX: 540, clientY: 300 });
      const v = p.currentView();
      fire(ending);
      expect(classes.has('dragging')).toBe(false);
      fire('pointermove', { buttons: 1, clientX: 640, clientY: 300 });
      expect(p.currentView()).toEqual(v);
      fire('pointerup', { button: 0, clientX: 640, clientY: 300 });
      expect(onClick).not.toHaveBeenCalled();
      p.destroy();
    }
  });

  it('tasto lasciato fuori dalla finestra: la mappa non segue il puntatore e la camera vola', async () => {
    const { p, fire, classes } = setup();
    fire('pointerdown', { button: 0, clientX: 500, clientY: 300 });
    fire('pointermove', { buttons: 1, clientX: 540, clientY: 300 });
    const v = p.currentView();
    fire('pointermove', { buttons: 0, clientX: 740, clientY: 400 });
    expect(p.currentView()).toEqual(v);
    expect(classes.has('dragging')).toBe(false);
    const flown = p.flyTo(CLOSE, 300);
    frames(25);
    await flown;
    expectView(p.currentView(), CLOSE);
  });

  it('rotella e tasti laterali non fanno clic; il destro trascinato non è un clic destro', () => {
    const { p, fire, onClick, captured } = setup();
    for (const button of [1, 3, 4]) {
      fire('pointerdown', { button, clientX: 500, clientY: 300 });
      fire('pointerup', { button, clientX: 500, clientY: 300 });
    }
    expect(captured.size).toBe(0);
    expect(onClick).not.toHaveBeenCalled();
    const v = p.currentView();
    fire('pointerdown', { button: 2, clientX: 500, clientY: 300 });
    fire('pointermove', { buttons: 2, clientX: 600, clientY: 300 });
    fire('pointerup', { button: 2, clientX: 600, clientY: 300 });
    expect(onClick).not.toHaveBeenCalled();
    expect(p.currentView()).toEqual(v);
    fire('pointerdown', { button: 2, clientX: 500, clientY: 300 });
    fire('pointerup', { button: 2, clientX: 500, clientY: 300 });
    expect(onClick).toHaveBeenCalledWith('a', { shift: false, right: true });
  });

  it('trascinando da un territorio la manina lascia il posto al pugno chiuso', () => {
    const { fire, classes } = setup();
    fire('pointermove', { buttons: 0, clientX: 500, clientY: 300 });
    expect(classes.has('pointing')).toBe(true);
    fire('pointerdown', { button: 0, clientX: 500, clientY: 300 });
    fire('pointermove', { buttons: 1, clientX: 520, clientY: 300 });
    expect(classes.has('dragging')).toBe(true);
    expect(classes.has('pointing')).toBe(false);
  });
});

describe('ridimensionamento', () => {
  it('osserva i pixel del dispositivo, o quelli CSS dove non si può', () => {
    setup();
    expect(observed?.box).toBe('device-pixel-content-box');
    deviceBox = false;
    setup();
    expect(observed?.box).toBeUndefined();
  });

  it('il primo avviso dell’osservatore, con la stessa misura, non ridisegna niente', () => {
    const { painted } = setup();
    const before = painted.static;
    observed!.cb();
    expect(painted.static).toBe(before);
  });

  it('a vista d’insieme si rifà nella misura nuova', () => {
    const { p, canvas } = setup();
    canvas.clientWidth = 1200;
    observed!.cb();
    expectView(p.currentView(), { scale: 0.54, x: 60, y: 30 });
    expect(canvas.width).toBe(1200);
  });

  it('ingrandita resta allo stesso zoom, con lo stesso punto della mappa al centro', () => {
    const { p, canvas, fire } = setup();
    fire('wheel', { preventDefault() {}, clientX: 300, clientY: 200, deltaY: -500 });
    const v = p.currentView();
    const mid = [(500 - v.x) / v.scale, (300 - v.y) / v.scale];
    canvas.clientWidth = 1200;
    canvas.clientHeight = 700;
    observed!.cb();
    const n = p.currentView();
    // vista d'insieme nuova: scala min(1140/2000, 640/1000) = 0,57
    expect(n.scale / 0.57).toBeCloseTo(v.scale / FIT.scale, 6);
    expect((600 - n.x) / n.scale).toBeCloseTo(mid[0]!, 4);
    expect((350 - n.y) / n.scale).toBeCloseTo(mid[1]!, 4);
  });

  it('cambia solo la densità dei pixel: canvas più fitto, vista uguale', () => {
    const { p, canvas, fire, painted } = setup();
    fire('wheel', { preventDefault() {}, clientX: 300, clientY: 200, deltaY: -500 });
    const v = p.currentView();
    const before = painted.static;
    vi.stubGlobal('devicePixelRatio', 2);
    observed!.cb();
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1200);
    expect(p.currentView()).toEqual(v);
    expect(painted.static).toBe(before + 1);
  });
});

describe('immagini per versione del tabellone', () => {
  it('il terreno si carica una volta per oggetto tabellone, non per id', () => {
    const calls = () => vi.mocked(loadRelief).mock.calls.length;
    const start = calls();
    const geo = geometry();
    setup(geo).p.destroy();
    setup(geo).p.destroy();
    expect(calls()).toBe(start + 1);
    // stesso id, versione nuova dal server
    setup(geometry()).p.destroy();
    expect(calls()).toBe(start + 2);
  });
});

describe('stile classico: velo sui confinanti del territorio scelto', () => {
  const VEIL = 'rgba(255, 255, 255, 0.16)';
  const veiled = (arrows: BoardState['arrows']) => {
    const out: string[] = [];
    const ids = ['mio', 'nemico1', 'nemico2'];
    const paths = new Map(ids.map((id) => [id, Object.assign(new FakePath(), { id })]));
    const ctx = fakeContext({ width: 1000, height: 600 }, (style, path) => {
      if (style === VEIL) out.push((path as { id: string }).id);
    });
    const geo = {
      board: { id: 'x', territories: ids.map((id, i) => ({ id, name: id, continent: 'europa', anchor: [100 + i * 300, 100] })), continents: [] },
      width: 1000,
      height: 600,
      paths,
      boxes: new Map(ids.map((id, i) => [id, [i * 300, 0, i * 300 + 250, 250]])),
      neighbours: new Map([
        ['mio', ['nemico1', 'nemico2']],
        ['nemico1', ['mio']],
        ['nemico2', ['mio']],
      ]),
      borders: [],
      routes: [],
    };
    const st: BoardState = { owners: new Map(), armies: new Map(), hover: null, selected: 'mio', tokens: false };
    if (arrows !== undefined) st.arrows = arrows;
    classico.paintOverlay({ ctx, geo, view: { scale: 1, x: 0, y: 0 }, state: st, dpr: 1, fit: 1, assets: { relief: null } } as unknown as PaintEnv);
    return out;
  };

  it('null (nessuna freccia, per esempio nei rinforzi): nessun confinante', () => {
    expect(veiled(null)).toEqual([]);
  });

  it('frecce date: solo i loro bersagli; senza frecce (pagina di prova): tutti i confinanti', () => {
    expect(veiled({ to: ['nemico1'], kind: 'attack' })).toEqual(['nemico1']);
    expect(veiled(undefined)).toEqual(['nemico1', 'nemico2']);
  });
});
