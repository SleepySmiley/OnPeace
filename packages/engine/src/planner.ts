/**
 * Anteprima del piano di un giocatore durante il turno: applica le sue azioni in ordine
 * su una copia dello stato, senza gli altri giocatori e senza combattimenti.
 * Serve all'interfaccia (soldi rimasti, rinforzi, pile spostate, frecce d'attacco)
 * e a segnalare subito gli ordini non validi.
 */
import type { Action } from './actions';
import type { GameContext } from './context';
import { areAllies } from './diplomacy';
import { RuleError } from './errors';
import type { Point } from './geometry';
import {
  applyLoad,
  checkLoad,
  checkMove,
  checkUnload,
  placeUnits,
  relocate,
  takeFromCargo,
  type Arrival,
} from './movement';
import type { NavGrid } from './navigation';
import { applyPurchase, validatePurchase } from './purchase';
import { allUnits, getPlayer, type GameState, type PlayerId, type StackState, type UnitState } from './state';

export interface PlannedStep {
  index: number;
  kind: Action['kind'];
  ok: boolean;
  errors: string[];
  /** Per movimenti e sbarchi: da dove a dove (con i punti intermedi). */
  path?: Point[];
  arrival?: Arrival;
}

export interface PlanPreview {
  state: GameState;
  steps: PlannedStep[];
  /** Unità che hanno già usato il movimento in questo turno. */
  moved: Set<string>;
}

const markMoved = (moved: Set<string>, units: readonly UnitState[]) => {
  for (const u of units) for (const x of allUnits({ units: [u] } as StackState)) moved.add(x.id);
};

export function simulatePlan(
  input: GameState,
  ctx: GameContext,
  nav: NavGrid,
  player: PlayerId,
  actions: readonly Action[],
): PlanPreview {
  const state = structuredClone(input);
  const moved = new Set<string>();
  const steps: PlannedStep[] = [];

  actions.forEach((action, index) => {
    const step: PlannedStep = { index, kind: action.kind, ok: true, errors: [] };
    steps.push(step);
    const fail = (errors: string[]) => {
      step.ok = false;
      step.errors = errors;
    };
    try {
      switch (action.kind) {
        case 'buy': {
          const errors = validatePurchase(state, ctx, player, action.order);
          if (errors.length > 0) return fail(errors);
          applyPurchase(state, ctx, player, action.order);
          return;
        }
        case 'move': {
          const check = checkMove(state, ctx, nav, player, action, moved);
          if (!check.ok) return fail(check.errors);
          const { plan } = check;
          step.path = [plan.source.pos, ...plan.path];
          step.arrival = plan.arrival;
          markMoved(moved, plan.units);
          // gli attacchi restano fermi nell'anteprima: l'esito si vede a fine turno
          if (plan.arrival === 'move' || plan.arrival === 'join') {
            relocate(state, player, plan.source, plan.units, plan.end, plan.endCity?.id ?? null);
          }
          return;
        }
        case 'load': {
          const check = checkLoad(state, ctx, player, action);
          if (!check.ok) return fail(check.errors);
          applyLoad(check.plan);
          return;
        }
        case 'unload': {
          const check = checkUnload(state, ctx, nav, player, action);
          if (!check.ok) return fail(check.errors);
          const { plan } = check;
          step.path = [plan.source.pos, plan.end];
          step.arrival = plan.arrival;
          markMoved(moved, plan.units);
          if (plan.arrival !== 'attack_city') {
            takeFromCargo(plan.source, plan.units);
            placeUnits(state, player, plan.units, plan.end, plan.endCity?.id ?? null);
          }
          return;
        }
        case 'send_money': {
          const me = getPlayer(state, player);
          if (!areAllies(state, player, action.to) || action.to === player) return fail(['Solo agli alleati']);
          if (action.amount <= 0 || action.amount > me.money) return fail(['Importo non valido']);
          me.money -= action.amount;
          return;
        }
        default:
          // diplomazia, risposte e cessioni si verificano a fine turno
          return;
      }
    } catch (err) {
      if (err instanceof RuleError) return fail([err.message]);
      throw err;
    }
  });

  return { state, steps, moved };
}
