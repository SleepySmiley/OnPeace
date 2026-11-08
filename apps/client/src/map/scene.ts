import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  bounds,
  distance,
  pointInMultiPolygon,
  pointInPolygon,
  type MapDef,
  type MultiPolygon,
  type Point,
} from '@onpeace/engine';
import { EMPTY_VIEW, type DraftMarker, type MapViewModel, type StackMarker } from '../game/viewModel';
import type { Camera } from './camera';
import { labelPoint } from './label';
import { MAP_COLORS, assignCountryColors } from './palette';

export type HitTarget =
  | { kind: 'stack'; id: string }
  | { kind: 'city'; id: string }
  | { kind: 'country'; id: string };

export interface Scene {
  /** Applica la telecamera a mappa ed elementi in coordinate schermo. */
  update(camera: Camera): void;
  setView(view: MapViewModel): void;
  setDraft(draft: DraftMarker | null): void;
  setHover(target: HitTarget | null): void;
  hitTest(camera: Camera, sx: number, sy: number): HitTarget | null;
}

const flat = (ring: readonly Point[]) => ring.flatMap((p) => [p[0], p[1]]);
const UI_FONT = '"IBM Plex Sans Condensed", system-ui, sans-serif';

/** Linea tratteggiata (in coordinate mondo). */
function dashed(g: Graphics, pts: readonly Point[], dash: number, gap: number) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t < len; t += dash + gap) {
      const t2 = Math.min(len, t + dash);
      g.moveTo(ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len);
      g.lineTo(ax + ((bx - ax) * t2) / len, ay + ((by - ay) * t2) / len);
    }
  }
}

function arrowHead(g: Graphics, from: Point, to: Point, size: number) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  g.moveTo(to[0], to[1])
    .lineTo(to[0] - size * Math.cos(a - 0.45), to[1] - size * Math.sin(a - 0.45))
    .lineTo(to[0] - size * Math.cos(a + 0.45), to[1] - size * Math.sin(a + 0.45))
    .closePath();
}

/** Piccola icona del tipo di pila, centrata in (x, y). */
function domainGlyph(g: Graphics, domain: StackMarker['domain'], x: number, y: number) {
  const white = '#ffffff';
  if (domain === 'land') g.rect(x - 3, y - 3, 6, 6).fill(white);
  else if (domain === 'naval') g.poly([x - 4.5, y - 1, x + 4.5, y - 1, x + 2.5, y + 3, x - 2.5, y + 3]).fill(white);
  else if (domain === 'air') g.poly([x, y - 4, x + 4.5, y + 3.5, x, y + 1.5, x - 4.5, y + 3.5]).fill(white);
  else g.circle(x, y, 3).fill(white);
}

