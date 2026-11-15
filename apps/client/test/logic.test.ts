/** Mossa del giocatore e quando le scelte non confermate ripartono da capo. */
import { describe, expect, it } from 'vitest';
import type { ConquestRules, GameView } from '@onpeace/conquista';
import { moveKey, myMove } from '../src/play/logic';

type P = { id: string; setupLeft: number; setupDone?: boolean; pending?: Record<string, number> };
/** Solo i campi che contano per la mossa: il resto della vista qui non serve. */
const setupView = (players: P[], setupPlayer: string | null = null) =>
  ({
    phase: 'setup',
    setupPlayer,
    turn: null,
    players: players.map((p) => ({ alive: true, ready: true, setupDone: false, ...p })),
  }) as unknown as GameView;
const rules = (placement: 'rounds' | 'simultaneous') => ({ setup: { placement, perRound: 3 } }) as unknown as ConquestRules;

describe('scelte non confermate', () => {
  it('piazzamento tutti insieme: se un altro conferma, le mie armate restano', () => {
    const r = rules('simultaneous');
    const before = setupView([
      { id: 'io', setupLeft: 20 },
      { id: 'lui', setupLeft: 20 },
    ]);
    // lui ha confermato: le sue armate sono coperte, a lui non ne restano
    const after = setupView([
      { id: 'io', setupLeft: 20 },
      { id: 'lui', setupLeft: 0, setupDone: true },
    ]);
    expect(myMove(after, 'io', r)).toEqual({ kind: 'place', setup: true, budget: 20 });
    expect(moveKey(after, myMove(after, 'io', r), 'io')).toBe(moveKey(before, myMove(before, 'io', r), 'io'));
  });

  it('piazzamento a giri: dopo il mio giro si riparte da capo, anche se tocca di nuovo a me', () => {
    const r = rules('rounds');
    const before = setupView([{ id: 'io', setupLeft: 9 }, { id: 'lui', setupLeft: 0, setupDone: true }], 'io');
    const after = setupView([{ id: 'io', setupLeft: 6 }, { id: 'lui', setupLeft: 0, setupDone: true }], 'io');
    expect(moveKey(after, myMove(after, 'io', r), 'io')).not.toBe(moveKey(before, myMove(before, 'io', r), 'io'));
  });
});
