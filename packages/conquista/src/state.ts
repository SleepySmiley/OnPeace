/** Stato di una partita di conquista, azioni dei giocatori ed eventi prodotti dal motore. */
import { z } from 'zod';
import type { BoardDef } from '@onpeace/engine';
import type { Seed } from './random';
import type { CardSymbol, ConquestRules, GameMode, ObjectiveDef } from './schema';

export interface Card {
  id: string;
  /** Territorio raffigurato (null per i jolly). */
  territory: string | null;
  symbol: CardSymbol | 'joker';
}

export interface PlayerObjective {
  id: string;
  /** Per "elimina": il giocatore bersaglio. */
  target?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  cards: Card[];
  objective: PlayerObjective | null;
  /** Armate iniziali ancora da piazzare (preparazione; ogni territorio scelto a turno ne usa una). */
  setupLeft: number;
  /** Ha letto il suo obiettivo (inizio partita). */
  ready?: boolean;
  /** Ha confermato il piazzamento iniziale. */
  setupDone: boolean;
  /** Piazzamento tutti insieme: armate già decise ma ancora coperte, si scoprono quando hanno confermato tutti. */
  pending?: Record<string, number>;
  eliminatedBy?: string;
}

export interface TerritoryState {
  owner: string;
  armies: number;
}

/** Territorio appena conquistato: bisogna decidere quante armate farci entrare. */
export interface Occupation {
  from: string;
  to: string;
  min: number;
  max: number;
}

export interface TurnState {
  player: string;
  /** Turno numero (1 = il primo turno del primo giocatore). */
  number: number;
  /** Armate da piazzare nei rinforzi (cresce con i tris). */
  reinforcements: number;
  /** Ha conquistato almeno un territorio: a fine turno pesca una carta. */
  conquered: boolean;
  occupation: Occupation | null;
  fortifyLeft: number;
}

/** Lettura dell'obiettivo, scelta dei territori, piazzamento iniziale, poi i turni. */
export type Phase = 'briefing' | 'draft' | 'setup' | 'reinforce' | 'attack' | 'fortify' | 'over';

export interface GameState {
  board: string;
  mode: GameMode;
  /** Stato del generatore casuale (dadi, carte): partita riproducibile. */
  seed: Seed;
  players: PlayerState[];
  /** Ordine di gioco (id dei giocatori). */
  order: string[];
  /** Territori con padrone: durante la scelta a turno mancano quelli ancora liberi. */
  territories: Record<string, TerritoryState>;
  phase: Phase;
  /** Preparazione: chi sceglie un territorio (scelta a turno) o chi piazza (a giri); null se tutti insieme o finita. */
  setupPlayer: string | null;
  turn: TurnState | null;
  deck: Card[];
  discard: Card[];
  winner: string | null;
}

/** Tutto quello che serve al motore oltre allo stato. */
export interface GameContext {
  board: BoardDef;
  rules: ConquestRules;
  objectives: ObjectiveDef[];
  neighbours: Map<string, string[]>;
  continentOf: Map<string, string>;
}

const Id = z.string().min(1).max(64);
const Placements = z.record(Id, z.number().int().min(1).max(10_000));

export const ActionS = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('pick'), territory: Id }),
  z.object({ kind: z.literal('setup-place'), placements: Placements }),
  z.object({ kind: z.literal('play-set'), cards: z.tuple([Id, Id, Id]) }),
  z.object({ kind: z.literal('reinforce'), placements: Placements }),
  z.object({ kind: z.literal('attack'), from: Id, to: Id, dice: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal('occupy'), armies: z.number().int().min(1).max(10_000) }),
  z.object({ kind: z.literal('end-attack') }),
  z.object({ kind: z.literal('fortify'), from: Id, to: Id, armies: z.number().int().min(1).max(10_000) }),
  z.object({ kind: z.literal('end-turn') }),
]);
export type Action = z.infer<typeof ActionS>;

export type GameEvent =
  | { type: 'ready'; player: string }
  | { type: 'pick'; player: string; territory: string }
  | { type: 'setup-place'; player: string; placements: Record<string, number>; left: number; hidden?: boolean }
  /** Piazzamento tutti insieme: le armate coperte di tutti, scoperte insieme (giocatore -> territorio -> armate). */
  | { type: 'setup-reveal'; placements: Record<string, Record<string, number>> }
  | { type: 'turn'; player: string; number: number; reinforcements: number }
  | { type: 'set'; player: string; cards: Card[]; armies: number }
  | { type: 'reinforce'; player: string; placements: Record<string, number> }
  | {
      type: 'battle';
      player: string;
      defender: string;
      from: string;
      to: string;
      attack: number[];
      defense: number[];
      attackerLosses: number;
      defenderLosses: number;
      conquered: boolean;
    }
  | { type: 'occupy'; player: string; from: string; to: string; armies: number }
  | { type: 'fortify'; player: string; from: string; to: string; armies: number }
  | { type: 'card'; player: string; card: Card | null }
  | { type: 'eliminated'; player: string; by: string; cardsTaken: number }
  | { type: 'objective-changed'; player: string }
  | { type: 'victory'; player: string; reason: 'objective' | 'conquest' | 'last-standing' };

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}
