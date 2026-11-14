/** Obiettivi segreti: distribuzione, verifica e testo da mostrare. */
import type { Rng } from '@onpeace/engine';
import { shuffle } from './cards';
import type { ObjectiveDef } from './schema';
import type { GameContext, GameState, PlayerObjective } from './state';

/** Distribuisce un obiettivo diverso a ogni giocatore; "elimina" può uscire una volta per bersaglio. */
export function dealObjectives(ctx: GameContext, playerIds: string[], rng: Pick<Rng, 'int'>): Map<string, PlayerObjective> {
  const pool: PlayerObjective[] = [];
  for (const o of ctx.objectives) {
    if (o.kind === 'eliminate') for (const target of playerIds) pool.push({ id: o.id, target });
    else pool.push({ id: o.id });
  }
  const deck = shuffle(pool, rng);
  const out = new Map<string, PlayerObjective>();
  for (const player of playerIds) {
    const i = deck.findIndex((o) => o.target !== player);
    if (i < 0) throw new Error('obiettivi insufficienti per tutti i giocatori');
    out.set(player, deck[i]!);
    deck.splice(i, 1);
  }
  return out;
}

export function objectiveDef(ctx: GameContext, id: string): ObjectiveDef {
  const def = ctx.objectives.find((o) => o.id === id);
  if (!def) throw new Error(`obiettivo "${id}" inesistente`);
  return def;
}

/** Continenti posseduti per intero da un giocatore. */
export function continentsHeld(ctx: GameContext, state: GameState, player: string): string[] {
  return ctx.board.continents
    .filter((c) => ctx.board.territories.every((t) => t.continent !== c.id || state.territories[t.id]!.owner === player))
    .map((c) => c.id);
}

export function objectiveMet(ctx: GameContext, state: GameState, player: string): boolean {
  const p = state.players.find((x) => x.id === player);
  if (!p?.objective || !p.alive) return false;
  const def = objectiveDef(ctx, p.objective.id);
  switch (def.kind) {
    case 'territories': {
      const owned = Object.values(state.territories).filter((t) => t.owner === player && t.armies >= (def.minArmies ?? 1));
      return owned.length >= def.count;
    }
    case 'continents': {
      const held = new Set(continentsHeld(ctx, state, player));
      if (!def.continents.every((c) => held.has(c))) return false;
      const extra = [...held].filter((c) => !def.continents.includes(c)).length;
      return extra >= (def.plusAny ?? 0);
    }
    case 'eliminate': {
      const target = state.players.find((x) => x.id === p.objective!.target);
      return !!target && !target.alive && target.eliminatedBy === player;
    }
  }
}

/** Testo dell'obiettivo per il giocatore (con il nome del bersaglio). */
export function describeObjective(ctx: GameContext, state: GameState, objective: PlayerObjective): string {
  const def = objectiveDef(ctx, objective.id);
  if (def.kind !== 'eliminate') return def.text;
  const target = state.players.find((p) => p.id === objective.target);
  // con una funzione: un nome come "$&" altrimenti verrebbe interpretato da replace
  return def.text.replace('{giocatore}', () => target?.name ?? 'il bersaglio');
}
