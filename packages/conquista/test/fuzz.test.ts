/**
 * Partite intere giocate a caso (ma sempre in modo legale, con qualche tempo scaduto in ogni fase)
 * fino alla vittoria: il motore non deve mai rompere le regole né perdere armate o carte per strada.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '@onpeace/engine';
import { applyAction, eliminationAllowed, maxAttackDice, ownedBy, possibleSets, sendsArmies, timeout, type Action, type GameMode, type GameState } from '../src';
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
function randomMove(s: GameState, rng: ReturnType<typeof createRng>, c = ctx): { player: string; action: Action } | null {
  // null = lascia scadere il tempo (sempre in preparazione, ogni tanto nelle altre fasi)
  if (s.phase === 'setup' || rng.next() < 0.03) return null;
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
      const dice = Math.min(sendsArmies(c.rules.dice) ? Infinity : maxAttackDice(c.rules.dice), s.territories[from]!.armies - 1);
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

const armiesOnBoard = (s: GameState) => Object.values(s.territories).reduce((n, t) => n + t.armies, 0);

function play(players: number, mode: GameMode, seed: number, c = ctx) {
  // con le regole vere: obiettivo, territori scelti a turno (tutti a tempo scaduto), piazzamento
  let s = newGame(players, mode, seed, c);
  expect(s.phase).toBe('briefing');
  while (s.phase === 'briefing' || s.phase === 'draft' || s.phase === 'setup') s = timeout(c, s).state;
  const cards = cardTotal(s);
  const rng = createRng(seed * 7 + 1);
  const seen = { fortify: 0, timeouts: 0 };
  // armate attese: cambiano solo con i rinforzi (più) e con le battaglie (meno)
  let armies = armiesOnBoard(s);
  let steps = 0;
  while (s.phase !== 'over' && steps < 60_000) {
    steps++;
    const move = randomMove(s, rng, c);
    const r = move ? applyAction(c, s, move.player, move.action) : timeout(c, s);
    if (!move) seen.timeouts++;
    s = r.state;
    for (const e of r.events) {
      if (e.type === 'reinforce') armies += Object.values(e.placements).reduce((n, x) => n + x, 0);
      if (e.type === 'battle') armies -= e.attackerLosses + e.defenderLosses;
      if (e.type === 'fortify') seen.fortify++;
    }
    expect(armiesOnBoard(s)).toBe(armies);
    if (steps % 50 === 0) checkInvariants(s, cards);
  }
  checkInvariants(s, cards);
  return { s, steps, seen };
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
        const { s, seen } = play(players, mode, seed);
        expect(s.phase).toBe('over');
        expect(seen.fortify).toBeGreaterThan(0);
        expect(seen.timeouts).toBeGreaterThan(0);
        expect(s.winner).not.toBeNull();
        if (mode === 'conquest') expect(new Set(Object.values(s.territories).map((t) => t.owner)).size).toBe(1);
      });
    }
  }
});

describe('partite casuali con le altre regole dei dadi', () => {
  for (const [combat, ties, defenseMax, seed] of [
    ['pairs', 'attacker', 3, 55],
    ['pairs', 'reroll-pair', 3, 66],
    ['pairs', 'reroll-all', 2, 78],
    ['hits', 'defender', 3, 88],
    ['alternate', 'defender', 3, 99],
  ] as const) {
    const name = { pairs: `pari: ${ties}, difesa fino a ${defenseMax} dadi`, hits: 'a colpi', alternate: 'a colpi, a turno' }[combat];
    it(name, () => {
      const c = worldContext((r) => {
        const dice = r.dice as { combat: string; tiesTo: string; defenseMax: number };
        dice.combat = combat;
        dice.tiesTo = ties;
        dice.defenseMax = defenseMax;
      });
      const { s } = play(4, 'conquest', seed, c);
      expect(s.phase).toBe('over');
      expect(new Set(Object.values(s.territories).map((t) => t.owner)).size).toBe(1);
    });
  }
});
