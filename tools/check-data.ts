/** Verifica regole e mappe in data/. Esce con codice 1 se trova errori. */
import { basename } from 'node:path';
import { MapDef, checkMap } from '@onpeace/engine';
import { listMapFiles, loadRules, readJson } from './data-io';

let failed = false;

let rules;
try {
  rules = loadRules();
  console.log(`regole ok: ${rules.units.length} unità, ${rules.buildings.length} edifici`);
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
    minCityDistance: 4,
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

process.exit(failed ? 1 : 0);
