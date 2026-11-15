/** Mossa del giocatore, quando le scelte non confermate ripartono da capo, e cosa mostrano i pannelli. */
import { describe, expect, it } from 'vitest';
import type { ConquestRules, GameView } from '@onpeace/conquista';
import type { LobbyInfo, LobbyPlayer } from '@onpeace/protocol';
import { canKick, canUsePause, holdsContinent, moveKey, myMove, preparationPhases } from '../src/play/logic';

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

describe('continente tutto di qualcuno', () => {
  const territories = [
    { id: 'brasile', continent: 'sud' },
    { id: 'peru', continent: 'sud' },
    { id: 'messico', continent: 'nord' },
  ];
  const view = (owners: Record<string, string>) =>
    ({ territories: Object.fromEntries(Object.entries(owners).map(([id, owner]) => [id, { owner, armies: 1 }])) }) as unknown as GameView;

  it('nella scelta a turno i territori ancora liberi non sono di nessuno', () => {
    expect(holdsContinent(view({ brasile: 'io' }), territories, 'sud', 'io')).toBe(false);
  });

  it('tutto preso: è tutto suo, gli altri continenti non contano', () => {
    expect(holdsContinent(view({ brasile: 'io', peru: 'io', messico: 'lui' }), territories, 'sud', 'io')).toBe(true);
    expect(holdsContinent(view({ brasile: 'io', peru: 'lui', messico: 'lui' }), territories, 'sud', 'io')).toBe(false);
  });
});

describe('fasi della preparazione', () => {
  const rules = (briefing: boolean, distribution: 'draft' | 'random') => ({ setup: { briefing, distribution } }) as unknown as ConquestRules;

  it('con i territori distribuiti a caso la scelta non c’è', () => {
    expect(preparationPhases(rules(true, 'draft'))).toEqual(['briefing', 'draft', 'setup']);
    expect(preparationPhases(rules(true, 'random'))).toEqual(['briefing', 'setup']);
    expect(preparationPhases(rules(false, 'random'))).toEqual(['setup']);
  });
});

describe('host e giocatori assenti', () => {
  const seat = (id: string, patch: Partial<LobbyPlayer> = {}): LobbyPlayer => ({ id, name: id, color: '#000000', connected: true, left: false, idleTurns: 0, ...patch });
  const lobby = (players: LobbyPlayer[], phase: LobbyInfo['phase'] = 'playing') => ({ hostId: 'host', phase, players, kickAfterIdle: 2 }) as unknown as LobbyInfo;

  it("l'host toglie chi ha saltato abbastanza turni, solo durante la partita", () => {
    const l = lobby([seat('host'), seat('via', { connected: false, idleTurns: 2 }), seat('poco', { idleTurns: 1 }), seat('uscito', { left: true, idleTurns: 3 })]);
    expect(canKick(l, 'host', 'via', true)).toBe(true);
    expect(canKick(l, 'host', 'poco', true)).toBe(false);
    expect(canKick(l, 'host', 'uscito', true)).toBe(false);
    expect(canKick(l, 'host', 'via', false)).toBe(false);
    expect(canKick(l, 'poco', 'via', true)).toBe(false);
    expect(canKick({ ...l, phase: 'ended' }, 'host', 'via', true)).toBe(false);
  });

  it("il tempo lo ferma l'host; se l'host non è collegato lo fa ripartire chi è ancora in partita", () => {
    const here = lobby([seat('host'), seat('io'), seat('uscito', { left: true })]);
    const away = lobby([seat('host', { connected: false }), seat('io'), seat('uscito', { left: true })]);
    expect(canUsePause(here, 'host', false)).toBe(true);
    expect(canUsePause(here, 'io', true)).toBe(false);
    expect(canUsePause(away, 'io', false)).toBe(false);
    expect(canUsePause(away, 'io', true)).toBe(true);
    expect(canUsePause(away, 'uscito', true)).toBe(false);
    expect(canUsePause(away, null, true)).toBe(false);
  });
});
