/**
 * Pagina di prova del tabellone (/tabellone.html in sviluppo): il mondo a territori con una
 * partita finta, per giudicare la grafica e controllare i confini prima del gioco vero.
 */
import boardJson from '@data/territori/mondo.json';
import { BoardDef } from '@onpeace/engine';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { buildGeometry } from './geometry';
import { loadEarthBase } from './imagery';
import { BOARD_COLORS, paintOverlay, paintStatic, type BoardState, type BoardView } from './paint';

// ---------------------------------------------------------------- partita di prova
/** Generatore pseudo-casuale con seme: la partita finta è sempre la stessa. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const board = BoardDef.parse(boardJson);
const geo = buildGeometry(board);
const players = ['Matteo', 'Giulia', 'Lorenzo', 'Sofia', 'Pietro'].map((name, i) => ({ name, color: PLAYER_COLORS[i]! }));
const rand = mulberry32(20261114);
const order = board.territories.map((t) => t.id).sort(() => rand() - 0.5);
const ownerOf = new Map<string, number>();
order.forEach((id, i) => ownerOf.set(id, i % players.length));

const state: BoardState = {
  owners: new Map([...ownerOf].map(([id, p]) => [id, players[p]!.color])),
  armies: new Map(board.territories.map((t) => [t.id, 1 + Math.floor(rand() ** 2.2 * 14)])),
  hover: null,
  selected: null,
};

// ---------------------------------------------------------------- disegno
const canvas = document.getElementById('board') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const cache = document.createElement('canvas');
const cacheCtx = cache.getContext('2d')!;
let cacheView: BoardView | null = null;
let earth: HTMLCanvasElement | null = null;
let dpr = 1;
let view: BoardView = { scale: 1, x: 0, y: 0 };
let fitScale = 1;
let frameQueued = false;
let idleTimer = 0;

function fitView(): BoardView {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // spazio attorno per le coordinate e gli angolari della cornice
  const scale = Math.min((w - 110) / geo.width, (h - 90) / geo.height);
  return { scale, x: (w - geo.width * scale) / 2, y: (h - geo.height * scale) / 2 };
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [canvas, cache]) {
    c.width = Math.round(window.innerWidth * dpr);
    c.height = Math.round(window.innerHeight * dpr);
  }
  const fit = fitView();
  fitScale = fit.scale;
  view = fit;
  renderStatic();
}

function renderStatic() {
  paintStatic(cacheCtx, geo, view, state, dpr, fitScale, earth);
  cacheView = { ...view };
  requestFrame();
}

function draw() {
  frameQueued = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BOARD_COLORS.table;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (cacheView) {
    // finché si trascina o si ingrandisce si sposta l'ultima immagine; quella nitida arriva da ferma
    const s = view.scale / cacheView.scale;
    ctx.setTransform(s, 0, 0, s, (view.x - cacheView.x * s) * dpr, (view.y - cacheView.y * s) * dpr);
    ctx.drawImage(cache, 0, 0);
  }
  paintOverlay(ctx, geo, view, state, dpr, fitScale);
}

function requestFrame() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(draw);
}

function viewChanged() {
  requestFrame();
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(renderStatic, 140);
}

// ---------------------------------------------------------------- interazione
const hitCtx = document.createElement('canvas').getContext('2d')!;
function territoryAt(sx: number, sy: number): string | null {
  const x = (sx - view.x) / view.scale;
  const y = (sy - view.y) / view.scale;
  for (const t of board.territories) {
    const b = geo.boxes.get(t.id)!;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    if (hitCtx.isPointInPath(geo.paths.get(t.id)!, x, y, 'evenodd')) return t.id;
  }
  return null;
}

let drag: { x: number; y: number; vx: number; vy: number; moved: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: 0 };
});
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 3) {
      canvas.classList.add('dragging');
      view = { ...view, x: drag.vx + dx, y: drag.vy + dy };
      viewChanged();
      return;
    }
  }
  const hit = territoryAt(e.clientX, e.clientY);
  canvas.classList.toggle('pointing', hit !== null);
  if (hit !== state.hover) {
    state.hover = hit;
    if (!state.selected) showCard(hit);
    requestFrame();
  }
});
canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('dragging');
  if (drag && drag.moved <= 3) {
    const hit = territoryAt(e.clientX, e.clientY);
    state.selected = hit === state.selected ? null : hit;
    showCard(state.selected ?? state.hover);
    requestFrame();
  }
  drag = null;
});
canvas.addEventListener('pointerleave', () => {
  state.hover = null;
  if (!state.selected) showCard(null);
  requestFrame();
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0016);
    const scale = Math.min(fitScale * 14, Math.max(fitScale * 0.9, view.scale * factor));
    const k = scale / view.scale;
    view = { scale, x: e.clientX - (e.clientX - view.x) * k, y: e.clientY - (e.clientY - view.y) * k };
    viewChanged();
  },
  { passive: false },
);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    state.selected = null;
    showCard(state.hover);
    requestFrame();
  }
  if (e.key === '0') {
    view = fitView();
    viewChanged();
  }
});
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- pannelli
const playersEl = document.querySelector('.hud-players') as HTMLElement;
const cardEl = document.querySelector('.hud-card') as HTMLElement;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const chip = (color: string) => `<span class="chip" style="--c: ${color}"></span>`;

function renderPlayers() {
  const rows = players
    .map((p, i) => {
      const own = [...ownerOf].filter(([, o]) => o === i).map(([id]) => id);
      const armies = own.reduce((s, id) => s + (state.armies.get(id) ?? 0), 0);
      return `<div class="player">${chip(p.color)}<span>${esc(p.name)}</span><span class="count"><b>${own.length}</b> terr.</span><span class="count"><b>${armies}</b> arm.</span></div>`;
    })
    .join('');
  playersEl.innerHTML = `<h2>Partita di prova</h2>${rows}`;
}

function showCard(id: string | null) {
  if (!id) {
    cardEl.hidden = true;
    return;
  }
  const t = board.territories.find((x) => x.id === id)!;
  const continent = board.continents.find((c) => c.id === t.continent)!;
  const owner = players[ownerOf.get(id)!]!;
  const seaWith = new Set(
    board.links.filter((l) => l.sea && (l.a === id || l.b === id)).map((l) => (l.a === id ? l.b : l.a)),
  );
  const neighbours = (geo.neighbours.get(id) ?? [])
    .map((n) => board.territories.find((x) => x.id === n)!)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .map((n) => {
      const enemy = ownerOf.get(n.id) !== ownerOf.get(id);
      const tags = [seaWith.has(n.id) ? 'via mare' : '', enemy ? `${state.armies.get(n.id) ?? 0} arm.` : 'tuo'].filter(Boolean).join(' · ');
      return `<li>${chip(players[ownerOf.get(n.id)!]!.color)}<span>${esc(n.name)}</span><span class="tag${enemy ? ' enemy' : ''}">${tags}</span></li>`;
    })
    .join('');
  cardEl.innerHTML = `
    <p class="name">${esc(t.name)}</p>
    <p class="continent">${esc(continent.name)}, bonus +${continent.bonus}</p>
    <div class="owner">${chip(owner.color)}<span>${esc(owner.name)}</span><span class="armies">${state.armies.get(id) ?? 0}</span></div>
    <h2>Confinanti</h2>
    <ul>${neighbours}</ul>`;
  cardEl.hidden = false;
}

// ---------------------------------------------------------------- avvio
await Promise.all([
  document.fonts.load('600 16px "IBM Plex Sans Condensed"'),
  document.fonts.load('500 16px "IBM Plex Sans Condensed"'),
  document.fonts.load('600 16px "IBM Plex Mono"'),
  document.fonts.load('500 16px "IBM Plex Mono"'),
]).catch(() => undefined);
renderPlayers();
resize();
// la base satellitare arriva dopo: intanto si vede già il tabellone
loadEarthBase(board)
  .then((canvas) => {
    earth = canvas;
    renderStatic();
  })
  .catch((err: unknown) => console.warn(err));
