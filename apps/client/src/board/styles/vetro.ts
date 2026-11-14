/**
 * Stile "Vetro": pulito e scuro, qualità da prodotto. Territori pieni e luminosi in leggero
 * rilievo sul mare grafite, terreno appena accennato, pedine rotonde con ombra morbida,
 * messa a fuoco del territorio selezionato (il resto si spegne).
 */
import {
  clamp,
  luminance,
  placeLabels,
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

const FONT = '"Geist", system-ui, sans-serif';

export const vetro: BoardStyle = {
  id: 'vetro',
  name: 'Vetro',
  tagline: 'Pulito, scuro, qualità da prodotto',
  playerColors: ['#0a84ff', '#ff453a', '#30d158', '#ffd60a', '#bf5af2', '#ff9f0a', '#64d2ff', '#ff375f'],
  fonts: [`700 16px ${FONT}`, `600 16px ${FONT}`, `500 16px ${FONT}`],

  paintStatic(env: PaintEnv) {
    const { ctx, geo, view, state, dpr, assets } = env;
    const { width: W, height: H } = geo;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const px = 1 / view.scale;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createRadialGradient(cw / 2, ch * 0.42, 0, cw / 2, ch * 0.42, Math.max(cw, ch) * 0.8);
    bg.addColorStop(0, '#16181e');
    bg.addColorStop(1, '#08090c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    // puntini discreti sul mare, fissi sullo schermo
    toScreen(env);
    const gap = 16;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    const ox = ((view.x % gap) + gap) % gap;
    const oy = ((view.y % gap) + gap) % gap;
    for (let x = ox; x < cw / dpr; x += gap) for (let y = oy; y < ch / dpr; y += gap) ctx.fillRect(x, y, 1.2, 1.2);

    toMap(env);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-W * 0.02, 0, W * 1.04, H);
    ctx.clip();
    // terre in rilievo: ombra morbida sul mare
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 26 * dpr;
    ctx.shadowOffsetY = 9 * dpr;
    ctx.fillStyle = '#2a2d33';
    ctx.fill(geo.land, 'evenodd');
    ctx.restore();

    // territori: colore pieno con una luce dall'alto
    for (const t of geo.board.territories) {
      const color = state.owners.get(t.id) ?? '#3a3d44';
      const path = geo.paths.get(t.id)!;
      const [, y0, , y1] = geo.boxes.get(t.id)!;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, shade(color, 0.1));
      g.addColorStop(1, shade(color, -0.16));
      ctx.fillStyle = g;
      ctx.fill(path, 'evenodd');
    }
    if (assets.relief) {
      ctx.save();
      ctx.clip(geo.land, 'evenodd');
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.38;
      ctx.drawImage(assets.relief, 0, 0, W, H);
      ctx.restore();
    }

    // confini: solco scuro e filo di luce
    ctx.lineJoin = 'round';
    for (const b of geo.borders) {
      ctx.lineWidth = 1.6 * px;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.stroke(b.path);
      ctx.lineWidth = 0.6 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.stroke(b.path);
    }
    // bordo di luce lungo le coste, solo all'interno
    ctx.save();
    ctx.clip(geo.land, 'evenodd');
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke(geo.coast);
    ctx.restore();

    // rotte via mare: puntini
    ctx.lineCap = 'round';
    for (const route of geo.routes) {
      ctx.setLineDash([0.01, 6 * px]);
      ctx.lineWidth = 2.2 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.stroke(routePath(route));
      ctx.setLineDash([]);
    }

    // continenti
    for (const c of geo.board.continents) {
      if (!c.label) continue;
      const [x, y] = c.label;
      const size = 96;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${size}px ${FONT}`;
      ctx.letterSpacing = `${-size * 0.02}px`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.17)';
      ctx.fillText(c.name, x, y);
      ctx.font = `500 ${size * 0.4}px ${FONT}`;
      ctx.letterSpacing = '0px';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.fillText(`Bonus +${c.bonus}`, x, y + size * 0.85);
    }
    ctx.restore();
  },

  paintOverlay(env: PaintEnv) {
    const { ctx, geo, view, state, dpr } = env;
    const z = zoomOf(env);
    const px = 1 / view.scale;
    const colorOf = (id: string) => state.owners.get(id) ?? '#3a3d44';

    toMap(env);
    if (state.selected) {
      // messa a fuoco: si spegne tutto tranne il territorio e i suoi confinanti
      const focus = new Set([state.selected, ...(geo.neighbours.get(state.selected) ?? [])]);
      ctx.fillStyle = 'rgba(6, 7, 10, 0.5)';
      for (const t of geo.board.territories) if (!focus.has(t.id)) ctx.fill(geo.paths.get(t.id)!, 'evenodd');
      ctx.save();
      ctx.shadowColor = rgba(colorOf(state.selected), 0.9);
      ctx.shadowBlur = 22 * dpr;
      ctx.lineWidth = 2.2 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.stroke(geo.paths.get(state.selected)!);
      ctx.restore();
    }
    if (state.hover && state.hover !== state.selected) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fill(geo.paths.get(state.hover)!, 'evenodd');
      ctx.restore();
      ctx.lineWidth = 1.4 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke(geo.paths.get(state.hover)!);
    }

    toScreen(env);
    const r = clamp(11 + (z - 1) * 1.4, 11, 16);
    // frecce morbide
    const mine = state.selected ? colorOf(state.selected) : '#ffffff';
    for (const { enemy, shape } of selectionArrows(env, r + 6, 0.2)) {
      const head = enemy ? 11 : 8;
      const base: [number, number] = [shape.to[0] - shape.dir[0] * head * 0.8, shape.to[1] - shape.dir[1] * head * 0.8];
      const body = new Path2D();
      body.moveTo(shape.from[0], shape.from[1]);
      body.quadraticCurveTo(shape.ctrl[0], shape.ctrl[1], base[0], base[1]);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const g = ctx.createLinearGradient(shape.from[0], shape.from[1], shape.to[0], shape.to[1]);
      g.addColorStop(0, enemy ? rgba(mine, 0.15) : 'rgba(255, 255, 255, 0.1)');
      g.addColorStop(1, enemy ? mine : 'rgba(255, 255, 255, 0.75)');
      if (enemy) {
        ctx.shadowColor = rgba(mine, 0.8);
        ctx.shadowBlur = 12;
      }
      ctx.lineWidth = enemy ? 4 : 2;
      ctx.strokeStyle = g;
      ctx.stroke(body);
      const [hx, hy] = shape.dir;
      ctx.beginPath();
      ctx.moveTo(shape.to[0], shape.to[1]);
      ctx.lineTo(shape.to[0] - hx * head - hy * head * 0.62, shape.to[1] - hy * head + hx * head * 0.62);
      ctx.lineTo(shape.to[0] - hx * head + hy * head * 0.62, shape.to[1] - hy * head - hx * head * 0.62);
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = enemy ? mine : 'rgba(255, 255, 255, 0.75)';
      ctx.fillStyle = enemy ? mine : 'rgba(255, 255, 255, 0.75)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // pedine rotonde
    const taken: Rect[] = [];
    for (const t of visibleTerritories(env)) {
      const [x, y] = screenOf(env, t.anchor);
      const color = colorOf(t.id);
      const active = t.id === state.selected || t.id === state.hover;
      const rr = active ? r + 1.5 : r;
      taken.push([x - rr - 2, y - rr - 2, x + rr + 2, y + rr + 2]);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = active ? 16 : 10;
      ctx.shadowOffsetY = active ? 6 : 3;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(x, y - rr, x, y + rr);
      g.addColorStop(0, shade(color, 0.18));
      g.addColorStop(1, shade(color, -0.12));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, rr - 0.75, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
      ctx.font = `700 ${rr * 1.02}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = luminance(color) > 0.5 ? '#111214' : '#ffffff';
      ctx.fillText(String(state.armies.get(t.id) ?? 0), x, y + rr * 0.06);
    }

    const fs = clamp(11 + (z - 1) * 0.9, 11, 14);
    placeLabels(env, taken, {
      font: `600 ${fs}px ${FONT}`,
      size: fs,
      offsetY: r + 5,
      letterSpacing: -0.1,
      draw: (text, x, y, active) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = active ? '#ffffff' : 'rgba(255, 255, 255, 0.92)';
        ctx.fillText(text, x, y);
        ctx.restore();
      },
    });
  },
};
