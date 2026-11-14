/** Verifica regole e mappe in data/. Esce con codice 1 se trova errori. */
import { basename } from 'node:path';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BoardDef, MapDef, checkMap } from '@onpeace/engine';
import { createContext } from '@onpeace/conquista';
import { dataDir, listMapFiles, loadRules, readJson } from './data-io';

let failed = false;

let rules;
try {
  rules = loadRules();
  const rare = rules.units.filter((u) => u.rare).length;
  console.log(
    `regole ok: ${rules.units.length - rare} unità, ${rare} rare, ${rules.buildings.length} edifici, ` +
      `${rules.strategies.length} strategie, ${rules.general.upgrades.length} potenziamenti del Generale`,
  );
} catch (err) {
  console.error(String(err));
  process.exit(1);
}

for (const file of listMapFiles()) {
  const parsed = MapDef.safeParse(readJson(file));
  if (!parsed.success) {
    failed = true;
    console.error(`${basename(file)}: formato non valido`);
    for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    continue;
  }
  const errors = checkMap(parsed.data, {
    portMaxSeaDistance: rules.defaults.movement.portMaxSeaDistance,
    // sulle mappe reali città di confine e capitali vicine (Vienna e Bratislava) sono normali
    minCityDistance: parsed.data.id === 'prova' ? 4 : 1,
  });
  if (errors.length > 0) {
    failed = true;
    console.error(`${basename(file)}: ${errors.length} errori`);
    for (const e of errors) console.error(`  - ${e}`);
  } else {
    const m = parsed.data;
    console.log(`${basename(file)}: ok (${m.countries.length} paesi, ${m.cities.length} città)`);
  }
}

// tabelloni del gioco di conquista, con regole e obiettivi
const rulesPath = join(dataDir, 'conquista', 'regole.json');
for (const file of readdirSync(join(dataDir, 'territori')).filter((f) => f.endsWith('.json'))) {
  try {
    const board = BoardDef.parse(readJson(join(dataDir, 'territori', file)));
    const ctx = createContext(board, readJson(rulesPath), readJson(join(dataDir, 'conquista', 'obiettivi', file)));
    console.log(
      `territori/${file}: ok (${board.territories.length} territori, ${board.links.length} confini, ${ctx.objectives.length} obiettivi)`,
    );
  } catch (err) {
    failed = true;
    console.error(`territori/${file}: ${String(err)}`);
  }
}

process.exit(failed ? 1 : 0);
