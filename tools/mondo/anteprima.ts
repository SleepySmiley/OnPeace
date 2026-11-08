/**
 * Anteprima SVG di una mappa (paesi, zone invalicabili, città, passaggi), utile per
 * controllare una mappa dopo averla costruita senza aprire il gioco.
 *
 *   npm run mondo:anteprima -- europa [file.svg]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MapDef } from '@onpeace/engine';
import { dataDir } from '../data-io';

const id = process.argv[2] ?? 'mondo';
const out = process.argv[3] ?? `${id}.svg`;
const map = MapDef.parse(JSON.parse(readFileSync(join(dataDir, 'maps', `${id}.json`), 'utf8')));

const path = (shape: MapDef['noGo']) =>
  shape.map((poly) => poly.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join('L')}Z`).join('')).join('');
const hue = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
const capitals = new Set(map.countries.map((c) => c.capital));
const r = map.width / 900;

const parts: string[] = [];
parts.push(`<rect width="${map.width}" height="${map.height}" fill="#1d3550"/>`);
for (const c of map.countries) {
  parts.push(`<path d="${path(c.shape)}" fill="hsl(${hue(c.id)},35%,55%)" stroke="#20262c" stroke-width="${r * 0.25}" fill-rule="evenodd"/>`);
}
parts.push(`<path d="${path(map.noGo)}" fill="#e8e8e8" fill-opacity="0.55" fill-rule="evenodd"/>`);
for (const s of map.shortcuts) {
  parts.push(
    `<line x1="${s.from[0]}" y1="${s.from[1]}" x2="${s.to[0]}" y2="${s.to[1]}" stroke="${s.for === 'land' ? '#ffd23f' : '#3fd2ff'}" stroke-width="${r * 0.8}"/>`,
  );
}
for (const city of map.cities) {
  const cap = capitals.has(city.id);
  parts.push(
    `<circle cx="${city.pos[0]}" cy="${city.pos[1]}" r="${r * (cap ? 1.6 : 1)}" fill="${cap ? '#ffffff' : '#111'}" stroke="${city.port ? '#3fd2ff' : '#fff'}" stroke-width="${r * 0.35}"/>`,
  );
}
for (const c of map.countries) {
  if (!c.label) continue;
  parts.push(
    `<text x="${c.label[0]}" y="${c.label[1]}" font-size="${r * 2.6}" font-family="sans-serif" text-anchor="middle" fill="#0b1118">${c.name}</text>`,
  );
}
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}">${parts.join('')}</svg>`);
console.log(`scritto ${out}`);
