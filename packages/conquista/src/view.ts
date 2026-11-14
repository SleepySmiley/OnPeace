/**
 * Quello che un giocatore può vedere: tutto il tabellone, ma delle carte e degli obiettivi
 * altrui solo quanti sono (gli obiettivi si scoprono a fine partita). Il mazzo resta coperto.
 */
import { describeObjective } from './objectives';
import type { Card, GameContext, GameEvent, GameState, Phase, TerritoryState, TurnState } from './state';
import type { GameMode } from './schema';

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  cardCount: number;
  /** Solo le proprie (o tutte a partita finita). */
  cards: Card[] | null;
  /** Testo dell'obiettivo: proprio, o di tutti a partita finita. */
  objective: string | null;
  setupLeft: number;
  setupDone: boolean;
  /** Piazzamento tutti insieme: le proprie armate già decise e ancora coperte. */
  pending: Record<string, number> | null;
  eliminatedBy?: string;
}

export interface GameView {
  board: string;
  mode: GameMode;
  players: PlayerView[];
  order: string[];
  territories: Record<string, TerritoryState>;
  phase: Phase;
  setupPlayer: string | null;
  turn: TurnState | null;
  deckCount: number;
  winner: string | null;
}

export function viewFor(ctx: GameContext, state: GameState, viewer: string | null): GameView {
  const over = state.phase === 'over';
  return {
    board: state.board,
    mode: state.mode,
    players: state.players.map((p) => {
      const visible = over || p.id === viewer;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        alive: p.alive,
        cardCount: p.cards.length,
        cards: visible ? p.cards : null,
        objective: visible && p.objective ? describeObjective(ctx, state, p.objective) : null,
        setupLeft: p.setupLeft,
        setupDone: p.setupDone,
        pending: visible ? (p.pending ?? null) : null,
        ...(p.eliminatedBy ? { eliminatedBy: p.eliminatedBy } : {}),
      };
    }),
    order: state.order,
    territories: state.territories,
    phase: state.phase,
    setupPlayer: state.setupPlayer,
    turn: state.turn,
    deckCount: state.deck.length,
    winner: state.winner,
  };
}

/**
 * Eventi visibili a un giocatore: la carta pescata si vede solo da chi la pesca; il cambio di
 * obiettivo solo dall'interessato (agli altri rivelerebbe chi doveva eliminare chi); nel
 * piazzamento tutti insieme, dove ha messo le armate un altro resta coperto.
 */
export function eventsFor(events: readonly GameEvent[], viewer: string | null): GameEvent[] {
  return events.flatMap((e) => {
    if (e.type === 'card' && e.player !== viewer) return [{ ...e, card: null }];
    if (e.type === 'setup-place' && e.hidden && e.player !== viewer) return [{ ...e, placements: {} }];
    if (e.type === 'objective-changed' && e.player !== viewer) return [];
    return [e];
  });
}
