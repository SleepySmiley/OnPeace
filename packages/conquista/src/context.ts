/** Preparazione del contesto di gioco: tabellone, regole e obiettivi validati e indicizzati. */
import { boardNeighbours, checkBoard, type BoardDef } from '@onpeace/engine';
import { ConquestRules, ObjectivesFile } from './schema';
import type { GameContext } from './state';

export function createContext(board: BoardDef, rulesData: unknown, objectivesData: unknown): GameContext {
  const errors = checkBoard(board);
  if (errors.length > 0) throw new Error(`tabellone ${board.id} non valido: ${errors.join('; ')}`);
  const rules = ConquestRules.parse(rulesData);
  const objectives = ObjectivesFile.parse(objectivesData);
  if (objectives.board !== board.id) throw new Error(`obiettivi per "${objectives.board}", tabellone "${board.id}"`);
  const problems = checkObjectives(board, objectives);
  if (problems.length > 0) throw new Error(`obiettivi non validi: ${problems.join('; ')}`);
  if (rules.modes.includes('objectives') && rules.players.objectivesMin > rules.players.max) {
    throw new Error(`regole: gli obiettivi segreti chiedono almeno ${rules.players.objectivesMin} giocatori, ma il massimo è ${rules.players.max}`);
  }
  if (board.territories.length < rules.players.max) {
    throw new Error(`regole: ${rules.players.max} giocatori ma solo ${board.territories.length} territori`);
  }
  for (let n = rules.players.min; n <= rules.players.max; n++) {
    if (!rules.initialArmies[String(n)]) throw new Error(`regole: mancano le armate iniziali per ${n} giocatori`);
    if (rules.initialArmies[String(n)]! < Math.ceil(board.territories.length / n)) {
      throw new Error(`regole: con ${n} giocatori le armate iniziali non bastano a coprire i territori`);
    }
  }
  return {
    board,
    rules,
    objectives: objectives.objectives,
    neighbours: boardNeighbours(board),
    continentOf: new Map(board.territories.map((t) => [t.id, t.continent])),
  };
}

/** Controlli sugli obiettivi oltre al formato: continenti esistenti, riserve valide. */
export function checkObjectives(board: BoardDef, file: ObjectivesFile): string[] {
  const out: string[] = [];
  const continents = new Set(board.continents.map((c) => c.id));
  const ids = new Set<string>();
  for (const o of file.objectives) {
    if (ids.has(o.id)) out.push(`obiettivo "${o.id}" ripetuto`);
    ids.add(o.id);
  }
  for (const o of file.objectives) {
    if (o.kind === 'continents') {
      for (const c of o.continents) if (!continents.has(c)) out.push(`${o.id}: continente "${c}" inesistente`);
      if ((o.plusAny ?? 0) + o.continents.length > continents.size) out.push(`${o.id}: chiede più continenti di quanti ce ne sono`);
    }
    if (o.kind === 'territories' && o.count > board.territories.length) out.push(`${o.id}: più territori di quanti ce ne sono`);
    if (o.kind === 'eliminate') {
      const fb = file.objectives.find((x) => x.id === o.fallback);
      if (!fb) out.push(`${o.id}: riserva "${o.fallback}" inesistente`);
      else if (fb.kind === 'eliminate') out.push(`${o.id}: la riserva non può essere un altro "elimina"`);
      if (!o.text.includes('{giocatore}')) out.push(`${o.id}: il testo deve contenere {giocatore}`);
    }
  }
  return out;
}
