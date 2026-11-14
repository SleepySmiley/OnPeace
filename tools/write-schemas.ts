/** Genera i JSON Schema in data/schema/ dagli schemi zod: danno autocompletamento e controllo in VS Code. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { BoardDef } from '@onpeace/engine';
import { ConquestRules, ObjectivesFile } from '@onpeace/conquista';
import { dataDir } from './data-io';

const outDir = join(dataDir, 'schema');
mkdirSync(outDir, { recursive: true });

const schemas: Record<string, z.ZodType> = {
  'board.schema.json': BoardDef,
  'conquista-regole.schema.json': ConquestRules,
  'conquista-obiettivi.schema.json': ObjectivesFile,
};

for (const [file, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { io: 'input' });
  writeFileSync(join(outDir, file), JSON.stringify(json, null, 2) + '\n');
  console.log(`scritto data/schema/${file}`);
}
