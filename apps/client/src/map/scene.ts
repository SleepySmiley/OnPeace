import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  bounds,
  distance,
  pointInMultiPolygon,
  pointInPolygon,
  type CityDef,
  type MapDef,
  type MultiPolygon,
  type Point,
} from '@onpeace/engine';
import type { Camera } from './camera';
import { labelPoint } from './label';
import { MAP_COLORS, assignCountryColors } from './palette';

export type HoverTarget = { kind: 'city'; id: string } | { kind: 'country'; id: string };

export interface Scene {
  /** Applica la telecamera a mappa ed etichette. */
  update(camera: Camera): void;
  setHover(target: HoverTarget | null): void;
  /** Cosa c'è sotto il punto dello schermo (città prima, poi paese). */
  hitTest(camera: Camera, sx: number, sy: number): HoverTarget | null;
}

const flat = (ring: readonly Point[]) => ring.flatMap((p) => [p[0], p[1]]);

const UI_FONT = '"IBM Plex Sans Condensed", system-ui, sans-serif';

export function buildScene(app: Application, map: MapDef, fitScale: () => number): Scene {
  const world = new Container();
  const overlay = new Container();
  app.stage.addChild(world, overlay);

  const capitals = new Set(map.countries.map((c) => c.capital));
  const countryById = new Map(map.countries.map((c) => [c.id, c]));

  // --- mare: reticolo leggero
  const grid = new Graphics();
  for (let x = 0; x <= map.width; x += 100) grid.moveTo(x, 0).lineTo(x, map.height);
  for (let y = 0; y <= map.height; y += 100) grid.moveTo(0, y).lineTo(map.width, y);
  grid.stroke({ width: 1, color: MAP_COLORS.seaGrid, alpha: 0.05, pixelLine: true });
  grid.rect(0, 0, map.width, map.height).stroke({ width: 1, color: MAP_COLORS.seaGrid, alpha: 0.18, pixelLine: true });

  // --- acque basse attorno alle coste (sotto i paesi)
  const shallows = new Graphics();
  for (const country of map.countries) {
    for (const poly of country.shape) {
      const outer = flat(poly[0]!);
      shallows.poly(outer).stroke({ width: 26, color: MAP_COLORS.shallow, alpha: 0.18, join: 'round' });
      shallows.poly(outer).stroke({ width: 10, color: MAP_COLORS.shallow, alpha: 0.35, join: 'round' });
    }
  }

  // --- paesi
  const fills = new Graphics();
  const countryColors = assignCountryColors(map);
  map.countries.forEach((country) => {
    const color = countryColors.get(country.id)!;
    for (const [outer, ...holes] of country.shape) {
      fills.poly(flat(outer!)).fill({ color });
      for (const hole of holes) fills.poly(flat(hole)).cut();
    }
  });

  // --- montagne: campitura scura e segni a "^"
  const mountains = new Graphics();
  for (const poly of map.noGo) {
    mountains.poly(flat(poly[0]!)).fill({ color: MAP_COLORS.mountainFill, alpha: 0.42 });
  }
  for (const poly of map.noGo) {
    const [minX, minY, maxX, maxY] = bounds([poly]);
    let row = 0;
    for (let y = minY + 6; y < maxY; y += 13, row++) {
      for (let x = minX + (row % 2 ? 9 : 0); x < maxX; x += 18) {
        if (!pointInPolygon([x, y], poly)) continue;
        mountains.moveTo(x - 5, y + 3).lineTo(x, y - 3).lineTo(x + 5, y + 3);
      }
    }
  }
  mountains.stroke({ width: 1.3, color: MAP_COLORS.mountainLine, alpha: 0.45, join: 'round' });

  const borders = new Graphics();
  const hover = new Graphics();
  world.addChild(grid, shallows, fills, mountains, borders, hover);

  // --- etichette dei paesi (in coordinate schermo, restano nitide)
  const countryLabelStyle = new TextStyle({
    fontFamily: UI_FONT,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 2.5,
    fill: MAP_COLORS.label,
    stroke: { color: MAP_COLORS.labelShadow, width: 3, join: 'round' },
  });
  const countryLabels = map.countries.map((country) => {
    const text = new Text({ text: country.name.toUpperCase(), style: countryLabelStyle });
    text.anchor.set(0.5, 1);
    text.alpha = 0.88;
    overlay.addChild(text);
    return { text, at: labelPoint(country.shape as MultiPolygon) };
  });

  // --- città
  const cityLabelStyle = new TextStyle({
    fontFamily: UI_FONT,
    fontSize: 12,
    fontWeight: '500',
    fill: MAP_COLORS.city,
    stroke: { color: MAP_COLORS.labelShadow, width: 3, join: 'round' },
  });
  const cityNodes = map.cities.map((city) => {
    const isCapital = capitals.has(city.id);
    const node = new Container();
    const mark = new Graphics();
    if (city.port) {
      mark.circle(0, 0, isCapital ? 10.5 : 7).stroke({ width: 1.6, color: MAP_COLORS.port, alpha: 0.95 });
    }
    if (isCapital) {
      mark.star(0, 0, 5, 7.5, 3.4).fill(MAP_COLORS.capital).stroke({ width: 1.2, color: MAP_COLORS.cityOutline });
    } else {
      mark.circle(0, 0, 3.6).fill(MAP_COLORS.city).stroke({ width: 1.3, color: MAP_COLORS.cityOutline });
    }
    const label = new Text({ text: city.name, style: cityLabelStyle });
    label.anchor.set(0.5, 0);
    label.y = isCapital ? 10 : 8;
    node.addChild(mark, label);
    overlay.addChild(node);
    return { city, node, label, isCapital };
  });

  let borderScale = -1;
  let hovered: HoverTarget | null = null;
  let currentScale = 1;

  function drawBorders(scale: number) {
    borders.clear();
    for (const country of map.countries) {
      for (const poly of country.shape) {
        for (const ring of poly) {
          borders.poly(flat(ring)).stroke({ width: 1.3 / scale, color: MAP_COLORS.border, alpha: 0.8, join: 'round' });
        }
      }
    }
  }

  function drawHover() {
    hover.clear();
    if (!hovered) return;
    const countryId =
      hovered.kind === 'country' ? hovered.id : map.cities.find((c) => c.id === hovered!.id)?.country;
    const country = countryId ? countryById.get(countryId) : undefined;
    if (!country) return;
    for (const [outer, ...holes] of country.shape) {
      hover.poly(flat(outer!)).fill({ color: '#ffffff', alpha: 0.08 });
      for (const hole of holes) hover.poly(flat(hole)).cut();
      hover.poly(flat(outer!)).stroke({ width: 2.2 / currentScale, color: MAP_COLORS.hover, alpha: 0.95, join: 'round' });
    }
  }

  return {
    update(camera) {
      currentScale = camera.scale;
      world.scale.set(camera.scale);
      world.position.set(camera.x, camera.y);
      if (camera.scale !== borderScale) {
        borderScale = camera.scale;
        drawBorders(camera.scale);
        drawHover();
      }
      const zoom = camera.scale / fitScale();
      for (const { text, at } of countryLabels) {
        const [sx, sy] = camera.toScreen(at);
        text.position.set(sx, sy - 14);
        text.alpha = zoom > 3.5 ? 0.45 : 0.88;
      }
      const hoveredCity = hovered?.kind === 'city' ? hovered.id : null;
      for (const { city, node, label, isCapital } of cityNodes) {
        const [sx, sy] = camera.toScreen(city.pos);
        node.position.set(sx, sy);
        label.visible = city.id === hoveredCity || zoom >= 1.7 || (isCapital && zoom >= 1.15);
      }
    },
    setHover(target) {
      if (target?.kind === hovered?.kind && target?.id === hovered?.id) return;
      hovered = target;
      drawHover();
      const hoveredCity = hovered?.kind === 'city' ? hovered.id : null;
      for (const { city, label } of cityNodes) if (city.id === hoveredCity) label.visible = true;
    },
    hitTest(camera, sx, sy) {
      let best: CityDef | null = null;
      let bestD = 11;
      for (const { city } of cityNodes) {
        const d = distance(camera.toScreen(city.pos), [sx, sy]);
        if (d < bestD) {
          bestD = d;
          best = city;
        }
      }
      if (best) return { kind: 'city', id: best.id };
      const p = camera.toWorld(sx, sy);
      const country = map.countries.find((c) => pointInMultiPolygon(p, c.shape as MultiPolygon));
      return country ? { kind: 'country', id: country.id } : null;
    },
  };
}
