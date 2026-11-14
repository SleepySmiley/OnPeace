/**
 * Stile "Stato maggiore": carta militare da quartier generale. Carta invecchiata con il
 * terreno stampato, griglia di riferimento a lettere e numeri, zone colorate a matita,
 * fronti a inchiostro, segnalini di cartone e frecce di campagna.
 */
import {
  clamp,
  noiseTile,
  placeLabels,
  qPoint,
  rgba,
  routePath,
  screenOf,
  selectionArrows,
  shade,
  toMap,
  toScreen,
  visibleTerritories,
  zoomOf,
  type BoardStyle,
  type PaintEnv,
  type Rect,
} from '../common';

const INK = '#2a2218';
const PAPER = '#ddd3b8';
const SEA = '#b4bfba';
const STENCIL = '"Big Shoulders Stencil Display", "Arial Narrow", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** Macchie larghe della carta vecchia, ancorate alla mappa. */
let stains: HTMLCanvasElement | null = null;
function stainTile(): HTMLCanvasElement {
  if (stains) return stains;
  stains = document.createElement('canvas');
  stains.width = stains.height = 512;
  const g = stains.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 20 + Math.random() * 110;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.random() < 0.5 ? 100 : 150;
    grad.addColorStop(0, `rgba(${v}, ${v - 8}, ${v - 20}, 0.35)`);
    grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
  }
  return stains;
}

/** Tratteggio a matita (due direzioni), per tinta. */
const pencils = new Map<string, HTMLCanvasElement>();
function pencilTile(color: string, dpr: number): HTMLCanvasElement {
  const k = `${color}@${dpr}`;
  let tile = pencils.get(k);
  if (tile) return tile;
  const s = Math.round(9 * dpr);
  tile = document.createElement('canvas');
  tile.width = tile.height = s;
  const g = tile.getContext('2d')!;
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (const [w, a] of [
    [0.9, 1],
    [0.6, 0.55],
  ] as const) {
    g.globalAlpha = a;
    g.lineWidth = w * dpr;
    g.beginPath();
    g.moveTo(-1, s + 1);
    g.lineTo(s + 1, -1);
    g.moveTo(-1 - s, s + 1);
    g.lineTo(1, -1);
    g.moveTo(s - 1, 2 * s + 1);
    g.lineTo(2 * s + 1, s - 1);
    g.stroke();
  }
  pencils.set(k, tile);
  return tile;
}

