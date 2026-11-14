import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BoardDef } from '@onpeace/engine';
import { createContext, createGame, type GameContext, type GameMode, type GameState } from '../src';

export const data = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../data/${path}`, import.meta.url)), 'utf8'));

let cached: GameContext | null = null;
/** Contesto vero: tabellone del mondo, regole e obiettivi da data/ (con eventuali regole cambiate). */
export function worldContext(patch?: (rules: Record<string, unknown>) => void): GameContext {
  if (!patch && cached) return cached;
  const rules = data('conquista/regole.json');
  patch?.(rules);
  const ctx = createContext(BoardDef.parse(data('territori/mondo.json')), rules, data('conquista/obiettivi/mondo.json'));
  if (!patch) cached = ctx;
  return ctx;
}

let classic: GameContext | null = null;
/**
 * Come al tavolo: territori distribuiti a caso e niente lettura dell'obiettivo, si parte dal
 * piazzamento. Per provare tutto il resto senza passare ogni volta dall'inizio.
 */
export function classicContext(patch?: (rules: Record<string, unknown>) => void): GameContext {
  if (!patch && classic) return classic;
  const ctx = worldContext((r) => {
    const setup = r.setup as { briefing: boolean; distribution: string };
    setup.briefing = false;
    setup.distribution = 'random';
    patch?.(r);
  });
  if (!patch) classic = ctx;
  return ctx;
}

export const PLAYERS = ['ada', 'bruno', 'carla', 'dario', 'elena', 'franco'].map((id, i) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  color: ['#2f5fb3', '#c8302c', '#2e8b47', '#e2b72f', '#7b3fa0', '#e07a1f'][i]!,
}));

/** Partita nuova; con le regole classiche (vedi classicContext) se non si dice altro. */
export function newGame(n = 4, mode: GameMode = 'objectives', seed: number | readonly number[] = 1234, ctx = classicContext()): GameState {
  return createGame(ctx, PLAYERS.slice(0, n), mode, seed);
}

/** Copia con alcune modifiche ai territori: { id: [padrone, armate] }. */
export function setTerritories(state: GameState, changes: Record<string, [string, number]>): GameState {
  const s = structuredClone(state);
  for (const [id, [owner, armies]] of Object.entries(changes)) s.territories[id] = { owner, armies };
  return s;
}

/** Porta una partita appena creata al primo turno, piazzando tutto sul primo territorio di ognuno. */
export function skipSetup(ctx: GameContext, state: GameState): GameState {
  const s = structuredClone(state);
  for (const p of s.players) {
    const first = Object.keys(s.territories).find((t) => s.territories[t]!.owner === p.id)!;
    s.territories[first]!.armies += p.setupLeft;
    p.setupLeft = 0;
    p.setupDone = true;
  }
  s.phase = 'reinforce';
  s.setupPlayer = null;
  s.turn = { player: s.order[0]!, number: 1, reinforcements: 3, conquered: false, occupation: null, fortifyLeft: ctx.rules.fortify.moves };
  return s;
}

/** Totale delle carte in gioco (mazzo, scarti, mani): non cambia mai. */
export function cardTotal(s: GameState): number {
  return s.deck.length + s.discard.length + s.players.reduce((n, p) => n + p.cards.length, 0);
}
