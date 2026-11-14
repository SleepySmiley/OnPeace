/** Salvataggio delle partite in file JSON (uno per partita), scritti in modo atomico. */
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomSnapshot } from './room';

export class Storage {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  save(snapshot: RoomSnapshot): void {
    const file = join(this.dir, `${snapshot.id}.json`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot));
    renameSync(tmp, file);
  }

  loadAll(): RoomSnapshot[] {
    const out: RoomSnapshot[] = [];
    let old = 0;
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const snap = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as { version?: unknown; id?: unknown; seats?: unknown };
        // controllo minimo della forma: un file rovinato non deve rompere i rientri di tutti
        if (snap?.version === 2 && typeof snap.id === 'string' && Array.isArray(snap.seats)) out.push(snap as RoomSnapshot);
        else if (snap?.version === 1) old++; // partite del gioco precedente (atWar): restano sul disco, non si riprendono
        else console.warn(`Partita in un formato sconosciuto ignorata: ${f}`);
      } catch (err) {
        console.warn(`Partita illeggibile ignorata: ${f}`, err);
      }
    }
    if (old > 0) console.warn(`${old} partite del gioco precedente ignorate (restano in ${this.dir})`);
    return out;
  }

  remove(id: string): void {
    rmSync(join(this.dir, `${id}.json`), { force: true });
  }
}
