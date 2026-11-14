/**
 * Stile "Vetro": pulito e scuro, qualità da prodotto. Territori pieni e luminosi in leggero
 * rilievo sul mare grafite, terreno appena accennato, carri armati con ombra morbida,
 * messa a fuoco del territorio selezionato (il resto si spegne).
 */
import { drawTankToken, type TankTheme } from '../tanks';
import {
  actionable,
  clamp,
  flashLevel,
  mix,
  pendingBadge,
  placeLabels,
  pulseLevel,
  rgba,
  routePath,
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
import { CONTINENT } from './classico';

const FONT = '"Geist", system-ui, sans-serif';

/** Territori ancora liberi (scelta a turno): le tinte dei continenti dell'atlante, scure e spente. */
const FREE = Object.fromEntries(Object.entries(CONTINENT).map(([id, c]) => [id, mix(c, '#2a2d33', 0.58)]));

/** Carri sul vetro: contorno chiaro, cingoli quasi neri, ombra scura (i territori sono del colore del padrone). */
const TANK_THEME: TankTheme = {
  line: 'rgba(255, 255, 255, 0.85)',
  track: '#15171c',
  wheel: '#5d6068',
  deepShadow: true,
  font: FONT,
};

export const vetro: BoardStyle = {
  id: 'vetro',
  name: 'Vetro',
  tagline: 'Pulito, scuro, qualità da prodotto',
  playerColors: ['#0a84ff', '#ff453a', '#30d158', '#ffd60a', '#bf5af2', '#ff9f0a', '#64d2ff', '#ff375f'],
  fonts: [`700 16px ${FONT}`, `600 16px ${FONT}`, `500 16px ${FONT}`],
  ownersInStatic: true,

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

    // territori: colore pieno con una luce dall'alto; i liberi nella tinta scura del loro continente
    for (const t of geo.board.territories) {
      const color = state.owners.get(t.id) ?? FREE[t.continent] ?? '#3a3d44';
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
    // pagina di prova del tabellone, col territorio scelto: si spegne tutto tranne lui e i suoi confinanti
    if (state.selected && state.arrows === undefined) {
      const focus = new Set([state.selected, ...(geo.neighbours.get(state.selected) ?? [])]);
      ctx.fillStyle = 'rgba(6, 7, 10, 0.5)';
      for (const t of geo.board.territories) if (!focus.has(t.id)) ctx.fill(geo.paths.get(t.id)!, 'evenodd');
    }
    // su cosa si può agire adesso: contorno bianco su un solco scuro, che pulsa (non si spegne niente)
    const now = performance.now();
    const lit = actionable(state);
    if (lit.length > 0) {
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.4 + 0.6 * pulseLevel(now);
      ctx.lineWidth = 4 * px;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      for (const id of lit) ctx.stroke(geo.paths.get(id)!);
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = '#ffffff';
      for (const id of lit) ctx.stroke(geo.paths.get(id)!);
      ctx.globalAlpha = 1;
    }
    for (const id of state.flashes?.keys() ?? []) {
      const k = flashLevel(state, id, now);
      if (k <= 0) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 255, 255, ${0.42 * k})`;
      ctx.fill(geo.paths.get(id)!, 'evenodd');
      ctx.restore();
    }
    if (state.target && geo.paths.has(state.target)) {
      ctx.save();
      ctx.shadowColor = rgba(colorOf(state.selected ?? state.target), 0.9);
      ctx.shadowBlur = 16 * dpr;
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.stroke(geo.paths.get(state.target)!);
      ctx.restore();
    }
    if (state.selected) {
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
    // frecce: d'attacco chiare con un bordo scuro (col colore di chi attacca, sul suo territorio non si vedrebbero), di spostamento sottili
    for (const { enemy, chosen, shape } of selectionArrows(env, r + 6, 0.2)) {
      const head = enemy ? (chosen ? 13 : 11) : chosen ? 10 : 8;
      const base: [number, number] = [shape.to[0] - shape.dir[0] * head * 0.8, shape.to[1] - shape.dir[1] * head * 0.8];
      const body = new Path2D();
      body.moveTo(shape.from[0], shape.from[1]);
      body.quadraticCurveTo(shape.ctrl[0], shape.ctrl[1], base[0], base[1]);
      const [hx, hy] = shape.dir;
      const tip = new Path2D();
      tip.moveTo(shape.to[0], shape.to[1]);
      tip.lineTo(shape.to[0] - hx * head - hy * head * 0.62, shape.to[1] - hy * head + hx * head * 0.62);
      tip.lineTo(shape.to[0] - hx * head + hy * head * 0.62, shape.to[1] - hy * head - hx * head * 0.62);
      tip.closePath();
      ctx.save();
      // scelto il bersaglio, le altre frecce passano in secondo piano
      if (state.target && !chosen) ctx.globalAlpha = 0.35;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const width = enemy ? (chosen ? 5.5 : 4) : chosen ? 3 : 2;
      if (enemy) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 6;
        ctx.lineWidth = width + 3.5;
        ctx.strokeStyle = 'rgba(10, 11, 14, 0.72)';
        ctx.stroke(body);
        ctx.lineWidth = 5.5;
        ctx.stroke(tip);
        ctx.fillStyle = 'rgba(10, 11, 14, 0.72)';
        ctx.fill(tip);
        ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
        ctx.shadowBlur = 10;
      }
      const g = ctx.createLinearGradient(shape.from[0], shape.from[1], shape.to[0], shape.to[1]);
      g.addColorStop(0, enemy ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.1)');
      g.addColorStop(1, enemy ? '#ffffff' : 'rgba(255, 255, 255, 0.75)');
      ctx.lineWidth = width;
      ctx.strokeStyle = g;
      ctx.stroke(body);
      ctx.lineWidth = enemy ? 1.5 : 2;
      ctx.strokeStyle = enemy ? '#ffffff' : 'rgba(255, 255, 255, 0.75)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill(tip);
      ctx.stroke(tip);
      ctx.restore();
    }

    // pedine: carri armati col numero sulla fiancata
    const taken: Rect[] = [];
    for (const t of state.tokens === false ? [] : visibleTerritories(env)) {
      if (!state.armies.has(t.id)) continue; // ancora libero: nessuna pedina
      if (state.hidden?.has(t.id)) continue; // ci sono i carri della battaglia
      const active = t.id === state.selected || t.id === state.hover;
      const box = drawTankToken(env, t.id, state.armies.get(t.id) ?? 0, colorOf(t.id), r, active, TANK_THEME);
      taken.push(box);
      const add = state.pending?.get(t.id);
      if (add) pendingBadge(env, box[2] - 4, box[1] - 2, add, { font: `700 11px ${FONT}`, fill: '#ffffff', ink: '#111214', edge: 'rgba(0, 0, 0, 0.2)' });
    }

    const fs = clamp(11 + (z - 1) * 0.9, 11, 14);
    placeLabels(env, taken, {
      font: `600 ${fs}px ${FONT}`,
      size: fs,
      offsetY: r * 1.55 + 5,
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
