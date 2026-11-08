/**
 * Scarica i dati di Natural Earth (pubblico dominio) usati per costruire le mappe reali.
 * La versione è fissata, così le mappe si ricostruiscono sempre uguali.
 *
 *   npm run mondo:scarica
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NE_DIR, NE_FILES, NE_VERSION } from './fonti';

mkdirSync(NE_DIR, { recursive: true });
for (const name of NE_FILES) {
  const path = join(NE_DIR, `${name}.geojson`);
  if (existsSync(path)) {
    console.log(`già presente: ${name}`);
    continue;
  }
  const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_VERSION}/geojson/${name}.geojson`;
  console.log(`scarico ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}
console.log(`dati in ${NE_DIR}`);
