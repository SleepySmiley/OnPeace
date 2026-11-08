/** Genera i JSON Schema in data/schema/ a partire dagli schemi zod del motore. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { BuildingsFile, MapDef, RulesDefaults, UnitsFile } from '@onpeace/engine';
import { dataDir } from './data-io';

const outDir = join(dataDir, 'schema');
mkdirSync(outDir, { recursive: true });

const schemas: Record<string, z.ZodType> = {
  'units.schema.json': UnitsFile,
  'buildings.schema.json': BuildingsFile,
  'defaults.schema.json': RulesDefaults,
  'map.schema.json': MapDef,
};

for (const [file, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { io: 'input' });
  writeFileSync(join(outDir, file), JSON.stringify(json, null, 2) + '\n');
  console.log(`scritto data/schema/${file}`);
}
