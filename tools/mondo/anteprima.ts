/**
 * Anteprima HTML di un tabellone a territori: territori colorati per continente, nomi,
 * collegamenti via mare tratteggiati e (a richiesta) tutti i confini tra territori.
 *
 *   npm run mondo:anteprima -- mondo [file.html]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BoardDef } from '@onpeace/engine';
import { dataDir } from '../data-io';

const id = process.argv[2] ?? 'mondo';
const out = process.argv[3] ?? `${id}-territori.html`;
const board = BoardDef.parse(JSON.parse(readFileSync(join(dataDir, 'territori', `${id}.json`), 'utf8')));

const HUES: Record<string, number> = { nordamerica: 32, sudamerica: 350, europa: 215, africa: 48, asia: 140, oceania: 280 };
const hueOf = (continent: string, i: number) => HUES[continent] ?? (i * 57) % 360;
const contIndex = new Map(board.continents.map((c, i) => [c.id, i]));
const path = (shape: BoardDef['territories'][number]['shape']) =>
  shape.map((poly) => poly.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join('L')}Z`).join('')).join('');
const byId = new Map(board.territories.map((t) => [t.id, t]));
const r = board.width / 900;
const W = board.width;

const parts: string[] = [];
parts.push(`<rect width="${board.width}" height="${board.height}" fill="#173049"/>`);
// territori: stessa tinta per continente, luminosità diversa per distinguerli
const counter = new Map<string, number>();
for (const t of board.territories) {
  const k = counter.get(t.continent) ?? 0;
  counter.set(t.continent, k + 1);
  const light = 42 + ((k * 7) % 4) * 6;
  parts.push(
    `<path d="${path(t.shape)}" fill="hsl(${hueOf(t.continent, contIndex.get(t.continent)!)},45%,${light}%)" stroke="#0d1620" stroke-width="${r * 0.55}" fill-rule="evenodd"><title>${t.name}</title></path>`,
  );
}
// tutti i confini (nascosti finché non si accendono)
parts.push('<g id="grafo" style="display:none">');
for (const l of board.links) {
  const a = byId.get(l.a)!.anchor;
  const b = byId.get(l.b)!.anchor;
  if (Math.abs(a[0] - b[0]) > W / 2) continue;
  parts.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#fff" stroke-opacity="0.55" stroke-width="${r * 0.6}"/>`);
}
parts.push('</g>');
// collegamenti via mare
for (const l of board.links) {
  if (!l.sea || !l.line) continue;
  const [p, q] = l.line;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e9f3ff" stroke-width="${r * 0.9}" stroke-dasharray="${r * 2.4} ${r * 1.6}" stroke-linecap="round"/>`;
  if (l.wrap) {
    // esce da un bordo e rientra dall'altro
    const [left, right] = p[0] < q[0] ? [p, q] : [q, p];
    const midY = (left[1] + right[1]) / 2;
    parts.push(line(left[0], left[1], 0, midY), line(right[0], right[1], W, midY));
  } else parts.push(line(p[0], p[1], q[0], q[1]));
}
// segnalini e nomi
for (const t of board.territories) {
  const [x, y] = t.anchor;
  parts.push(`<circle cx="${x}" cy="${y}" r="${r * 2.2}" fill="#f4f1ea" stroke="#0d1620" stroke-width="${r * 0.4}"/>`);
  parts.push(
    `<text x="${x}" y="${y + r * 5.2}" font-size="${r * 2.5}" font-family="system-ui,sans-serif" font-weight="600" text-anchor="middle" fill="#fff" stroke="#0d1620" stroke-width="${r * 0.6}" paint-order="stroke">${t.name}</text>`,
  );
}

const legend = board.continents
  .map((c, i) => {
    const n = board.territories.filter((t) => t.continent === c.id).length;
    return `<li><span style="background:hsl(${hueOf(c.id, i)},45%,48%)"></span>${c.name} <small>${n} territori · bonus +${c.bonus}</small></li>`;
  })
  .join('');

const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tabellone ${board.name}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b141d; color: #e8eef5; font: 14px/1.4 system-ui, sans-serif; }
  header { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; padding: 10px 16px; }
  h1 { font-size: 17px; margin: 0; }
  ul { display: flex; gap: 16px; flex-wrap: wrap; list-style: none; margin: 0; padding: 0; }
  li span { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  small { color: #9fb0c2; }
  label { margin-left: auto; cursor: pointer; }
  svg { display: block; width: 100%; height: auto; }
</style></head><body>
<header><h1>${board.name}: ${board.territories.length} territori, ${board.links.length} confini (${board.links.filter((l) => l.sea).length} via mare)</h1>
<ul>${legend}</ul>
<label><input type="checkbox" onchange="document.getElementById('grafo').style.display=this.checked?'':'none'"> mostra chi confina con chi</label></header>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${board.width} ${board.height}">${parts.join('')}</svg>
</body></html>
`;
writeFileSync(out, html);
console.log(`scritto ${out}`);
