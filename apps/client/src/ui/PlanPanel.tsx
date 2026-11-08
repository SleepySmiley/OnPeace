import type { Action, GameState, PlannedStep } from '@onpeace/engine';
import { describeAction } from '../game/describe';
import { useSession } from '../game/store';

interface Props {
  game: GameState;
  actions: Action[];
  steps: PlannedStep[];
}

/** Ordini del turno, nell'ordine in cui verranno eseguiti. */
export function PlanPanel({ game, actions, steps }: Props) {
  const removeAction = useSession((s) => s.removeAction);
  if (actions.length === 0) {
    return (
      <p className="placeholder">
        Nessun ordine. Clicca una tua città per arruolare o una tua pila per muoverla. L'ordine conta: le azioni
        vengono eseguite nella sequenza in cui le dai.
      </p>
    );
  }
  return (
    <ol className="plan-list">
      {actions.map((a, i) => {
        const step = steps[i];
        return (
          <li key={i} className={step && !step.ok ? 'invalid' : ''} title={step?.errors.join('\n')}>
            <span className="plan-index num">{i + 1}</span>
            <span className="plan-text">
              {describeAction(game, a, step)}
              {step && !step.ok && <span className="error-text block">{step.errors[0]}</span>}
            </span>
            <button type="button" className="ghost tiny" aria-label="Togli ordine" onClick={() => removeAction(i)}>
              ✕
            </button>
          </li>
        );
      })}
    </ol>
  );
}
