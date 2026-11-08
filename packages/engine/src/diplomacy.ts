/** Relazioni tra giocatori (ricerca 01 §7). */
import type { GameContext } from './context';
import { relationKey, type GameState, type PlayerId, type Relation } from './state';

export function relationBetween(state: GameState, a: PlayerId, b: PlayerId): Relation {
  if (a === b) return 'alliance';
  return state.relations[relationKey(a, b)]?.relation ?? 'war';
}

export function areAllies(state: GameState, a: PlayerId | null, b: PlayerId | null): boolean {
  if (a === null || b === null) return false;
  return relationBetween(state, a, b) === 'alliance';
}

/** Si può attaccare il giocatore (o i neutrali, `null`) in questo turno? */
export function canAttack(state: GameState, ctx: GameContext, attacker: PlayerId, defender: PlayerId | null): boolean {
  if (defender === null) return true;
  if (defender === attacker) return false;
  if (state.turn <= ctx.rules.turn.peaceTurns) return false;
  return relationBetween(state, attacker, defender) === 'war';
}
