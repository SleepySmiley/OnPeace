/**
 * Stile "Plastico": il plastico in rilievo delle sale di comando. I territori sono lastre
 * spesse con il terreno vero dipinto sopra, luce da nord-ovest, ombre lunghe sul tavolo di
 * resina; le armate sono blocchi colorati; il territorio selezionato si solleva.
 */
import {
  clamp,
  luminance,
  noiseTile,
  placeLabels,
  qPoint,
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
import type { TerritoryDef } from '@onpeace/engine';

const FONT = '"Barlow Semi Condensed", "Arial Narrow", sans-serif';

/** Spessore delle lastre in pixel CSS. */
const depthOf = (env: PaintEnv) => clamp(6 * Math.sqrt(zoomOf(env)), 6, 15);

/** Una lastra: fianchi (spostati verso sud) e faccia superiore con terreno e luce. */
function slab(env: PaintEnv, t: TerritoryDef, color: string, lift: number, sidesOnly: boolean, topOnly: boolean) {
  const { ctx, geo, view, assets } = env;
  const px = 1 / view.scale;
  const d = depthOf(env);
  const path = geo.paths.get(t.id)!;
  ctx.save();
  ctx.translate(0, -lift * px);
  if (!topOnly) {
    // fianchi: la forma ripetuta verso il basso, più scura
    ctx.fillStyle = shade(color, -0.52);
    ctx.strokeStyle = shade(color, -0.52);
    ctx.lineJoin = 'round';
    for (let k = d; k > 0; k -= d / 4) {
      ctx.save();
      ctx.translate(0, k * px);
      ctx.fill(path, 'evenodd');
      ctx.lineWidth = (d / 4 + 0.8) * px;
      ctx.stroke(path);
      ctx.restore();
    }
  }
  if (!sidesOnly) {
    ctx.fillStyle = color;
    ctx.fill(path, 'evenodd');
    ctx.save();
    ctx.clip(path, 'evenodd');
    if (assets.relief) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.62;
      ctx.drawImage(assets.relief, 0, lift * px, geo.width, geo.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // spigoli: luce sui lati a nord-ovest, ombra su quelli a sud-est
    ctx.lineWidth = 2.2 * px;
    ctx.save();
    ctx.translate(1.1 * px, 1.1 * px);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke(path);
    ctx.restore();
    ctx.save();
    ctx.translate(-1.1 * px, -1.1 * px);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.stroke(path);
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}

export const plastico: BoardStyle = {
  id: 'plastico',
  name: 'Plastico',
  tagline: 'Il plastico in rilievo della sala di comando',
  playerColors: ['#3d6fb6', '#c0392b', '#3f8f4f', '#d9a521', '#7d4fa3', '#d9772a', '#3aa0ab', '#c45a8d'],
  fonts: [`700 16px ${FONT}`, `600 16px ${FONT}`],

  paintStatic(env: PaintEnv) {
    const { ctx, geo, view, state, dpr } = env;
    const { width: W, height: H } = geo;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const px = 1 / view.scale;
    const z = zoomOf(env);

    // stanza buia con un faro sul tavolo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const room = ctx.createRadialGradient(cw * 0.45, ch * 0.4, 0, cw * 0.45, ch * 0.4, Math.max(cw, ch) * 0.75);
    room.addColorStop(0, '#262b30');
    room.addColorStop(1, '#0b0d0f');
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, cw, ch);

    toMap(env);
    // tavolo di resina con bordo e ombra
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 40 * dpr;
    ctx.shadowOffsetY = 18 * dpr;
    ctx.fillStyle = '#1b262e';
    ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    const resin = ctx.createLinearGradient(0, 0, W * 0.4, H);
    resin.addColorStop(0, '#34505f');
    resin.addColorStop(1, '#1f323e');
    ctx.fillStyle = resin;
    ctx.fillRect(0, 0, W, H);

    // nomi dei continenti stampati sulla resina
    for (const c of geo.board.continents) {
      if (!c.label) continue;
      const [x, y] = c.label;
      const size = 100;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${size}px ${FONT}`;
      ctx.letterSpacing = `${size * 0.3}px`;
      ctx.fillStyle = 'rgba(220, 235, 242, 0.2)';
      ctx.fillText(c.name.toUpperCase(), x + size * 0.15, y);
      ctx.font = `700 ${size * 0.42}px ${FONT}`;
      ctx.letterSpacing = `${size * 0.12}px`;
      ctx.fillStyle = 'rgba(220, 235, 242, 0.36)';
      ctx.fillText(`BONUS +${c.bonus}`, x + size * 0.06, y + size * 0.9);
      ctx.letterSpacing = '0px';
    }

    // rotte via mare: filo teso tra due spilli
    for (const route of geo.routes) {
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.lineWidth = 1.4 * px;
      ctx.strokeStyle = 'rgba(230, 240, 245, 0.7)';
      ctx.stroke(routePath(route));
      ctx.setLineDash([]);
      for (const [x, y] of route.ends) {
        const r = 3.4 * px;
        const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
        g.addColorStop(0, '#fff4cf');
        g.addColorStop(1, '#a8863d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ombra lunga di tutto il plastico, poi le lastre (fianchi prima, facce dopo)
    const d = depthOf(env);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = clamp(14 * Math.sqrt(z), 12, 30) * dpr;
    ctx.shadowOffsetX = d * 1.1 * dpr;
    ctx.shadowOffsetY = d * 1.8 * dpr;
    ctx.fillStyle = '#000';
    ctx.translate(0, d * px);
    ctx.fill(geo.land, 'evenodd');
    ctx.restore();
    const colorOf = (id: string) => state.owners.get(id) ?? '#8a8f93';
    for (const t of geo.board.territories) slab(env, t, colorOf(t.id), 0, true, false);
    for (const t of geo.board.territories) slab(env, t, colorOf(t.id), 0, false, true);

    // solchi tra le lastre
    ctx.lineJoin = 'round';
    for (const b of geo.borders) {
      ctx.lineWidth = 1.4 * px;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.stroke(b.path);
    }

    // luce da nord-ovest su tutto il tavolo
    const light = ctx.createLinearGradient(0, 0, W, H);
    light.addColorStop(0, 'rgba(255, 248, 230, 0.1)');
    light.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // grana fine
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    toScreen(env);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = ctx.createPattern(noiseTile(200, 90, 'resina'), 'repeat')!;
    ctx.fillRect(0, 0, cw / dpr, ch / dpr);
    ctx.restore();
  },

  paintOverlay(env: PaintEnv) {
    const { ctx, geo, view, state } = env;
    const z = zoomOf(env);
    const px = 1 / view.scale;
    const colorOf = (id: string) => state.owners.get(id) ?? '#8a8f93';

    toMap(env);
    if (state.selected) {
      for (const n of geo.neighbours.get(state.selected) ?? []) {
        ctx.save();
        ctx.setLineDash([4 * px, 3 * px]);
        ctx.lineWidth = 1.6 * px;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.stroke(geo.paths.get(n)!);
        ctx.restore();
      }
      // il territorio selezionato si solleva dal plastico
      const t = geo.board.territories.find((x) => x.id === state.selected)!;
      const lift = 7;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 18 * env.dpr;
      ctx.shadowOffsetX = 6 * env.dpr;
      ctx.shadowOffsetY = 12 * env.dpr;
      ctx.fillStyle = '#000';
      ctx.fill(geo.paths.get(t.id)!, 'evenodd');
      ctx.restore();
      slab(env, t, colorOf(t.id), lift, false, false);
      ctx.save();
      ctx.translate(0, -lift * px);
      ctx.lineWidth = 1.6 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke(geo.paths.get(t.id)!);
      ctx.restore();
    }
    if (state.hover && state.hover !== state.selected) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fill(geo.paths.get(state.hover)!, 'evenodd');
      ctx.restore();
    }

    toScreen(env);
    const bw = clamp(20 + (z - 1) * 2.4, 20, 30); // larghezza del blocco
    const bh = bw * 0.78;
    const bd = bw * 0.36; // profondità (faccia superiore)

    // frecce spesse con ombra
    const mine = state.selected ? colorOf(state.selected) : '#ffffff';
    for (const { enemy, shape } of selectionArrows(env, bw * 0.8, 0.24)) {
      const head = enemy ? 16 : 11;
      const tEnd = 1 - head / Math.max(1, shape.length);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 20; i++) pts.push(qPoint(shape, (i / 20) * tEnd));
      const body = new Path2D();
      body.moveTo(pts[0]![0], pts[0]![1]);
      for (const p of pts) body.lineTo(p[0], p[1]);
      const [hx, hy] = shape.dir;
      const base = pts[pts.length - 1]!;
      const hw = enemy ? 11 : 8;
      const tip = new Path2D();
      tip.moveTo(shape.to[0], shape.to[1]);
      tip.lineTo(base[0] - hy * hw, base[1] + hx * hw);
      tip.lineTo(base[0] + hy * hw, base[1] - hx * hw);
      tip.closePath();
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 4;
      if (!enemy) ctx.setLineDash([7, 5]);
      ctx.lineWidth = enemy ? 7 : 3;
      ctx.strokeStyle = enemy ? shade(mine, -0.1) : 'rgba(255, 255, 255, 0.85)';
      ctx.stroke(body);
      ctx.setLineDash([]);
      ctx.fillStyle = enemy ? shade(mine, -0.1) : 'rgba(255, 255, 255, 0.85)';
      ctx.fill(tip);
      ctx.shadowColor = 'transparent';
      if (enemy) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = shade(mine, 0.35);
        ctx.stroke(body);
      }
      ctx.restore();
    }

    // blocchi delle armate
    const taken: Rect[] = [];
    for (const t of visibleTerritories(env)) {
      const [cx, cy] = screenOf(env, t.anchor);
      const color = colorOf(t.id);
      const active = t.id === state.selected || t.id === state.hover;
      const lift = t.id === state.selected ? 7 : active ? 2 : 0;
      const x = cx - bw / 2;
      const y = cy - bh / 2 - lift;
      taken.push([x - 2, y - bd * 0.6 - 2, x + bw + bd * 0.6 + 2, y + bh + 4]);
      // ombra
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.filter = 'blur(3px)';
      ctx.fillRect(x + 3, y + bh - 2 + lift, bw + bd * 0.5, 6);
      ctx.restore();
      // faccia superiore
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + bd * 0.55, y - bd * 0.55);
      ctx.lineTo(x + bw + bd * 0.55, y - bd * 0.55);
      ctx.lineTo(x + bw, y);
      ctx.closePath();
      ctx.fillStyle = shade(color, 0.28);
      ctx.fill();
      // fianco destro
      ctx.beginPath();
      ctx.moveTo(x + bw, y);
      ctx.lineTo(x + bw + bd * 0.55, y - bd * 0.55);
      ctx.lineTo(x + bw + bd * 0.55, y + bh - bd * 0.55);
      ctx.lineTo(x + bw, y + bh);
      ctx.closePath();
      ctx.fillStyle = shade(color, -0.4);
      ctx.fill();
      // faccia davanti
      const front = ctx.createLinearGradient(x, y, x, y + bh);
      front.addColorStop(0, shade(color, 0.06));
      front.addColorStop(1, shade(color, -0.14));
      ctx.fillStyle = front;
      ctx.fillRect(x, y, bw, bh);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.strokeRect(x + 0.4, y + 0.4, bw - 0.8, bh - 0.8);
      ctx.font = `700 ${bh * 0.78}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = luminance(color) > 0.42 ? '#141618' : '#ffffff';
      ctx.fillText(String(state.armies.get(t.id) ?? 0), x + bw / 2, y + bh / 2 + 1);
      if (active) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeRect(x - 0.5, y - 0.5, bw + 1, bh + 1);
      }
    }

    const fs = clamp(10.5 + (z - 1) * 0.9, 10.5, 14);
    placeLabels(env, taken, {
      font: `700 ${fs}px ${FONT}`,
      size: fs,
      offsetY: bh / 2 + 6,
      text: (n) => n.toUpperCase(),
      letterSpacing: 1,
      draw: (text, x, y, active) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = active ? '#ffffff' : 'rgba(245, 248, 250, 0.94)';
        ctx.fillText(text, x, y);
        ctx.restore();
      },
    });
  },
};