export function buildScene(app: Application, map: MapDef, fitScale: () => number): Scene {
  const world = new Container();
  const overlay = new Container();
  app.stage.addChild(world, overlay);

  const capitals = new Set(map.countries.map((c) => c.capital));
  const countryById = new Map(map.countries.map((c) => [c.id, c]));
  let view: MapViewModel = EMPTY_VIEW;
  let draft: DraftMarker | null = null;
  let hovered: HitTarget | null = null;
  let scale = 1;

  // ---------------------------------------------------------------- strati fissi
  const grid = new Graphics();
  for (let x = 0; x <= map.width; x += 100) grid.moveTo(x, 0).lineTo(x, map.height);
  for (let y = 0; y <= map.height; y += 100) grid.moveTo(0, y).lineTo(map.width, y);
  grid.stroke({ width: 1, color: MAP_COLORS.seaGrid, alpha: 0.05, pixelLine: true });
  grid.rect(0, 0, map.width, map.height).stroke({ width: 1, color: MAP_COLORS.seaGrid, alpha: 0.18, pixelLine: true });

  const shallows = new Graphics();
  for (const country of map.countries) {
    for (const poly of country.shape) {
      const outer = flat(poly[0]!);
      shallows.poly(outer).stroke({ width: 26, color: MAP_COLORS.shallow, alpha: 0.18, join: 'round' });
      shallows.poly(outer).stroke({ width: 10, color: MAP_COLORS.shallow, alpha: 0.35, join: 'round' });
    }
  }

  const baseFills = new Graphics();
  const countryColors = assignCountryColors(map);
  for (const country of map.countries) {
    for (const [outer, ...holes] of country.shape) {
      baseFills.poly(flat(outer!)).fill({ color: countryColors.get(country.id)! });
      for (const hole of holes) baseFills.poly(flat(hole)).cut();
    }
  }

  const ownerFills = new Graphics();

  const mountains = new Graphics();
  for (const poly of map.noGo) mountains.poly(flat(poly[0]!)).fill({ color: MAP_COLORS.mountainFill, alpha: 0.42 });
  for (const poly of map.noGo) {
    const [minX, minY, maxX, maxY] = bounds([poly]);
    let row = 0;
    for (let y = minY + 6; y < maxY; y += 13, row++) {
      for (let x = minX + (row % 2 ? 9 : 0); x < maxX; x += 18) {
        if (pointInPolygon([x, y], poly)) mountains.moveTo(x - 5, y + 3).lineTo(x, y - 3).lineTo(x + 5, y + 3);
      }
    }
  }
  mountains.stroke({ width: 1.3, color: MAP_COLORS.mountainLine, alpha: 0.45, join: 'round' });

  // strati che dipendono dallo zoom (spessori costanti a schermo)
  const borders = new Graphics();
  const highlight = new Graphics();
  const paths = new Graphics();
  const draftG = new Graphics();
  world.addChild(grid, shallows, baseFills, ownerFills, mountains, borders, highlight, paths, draftG);

  // ---------------------------------------------------------------- etichette dei paesi
  const countryLabelStyle = new TextStyle({
    fontFamily: UI_FONT,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 2.5,
    fill: MAP_COLORS.label,
    stroke: { color: MAP_COLORS.labelShadow, width: 3, join: 'round' },
  });
  // da evitare: le città e, poco sopra, le etichette delle pile
  const avoid: Point[] = map.cities.flatMap((c) => [c.pos, [c.pos[0], c.pos[1] - 32] as Point]);
  const countryLabels = map.countries.map((country) => {
    const text = new Text({ text: country.name.toUpperCase(), style: countryLabelStyle });
    text.anchor.set(0.5, 0.5);
    overlay.addChild(text);
    return { text, at: labelPoint(country.shape as MultiPolygon, avoid) };
  });

  // ---------------------------------------------------------------- città
  const cityLabelStyle = new TextStyle({
    fontFamily: UI_FONT,
    fontSize: 12,
    fontWeight: '500',
    fill: MAP_COLORS.city,
    stroke: { color: MAP_COLORS.labelShadow, width: 3, join: 'round' },
  });
  const cityLayer = new Container();
  const markerLayer = new Container();
  const stackLayer = new Container();
  overlay.addChild(cityLayer, markerLayer, stackLayer);

  const cityNodes = map.cities.map((city) => {
    const isCapital = capitals.has(city.id);
    const node = new Container();
    const mark = new Graphics();
    const label = new Text({ text: city.name, style: cityLabelStyle });
    label.anchor.set(0.5, 0);
    label.y = isCapital ? 10 : 8;
    node.addChild(mark, label);
    cityLayer.addChild(node);
    return { city, node, mark, label, isCapital };
  });

  function drawCities() {
    for (const { city, mark, isCapital } of cityNodes) {
      const owner = view.cityOwner[city.id] ?? null;
      const selected = view.selectedCity === city.id;
      mark.clear();
      if (selected) mark.circle(0, 0, 14).stroke({ width: 2, color: '#ffffff', alpha: 0.9 });
      if (city.port) {
        mark.circle(0, 0, isCapital ? 10.5 : 7).stroke({ width: 1.6, color: MAP_COLORS.port, alpha: 0.95 });
      }
      if (isCapital) {
        mark
          .star(0, 0, 5, 7.5, 3.4)
          .fill(owner ?? MAP_COLORS.capital)
          .stroke({ width: 1.4, color: owner ? MAP_COLORS.capital : MAP_COLORS.cityOutline });
      } else {
        mark.circle(0, 0, 3.8).fill(owner ?? MAP_COLORS.city).stroke({ width: 1.3, color: MAP_COLORS.cityOutline });
      }
    }
  }

  // ---------------------------------------------------------------- pile
  const countStyle = new TextStyle({
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: 11,
    fontWeight: '500',
    fill: '#ffffff',
  });
  let stackNodes: { marker: StackMarker; node: Container; w: number; h: number; sx: number; sy: number }[] = [];

  function drawStacks() {
    stackLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    stackNodes = view.stacks.map((marker) => {
      const node = new Container();
      const label = String(marker.count) + (marker.cargo ? `+${marker.cargo}` : '');
      const w = 20 + label.length * 6.6;
      const h = 17;
      const g = new Graphics();
      if (marker.selected) g.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 6).stroke({ width: 2, color: '#ffffff' });
      g.roundRect(-w / 2, -h / 2, w, h, 4).fill(marker.color).stroke({ width: 1.5, color: '#0b1118' });
      domainGlyph(g, marker.domain, -w / 2 + 8, 0);
      const text = new Text({ text: label, style: countStyle });
      text.anchor.set(0, 0.5);
      text.x = -w / 2 + 14;
      node.addChild(g, text);
      node.alpha = marker.moved ? 0.55 : 1;
      stackLayer.addChild(node);
      return { marker, node, w, h, sx: 0, sy: 0 };
    });
  }

  function drawMarkers() {
    markerLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const m of view.markers) {
      const g = new Graphics();
      if (m.kind === 'battle') {
        g.star(0, 0, 8, 11, 5).fill({ color: m.color, alpha: 0.9 }).stroke({ width: 1.2, color: '#2a0d00' });
      } else {
        g.moveTo(0, 0).lineTo(0, -20).stroke({ width: 1.6, color: '#f3ecd6' });
        g.poly([0, -20, 12, -16, 0, -12]).fill(m.color).stroke({ width: 1, color: '#0b1118' });
      }
      (g as Graphics & { worldPos?: Point }).worldPos = m.pos;
      markerLayer.addChild(g);
    }
  }

  // ---------------------------------------------------------------- disegni legati allo zoom
  function drawZoomDependent() {
    const px = 1 / scale;
    borders.clear();
    for (const country of map.countries) {
      for (const poly of country.shape) {
        for (const ring of poly) {
          borders.poly(flat(ring)).stroke({ width: 1.3 * px, color: MAP_COLORS.border, alpha: 0.8, join: 'round' });
        }
      }
    }
    if (view.pickable) {
      for (const id of view.pickable) {
        for (const poly of countryById.get(id)!.shape) {
          borders.poly(flat(poly[0]!)).stroke({ width: 2 * px, color: '#f3ecd6', alpha: 0.55, join: 'round' });
        }
      }
    }
    drawHighlight();

    paths.clear();
    for (const p of view.paths) drawPath(paths, p.points, p.ok ? p.color : '#ff4d4d', p.attack, px);

    draftG.clear();
    if (draft) {
      draftG.circle(draft.center[0], draft.center[1], draft.range).fill({ color: '#ffffff', alpha: 0.05 });
      draftG.circle(draft.center[0], draft.center[1], draft.range).stroke({ width: 1.4 * px, color: '#ffffff', alpha: 0.5 });
      if (draft.points.length >= 2) {
        drawPath(draftG, draft.points, draft.ok ? (draft.attack ? '#ff7a3d' : '#9fe8a0') : '#ff4d4d', draft.attack, px);
      }
    }
  }

  function drawPath(g: Graphics, pts: readonly Point[], color: string, attack: boolean, px: number) {
    if (attack) dashed(g, pts, 9 * px, 6 * px);
    else g.poly(flat(pts), false);
    g.stroke({ width: 2.4 * px, color, alpha: 0.95, cap: 'round', join: 'round' });
    arrowHead(g, pts[pts.length - 2]!, pts[pts.length - 1]!, 11 * px);
    g.fill({ color, alpha: 0.95 });
  }

  function drawHighlight() {
    highlight.clear();
    if (!hovered || hovered.kind === 'stack') return;
    const countryId =
      hovered.kind === 'country' ? hovered.id : map.cities.find((c) => c.id === hovered!.id)?.country;
    const country = countryId ? countryById.get(countryId) : undefined;
    if (!country) return;
    for (const [outer, ...holes] of country.shape) {
      highlight.poly(flat(outer!)).fill({ color: '#ffffff', alpha: 0.08 });
      for (const hole of holes) highlight.poly(flat(hole)).cut();
      highlight.poly(flat(outer!)).stroke({ width: 2.2 / scale, color: MAP_COLORS.hover, alpha: 0.95, join: 'round' });
    }
  }

  function drawOwners() {
    ownerFills.clear();
    for (const country of map.countries) {
      const color = view.countryOwner[country.id];
      if (!color) continue;
      for (const [outer, ...holes] of country.shape) {
        ownerFills.poly(flat(outer!)).fill({ color, alpha: 0.62 });
        for (const hole of holes) ownerFills.poly(flat(hole)).cut();
      }
    }
  }

  let lastCamera: Camera | null = null;

  function positionOverlay(camera: Camera) {
    const zoom = camera.scale / fitScale();
    for (const { text, at } of countryLabels) {
      const [sx, sy] = camera.toScreen(at);
      text.position.set(sx, sy);
      text.alpha = zoom > 3.5 ? 0.45 : 0.88;
    }
    const hoveredCity = hovered?.kind === 'city' ? hovered.id : null;
    for (const { city, node, label, isCapital } of cityNodes) {
      const [sx, sy] = camera.toScreen(city.pos);
      node.position.set(sx, sy);
      label.visible =
        city.id === hoveredCity || city.id === view.selectedCity || zoom >= 1.7 || (isCapital && zoom >= 1.15);
    }
    // pile: in città sopra il simbolo; più pile nello stesso punto affiancate
    const slots = new Map<string, number>();
    for (const s of stackNodes) {
      const key = s.marker.inCity ?? `${Math.round(s.marker.pos[0])},${Math.round(s.marker.pos[1])}`;
      const slot = slots.get(key) ?? 0;
      slots.set(key, slot + 1);
      const [sx, sy] = camera.toScreen(s.marker.pos);
      s.sx = sx + slot * (s.w + 4);
      s.sy = sy + (s.marker.inCity ? -22 : 0);
      s.node.position.set(s.sx, s.sy);
    }
    for (const child of markerLayer.children) {
      const pos = (child as Graphics & { worldPos?: Point }).worldPos;
      if (pos) child.position.set(...camera.toScreen(pos));
    }
  }

  return {
    update(camera) {
      lastCamera = camera;
      const rescale = camera.scale !== scale;
      scale = camera.scale;
      world.scale.set(camera.scale);
      world.position.set(camera.x, camera.y);
      if (rescale) drawZoomDependent();
      positionOverlay(camera);
    },
    setView(next) {
      view = next;
      drawOwners();
      drawCities();
      drawStacks();
      drawMarkers();
      drawZoomDependent();
      if (lastCamera) positionOverlay(lastCamera);
    },
    setDraft(next) {
      draft = next;
      drawZoomDependent();
    },
    setHover(target) {
      if (target?.kind === hovered?.kind && target?.id === hovered?.id) return;
      hovered = target;
      drawHighlight();
      if (lastCamera) positionOverlay(lastCamera);
    },
    hitTest(camera, sx, sy) {
      for (let i = stackNodes.length - 1; i >= 0; i--) {
        const s = stackNodes[i]!;
        if (Math.abs(sx - s.sx) <= s.w / 2 + 2 && Math.abs(sy - s.sy) <= s.h / 2 + 2) {
          return { kind: 'stack', id: s.marker.id };
        }
      }
      let bestCity: string | null = null;
      let bestD = 11;
      for (const { city } of cityNodes) {
        const d = distance(camera.toScreen(city.pos), [sx, sy]);
        if (d < bestD) {
          bestD = d;
          bestCity = city.id;
        }
      }
      if (bestCity) return { kind: 'city', id: bestCity };
      const p = camera.toWorld(sx, sy);
      const country = map.countries.find((c) => pointInMultiPolygon(p, c.shape as MultiPolygon));
      return country ? { kind: 'country', id: country.id } : null;
    },
  };
}
