import { z } from 'zod';
import { Id } from './rules';
import { MultiPolygonS, PointS } from './map';

/**
 * Tabellone a territori: il mondo diviso in territori raggruppati in continenti, con l'elenco
 * esplicito di chi confina con chi (per terra o via mare). È la mappa del gioco di conquista.
 */
export const ContinentDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** Armate in più a ogni turno per chi tiene tutto il continente. */
  bonus: z.number().int().min(0),
});
export type ContinentDef = z.infer<typeof ContinentDef>;

export const TerritoryDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  continent: Id,
  /** Dove mettere il segnalino delle armate (dentro il territorio, lontano dai bordi). */
  anchor: PointS,
  /** Dove scrivere il nome. */
  label: PointS,
  shape: MultiPolygonS.min(1),
});
export type TerritoryDef = z.infer<typeof TerritoryDef>;

export const BoardLinkDef = z.strictObject({
  a: Id,
  b: Id,
  /** Collegamento via mare: sulla mappa si disegna una linea tratteggiata. */
  sea: z.boolean(),
  /** Estremi della linea da disegnare (solo per quelli via mare). */
  line: z.tuple([PointS, PointS]).optional(),
  /** La linea esce da un bordo della mappa e rientra dall'altro (stretto di Bering). */
  wrap: z.boolean().optional(),
});
export type BoardLinkDef = z.infer<typeof BoardLinkDef>;

export const BoardDef = z.strictObject({
  $schema: z.string().optional(),
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  continents: z.array(ContinentDef).min(1),
  territories: z.array(TerritoryDef).min(2),
  links: z.array(BoardLinkDef).min(1),
});
export type BoardDef = z.infer<typeof BoardDef>;

/** Controlli di coerenza oltre al formato: id unici, continenti esistenti, grafo connesso. */
export function checkBoard(board: BoardDef): string[] {
  const errors: string[] = [];
  const continents = new Set<string>();
  for (const c of board.continents) {
    if (continents.has(c.id)) errors.push(`continente "${c.id}" ripetuto`);
    continents.add(c.id);
  }
  const territories = new Set<string>();
  for (const t of board.territories) {
    if (territories.has(t.id)) errors.push(`territorio "${t.id}" ripetuto`);
    territories.add(t.id);
    if (!continents.has(t.continent)) errors.push(`territorio "${t.id}": continente "${t.continent}" inesistente`);
  }
  for (const c of board.continents) {
    if (!board.territories.some((t) => t.continent === c.id)) errors.push(`continente "${c.id}" senza territori`);
  }
  const neighbours = new Map<string, Set<string>>([...territories].map((id) => [id, new Set<string>()]));
  const seen = new Set<string>();
  for (const l of board.links) {
    if (!territories.has(l.a) || !territories.has(l.b)) {
      errors.push(`collegamento ${l.a}–${l.b}: territorio inesistente`);
      continue;
    }
    if (l.a === l.b) errors.push(`collegamento ${l.a}–${l.b}: un territorio con se stesso`);
    const key = [l.a, l.b].sort().join('|');
    if (seen.has(key)) errors.push(`collegamento ${l.a}–${l.b} ripetuto`);
    seen.add(key);
    if (l.sea && !l.line) errors.push(`collegamento via mare ${l.a}–${l.b} senza linea`);
    neighbours.get(l.a)!.add(l.b);
    neighbours.get(l.b)!.add(l.a);
  }
  for (const [id, set] of neighbours) if (set.size === 0) errors.push(`territorio "${id}" senza confinanti`);
  // tutti raggiungibili da tutti
  const first = board.territories[0]?.id;
  if (first) {
    const reached = new Set([first]);
    const queue = [first];
    while (queue.length > 0) {
      for (const n of neighbours.get(queue.pop()!) ?? []) {
        if (!reached.has(n)) {
          reached.add(n);
          queue.push(n);
        }
      }
    }
    const missing = [...territories].filter((id) => !reached.has(id));
    if (missing.length > 0) errors.push(`territori irraggiungibili: ${missing.join(', ')}`);
  }
  return errors;
}

/** Elenco dei confinanti di ogni territorio. */
export function boardNeighbours(board: BoardDef): Map<string, string[]> {
  const out = new Map<string, string[]>(board.territories.map((t) => [t.id, []]));
  for (const l of board.links) {
    out.get(l.a)?.push(l.b);
    out.get(l.b)?.push(l.a);
  }
  return out;
}
