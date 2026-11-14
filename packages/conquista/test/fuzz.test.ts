/**
 * Partite intere giocate a caso (ma sempre in modo legale) fino alla vittoria: il motore non deve
 * mai rompere le regole né perdere armate o carte per strada.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '@onpeace/engine';
import { applyAction, eliminationAllowed, ownedBy, possibleSets, timeout, type Action, type GameMode, type GameState } from '../src';
import { cardTotal, newGame, worldContext } from './helpers';

const ctx = worldContext();

function checkInvariants(s: GameState, cards: number) {
  for (const [id, t] of Object.entries(s.territories)) {
    expect(t.armies, id).toBeGreaterThanOrEqual(s.turn?.occupation?.to === id ? 0 : 1);
    expect(s.players.find((p) => p.id === t.owner)!.alive, id).toBe(true);
  }
  expect(cardTotal(s)).toBe(cards);
}

/** Una mossa a caso tra quelle legali per chi deve giocare. */
function randomMove(s: GameState, rng: ReturnType<typeof createRng>): { player: string; action: Action } | null {
  if (s.phase === 'setup') return null;
  const me = s.turn!.player;
  const turn = s.turn!;
  const mine = ownedBy(s, me);
  if (turn.occupation) {
    return { player: me, action: { kind: 'occupy', armies: rng.int(turn.occupation.min, turn.occupation.max) } };
  }
  if (s.phase === 'reinforce') {
    const sets = possibleSets(ctx.rules, s.players.find((p) => p.id === me)!.cards);
    if (sets.length > 0 && rng.next() < 0.7) {
      return { player: me, action: { kind: 'play-set', cards: sets[0]!.cards.map((c) => c.id) as [string, string, string] } };
    }
    const placements: Record<string, number> = {};
    for (let i = 0; i < turn.reinforcements; i++) {
      const t = rng.pick(mine);
      placements[t] = (placements[t] ?? 0) + 1;
    }
    return { player: me, action: { kind: 'reinforce', placements } };
  }
  if (s.phase === 'attack') {
    const options = mine.flatMap((from) =>
      (ctx.neighbours.get(from) ?? [])
        .filter((to) => s.territories[to]!.owner !== me && s.territories[from]!.armies > 1)
        // regola Prestige: nei primi giri l'ultimo territorio di un giocatore non si attacca
        .filter((to) => eliminationAllowed(ctx, s) || ownedBy(s, s.territories[to]!.owner).length > 1)
        .map((to) => ({ from, to })),
    );
    if (options.length > 0 && rng.next() < 0.85) {
      const { from, to } = rng.pick(options);
      const dice = Math.min(3, s.territories[from]!.armies - 1);
      return { player: me, action: { kind: 'attack', from, to, dice: rng.int(1, dice) } };
    }
    return { player: me, action: { kind: rng.next() < 0.5 ? 'end-attack' : 'end-turn' } };
  }
  // spostamento
  const moves = mine.flatMap((from) =>
    (ctx.neighbours.get(from) ?? []).filter((to) => s.territories[to]!.owner === me && s.territories[from]!.armies > 1).map((to) => ({ from, to })),
  );
  if (moves.length > 0 && rng.next() < 0.6) {
    const { from, to } = rng.pick(moves);
    return { player: me, action: { kind: 'fortify', from, to, armies: rng.int(1, s.territories[from]!.armies - 1) } };
  }
  return { player: me, action: { kind: 'end-turn' } };
}

function play(players: number, mode: GameMode, seed: number) {
  let s = newGame(players, mode, seed);
  while (s.phase === 'setup') s = timeout(ctx, s).state;
  const cards = cardTotal(s);
  const rng = createRng(seed * 7 + 1);
  let steps = 0;
  while (s.phase !== 'over' && steps < 60_000) {
    steps++;
    const move = randomMove(s, rng);
    s = move ? applyAction(ctx, s, move.player, move.action).state : timeout(ctx, s).state;
    if (steps % 50 === 0) checkInvariants(s, cards);
  }
  return { s, steps };
}

describe('partite casuali fino alla fine', () => {
  for (const mode of ['objectives', 'conquest'] as const) {
    for (const [players, seed] of [
      [mode === 'objectives' ? 3 : 2, 11],
      [3, 22],
      [5, 33],
      [6, 44],
    ] as const) {
      it(`${mode}, ${players} giocatori (seme ${seed})`, () => {
        const { s } = play(players, mode, seed);
        expect(s.phase).toBe('over');
        expect(s.winner).not.toBeNull();
        if (mode === 'conquest') expect(new Set(Object.values(s.territories).map((t) => t.owner)).size).toBe(1);
      });
    }
  }
});
