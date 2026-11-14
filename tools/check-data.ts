/** Verifica tabelloni, regole e obiettivi in data/. Esce con codice 1 se trova errori. */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BoardDef } from '@onpeace/engine';
import { createContext } from '@onpeace/conquista';
import { dataDir, readJson } from './data-io';

let failed = false;
const rulesPath = join(dataDir, 'conquista', 'regole.json');
// createContext controlla tabellone (checkBoard), regole e obiettivi insieme
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