/** Piccola rotazione fissa per ogni segnalino, come se fossero appoggiati a mano. */
const tilt = (id: string) => ((([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 9) - 4) * Math.PI) / 180;

export const statoMaggiore: BoardStyle = {
  id: 'stato-maggiore',
  name: 'Stato maggiore',
  tagline: 'Carta militare da quartier generale',
  playerColors: ['#3f6aa8', '#a8382f', '#4d7a3d', '#c49a2c', '#6b4c8a', '#c06a2b', '#3c8a8a', '#a54a7a'],
  fonts: [`800 16px ${STENCIL}`, `600 16px ${MONO}`, `500 16px ${MONO}`],

  paintStatic(env: PaintEnv) {
    const { ctx, geo, view, state, dpr, assets } = env;
    const { width: W, height: H } = geo;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const px = 1 / view.scale;
    const z = zoomOf(env);

    // tavolo di legno scuro
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const table = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    table.addColorStop(0, '#2b241b');
    table.addColorStop(1, '#14110d');
    ctx.fillStyle = table;
    ctx.fillRect(0, 0, cw, ch);

    // foglio con ombra sul tavolo
    toMap(env);
    const m = 70;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 30 * dpr;
    ctx.shadowOffsetY = 12 * dpr;
    ctx.fillStyle = PAPER;
    ctx.fillRect(-m, -m, W + 2 * m, H + 2 * m);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    // mare
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, W, H);
    // fascia costiera più scura, come nelle carte stampate
    ctx.lineJoin = 'round';
    for (const [w, a] of [
      [26, 0.08],
      [14, 0.1],
      [6, 0.12],
    ] as const) {
      ctx.lineWidth = w * px;
      ctx.strokeStyle = `rgba(52, 72, 78, ${a})`;
      ctx.stroke(geo.land);
    }
    // terra con il terreno stampato
    ctx.fillStyle = PAPER;
    ctx.fill(geo.land, 'evenodd');
    if (assets.relief) {
      ctx.save();
      ctx.clip(geo.land, 'evenodd');
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.42;
      ctx.drawImage(assets.relief, 0, 0, W, H);
      ctx.restore();
    }

    // zone colorate a matita
    for (const t of geo.board.territories) {
      const color = state.owners.get(t.id);
      if (!color) continue;
      const path = geo.paths.get(t.id)!;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(color, 0.32);
      ctx.fill(path, 'evenodd');
      ctx.clip(path, 'evenodd');
      toScreen(env);
      ctx.fillStyle = ctx.createPattern(pencilTile(rgba(color, 0.55), dpr), 'repeat')!;
      ctx.fillRect(0, 0, cw / dpr, ch / dpr);
      ctx.restore();
      toMap(env);
    }

    // griglia di riferimento: colonne a lettere, righe a numeri
    const cols = 24;
    const rows = 12;
    ctx.lineWidth = px;
    ctx.strokeStyle = 'rgba(70, 52, 30, 0.22)';
    for (let i = 1; i < cols; i++) {
      ctx.beginPath();
      ctx.moveTo((W / cols) * i, 0);
      ctx.lineTo((W / cols) * i, H);
      ctx.stroke();
    }
    for (let j = 1; j < rows; j++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / rows) * j);
      ctx.lineTo(W, (H / rows) * j);
      ctx.stroke();
    }

    // confini: inchiostro sottile, fronti marcati
    ctx.lineCap = 'round';
    for (const b of geo.borders) {
      const front = state.owners.get(b.a) !== state.owners.get(b.b);
      ctx.save();
      if (!front) ctx.setLineDash([4 * px, 3 * px]);
      ctx.lineWidth = (front ? 2.1 : 1) * Math.min(1.6, Math.sqrt(z)) * px;
      ctx.strokeStyle = front ? INK : 'rgba(42, 34, 24, 0.7)';
      ctx.stroke(b.path);
      ctx.restore();
    }
    ctx.lineWidth = 1.1 * px;
    ctx.strokeStyle = INK;
    ctx.stroke(geo.coast);

    // rotte via mare
    for (const route of geo.routes) {
      ctx.setLineDash([7 * px, 5 * px]);
      ctx.lineWidth = 1.4 * px;
      ctx.strokeStyle = 'rgba(42, 34, 24, 0.8)';
      ctx.stroke(routePath(route));
      ctx.setLineDash([]);
      for (const [x, y] of route.ends) {
        ctx.beginPath();
        ctx.arc(x, y, 2.6 * px, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
      }
    }

    // nomi dei continenti a stampino
    for (const c of geo.board.continents) {
      if (!c.label) continue;
      const [x, y] = c.label;
      const size = 120;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${size}px ${STENCIL}`;
      ctx.letterSpacing = `${size * 0.18}px`;
      ctx.fillStyle = 'rgba(42, 34, 24, 0.42)';
      ctx.fillText(c.name.toUpperCase(), x + size * 0.09, y);
      ctx.font = `600 ${size * 0.34}px ${MONO}`;
      ctx.letterSpacing = `${size * 0.04}px`;
      ctx.fillStyle = 'rgba(42, 34, 24, 0.6)';
      ctx.fillText(`BONUS +${c.bonus} ARMATE`, x, y + size * 0.9);
      ctx.letterSpacing = '0px';
    }

    // timbro
    if (geo.board.compass) {
      const [x, y] = geo.board.compass;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.12);
      ctx.strokeStyle = 'rgba(150, 32, 36, 0.5)';
      ctx.fillStyle = 'rgba(150, 32, 36, 0.5)';
      ctx.lineWidth = 7;
      ctx.strokeRect(-330, -80, 660, 160);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-312, -62, 624, 124);
      ctx.font = `800 96px ${STENCIL}`;
      ctx.letterSpacing = '16px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RISERVATO', 8, 4);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }
    ctx.restore();

    // carta: grana e macchie
    ctx.save();
    ctx.beginPath();
    ctx.rect(-m, -m, W + 2 * m, H + 2 * m);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    const stainPattern = ctx.createPattern(stainTile(), 'repeat')!;
    stainPattern.setTransform(new DOMMatrix().scale(4));
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = stainPattern;
    ctx.fillRect(-m, -m, W + 2 * m, H + 2 * m);
    toScreen(env);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = ctx.createPattern(noiseTile(220, 90, 'carta'), 'repeat')!;
    ctx.fillRect(0, 0, cw / dpr, ch / dpr);
    ctx.restore();

    // cornice con lettere e numeri della griglia
    toMap(env);
    ctx.lineWidth = 2.4 * px;
    ctx.strokeStyle = INK;
    ctx.strokeRect(0, 0, W, H);
    ctx.lineWidth = px;
    ctx.strokeRect(-24, -24, W + 48, H + 48);
    toScreen(env);
    ctx.font = `800 ${clamp(12 * Math.sqrt(z), 11, 16)}px ${STENCIL}`;
    ctx.fillStyle = 'rgba(42, 34, 24, 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < cols; i++) {
      const [sx, sy] = screenOf(env, [(W / cols) * (i + 0.5), -12]);
      ctx.fillText(String.fromCharCode(65 + i), sx, sy);
    }
    for (let j = 0; j < rows; j++) {
      const [sx, sy] = screenOf(env, [-12, (H / rows) * (j + 0.5)]);
      ctx.fillText(String(j + 1), sx, sy);
    }
  },

  paintOverlay(env: PaintEnv) {
    const { ctx, geo, view, state } = env;
    const z = zoomOf(env);
    const px = 1 / view.scale;
    const colorOf = (id: string) => state.owners.get(id) ?? '#777777';

    toMap(env);
    if (state.hover && state.hover !== state.selected) {
      ctx.lineWidth = 2.2 * px;
      ctx.strokeStyle = INK;
      ctx.stroke(geo.paths.get(state.hover)!);
    }
    if (state.selected) {
      const path = geo.paths.get(state.selected)!;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(colorOf(state.selected), 0.35);
      ctx.fill(path, 'evenodd');
      ctx.restore();
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = INK;
      ctx.stroke(path);
    }

    // frecce di campagna: piene verso i nemici, a contorno verso i propri
    toScreen(env);
    const size = clamp(24 + (z - 1) * 3, 24, 38);
    const mine = state.selected ? colorOf(state.selected) : INK;
    for (const { enemy, shape } of selectionArrows(env, size * 0.75, 0.22)) {
      // corpo affusolato: da stretto a largo verso la punta
      const steps = 24;
      const left: [number, number][] = [];
      const right: [number, number][] = [];
      const headLen = Math.min(26, shape.length * 0.35);
      const tEnd = 1 - headLen / Math.max(1, shape.length);
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * tEnd;
        const p = qPoint(shape, t);
        const q = qPoint(shape, Math.min(1, t + 0.01));
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const l = Math.hypot(dx, dy) || 1;
        const w = 2 + 5.5 * (t / tEnd);
        left.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]);
        right.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w]);
      }
      const base = qPoint(shape, tEnd);
      const [hx, hy] = shape.dir;
      const hw = 14;
      const poly = new Path2D();
      poly.moveTo(left[0]![0], left[0]![1]);
      for (const p of left) poly.lineTo(p[0], p[1]);
      poly.lineTo(base[0] - hy * hw, base[1] + hx * hw);
      poly.lineTo(shape.to[0], shape.to[1]);
      poly.lineTo(base[0] + hy * hw, base[1] - hx * hw);
      for (const p of [...right].reverse()) poly.lineTo(p[0], p[1]);
      poly.closePath();
      ctx.save();
      ctx.lineJoin = 'round';
      if (enemy) {
        ctx.shadowColor = 'rgba(30, 20, 10, 0.35)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = rgba(mine, 0.9);
        ctx.fill(poly);
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = INK;
        ctx.stroke(poly);
      } else {
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = INK;
        ctx.stroke(poly);
      }
      ctx.restore();
    }

    // segnalini di cartone: simbolo della fanteria e forza
    const taken: Rect[] = [];
    for (const t of visibleTerritories(env)) {
      const [x, y] = screenOf(env, t.anchor);
      const color = colorOf(t.id);
      const active = t.id === state.selected || t.id === state.hover;
      taken.push([x - size / 2 - 2, y - size / 2 - 2, x + size / 2 + 2, y + size / 2 + 2]);
      ctx.save();
      ctx.translate(x, y - (active ? 2 : 0));
      ctx.rotate(tilt(t.id));
      ctx.shadowColor = 'rgba(25, 18, 8, 0.55)';
      ctx.shadowBlur = active ? 8 : 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = active ? 4 : 2;
      ctx.fillStyle = shade(color, -0.05);
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.shadowColor = 'transparent';
      // bordo del cartone
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.strokeRect(-size / 2 + 0.5, -size / 2 + 0.5, size - 1, size - 1);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.strokeRect(-size / 2 + 1.5, -size / 2 + 1.5, size - 3, size - 3);
      // simbolo
      const sw = size * 0.56;
      const sh = size * 0.34;
      const sx = -sw / 2;
      const sy = -size * 0.36;
      ctx.fillStyle = '#efe7d0';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + sw, sy + sh);
      ctx.moveTo(sx + sw, sy);
      ctx.lineTo(sx, sy + sh);
      ctx.stroke();
      // forza
      ctx.font = `800 ${size * 0.44}px ${STENCIL}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f5efdc';
      ctx.fillText(String(state.armies.get(t.id) ?? 0), 0, size * 0.24);
      ctx.restore();
    }

    placeLabels(env, taken, {
      font: `600 ${clamp(9.5 + (z - 1) * 0.8, 9.5, 12.5)}px ${MONO}`,
      size: clamp(9.5 + (z - 1) * 0.8, 9.5, 12.5),
      offsetY: size / 2 + 5,
      text: (n) => n.toUpperCase(),
      letterSpacing: 0.4,
      draw: (text, x, y, active) => {
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = 'rgba(221, 211, 184, 0.92)';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = active ? '#000000' : INK;
        ctx.fillText(text, x, y);
      },
    });
  },
};
