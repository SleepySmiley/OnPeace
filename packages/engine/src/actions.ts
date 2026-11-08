/**
 * Azioni che un giocatore pianifica durante il turno. Vengono eseguite a fine turno
 * nell'ordine in cui il giocatore le ha date (intercalate a caso con quelle degli altri).
 */
import { distance, type Point } from './geometry';
import type { PurchaseOrder } from './purchase';
import type { GameState, PlayerId, StackState } from './state';

/**
 * Riferimento a una pila propria. Le pile cambiano id quando si muovono o si
 * formano con gli acquisti, quindi si possono indicare anche per città o posizione.
 */
export type StackRef = { stack: string } | { city: string } | { at: Point };

/** Unità selezionate per tipo e quantità (come i cursori di "Muovi truppe"). */
export type UnitSelection = { type: string; count: number }[];

export type Action =
  | { kind: 'buy'; order: PurchaseOrder }
  | {
      kind: 'move';
      from: StackRef;
      units: UnitSelection;
      /** Punti di passaggio, l'ultimo è la destinazione (la partenza è la pila). */
      path: Point[];
      /** Pila nemica bersaglio, se l'ordine è un attacco a una pila. */
      target?: string;
    }
  | { kind: 'load'; from: StackRef; units: UnitSelection }
  | { kind: 'unload'; from: StackRef; units: UnitSelection; to: Point }
  | { kind: 'diplomacy'; to: PlayerId; proposal: 'peace' | 'alliance' | 'war' }
  | { kind: 'respond'; proposal: string; accept: boolean }
  | { kind: 'send_money'; to: PlayerId; amount: number }
  | { kind: 'give_city'; city: string; to: PlayerId };

/** Tolleranza per riconoscere una pila "nello stesso punto". */
export const SAME_POINT = 0.5;

export function resolveStackRef(state: GameState, owner: PlayerId, ref: StackRef): StackState | undefined {
  if ('stack' in ref) return state.stacks.find((s) => s.id === ref.stack && s.owner === owner);
  if ('city' in ref) return state.stacks.find((s) => s.owner === owner && s.city === ref.city);
  return state.stacks.find((s) => s.owner === owner && distance(s.pos, ref.at) <= SAME_POINT);
}
