/**
 * Stato di una partita. Tutto è serializzabile in JSON: il server lo salva
 * a ogni turno e lo può ricaricare dopo un riavvio.
 */
import type { Point } from './geometry';

export type PlayerId = string;
export type Relation = 'war' | 'peace' | 'alliance';

export interface PlayerState {
  id: PlayerId;
  name: string;
  color: string;
  team: number | null;
  money: number;
  /** Primo paese scelto: conta per alcune condizioni di vittoria. */
  homeCountry: string | null;
  /** Strategia scelta (null = nessuna: valori base). */
  strategy: string | null;
  /** Potenziamenti scelti per il Generale (assenti nei salvataggi più vecchi). */
  generalUpgrades?: string[];
  status: 'active' | 'eliminated' | 'surrendered' | 'left';
  score: number;
}

export interface UnitState {
  id: string;
  type: string;
  hp: number;
  /** Città in cui è stata prodotta (serve per la Banca). */
  origin: string | null;
  /** Unità caricate (solo per i trasporti). */
  cargo: UnitState[];
}

export interface StackState {
  id: string;
  /** null = truppe neutrali. */
  owner: PlayerId | null;
  pos: Point;
  /** Città in cui si trova la pila, se è dentro una città. */
  city: string | null;
  units: UnitState[];
  /** Pila invisibile scoperta (o che ha combattuto): visibile ai nemici. */
  exposed: boolean;
  /**
   * Solo nella vista di un giocatore: pila nemica fuori dal raggio visivo.
   * Se ne conosce la posizione ma non la composizione (units è vuoto).
   */
  fog?: boolean;
}

export interface CityState {
  id: string;
  owner: PlayerId | null;
  /** Percentuale del reddito nominale che la città rende ora. */
  incomePct: number;
  /** Popolazione attuale in milioni (scende con i danni collaterali). */
  population: number;
  /** Unità ancora acquistabili in questo ciclo. */
  reinforcements: number;
  /** Edifici (immobili, difendono la città). */
  buildings: UnitState[];
}

export interface RelationState {
  relation: Relation;
  /** Turno da cui scatta la guerra dichiarata (preavviso). */
  warFromTurn?: number;
}

export interface Proposal {
  id: string;
  from: PlayerId;
  to: PlayerId;
  kind: 'peace' | 'alliance';
  turn: number;
}

export type VictoryCondition = 'annihilation' | 'homeland' | 'turns';

export interface GameSettings {
  startingFunds: number;
  initialCountries: number;
  maxTurns: number;
  victory: VictoryCondition;
  maxAlliances: number;
  rareUnitChancePct: number;
  turnSeconds: number;
  /** Strategie attive (se no, tutti giocano con i valori base). Assente nei salvataggi vecchi. */
  strategies?: boolean;
  /** Ogni giocatore ha un Generale. Assente nei salvataggi vecchi. */
  general?: boolean;
}

export interface GameState {
  id: string;
  mapId: string;
  phase: 'selection' | 'playing' | 'ended';
  /** 0 durante la scelta dei paesi, poi 1, 2, … */
  turn: number;
  seed: number;
  settings: GameSettings;
  players: PlayerState[];
  cities: Record<string, CityState>;
  stacks: StackState[];
  /** Chiave: id dei due giocatori in ordine alfabetico, separati da "|". */
  relations: Record<string, RelationState>;
  proposals: Proposal[];
  /** Contatore per generare id univoci di unità e pile. */
  nextId: number;
  winners: PlayerId[] | null;
  /** Statistiche all'inizio di ogni turno (e a fine partita), per i grafici. */
  history?: TurnStats[];
}

export interface PlayerStats {
  cities: number;
  units: number;
  money: number;
  income: number;
  score: number;
}

export interface TurnStats {
  turn: number;
  players: Record<PlayerId, PlayerStats>;
}

export const relationKey = (a: PlayerId, b: PlayerId) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function newId(state: GameState, prefix: 'u' | 's' | 'p'): string {
  state.nextId += 1;
  return `${prefix}${state.nextId}`;
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`giocatore sconosciuto: ${id}`);
  return p;
}

/** Tutte le unità di una pila, comprese quelle caricate sui trasporti. */
export function allUnits(stack: StackState): UnitState[] {
  const out: UnitState[] = [];
  const visit = (u: UnitState) => {
    out.push(u);
    for (const c of u.cargo) visit(c);
  };
  for (const u of stack.units) visit(u);
  return out;
}
