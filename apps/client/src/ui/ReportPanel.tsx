import type { GameState, TurnEvent } from '@onpeace/engine';
import { describeEvent } from '../game/describe';

interface Props {
  game: GameState;
  events: TurnEvent[];
  turn: number;
}

/** Resoconto dell'ultimo turno risolto. */
export function ReportPanel({ game, events, turn }: Props) {
  const lines = events
    .map((e) => ({ e, text: describeEvent(game, e) }))
    .filter((x): x is { e: TurnEvent; text: string } => x.text !== null);
  if (lines.length === 0) return <p className="placeholder">Nessun evento da riportare.</p>;
  return (
    <div className="report">
      <div className="panel-kicker">Turno {turn}</div>
      <ul className="report-list">
        {lines.map(({ e, text }, i) => (
          <li key={i} className={`ev-${e.kind}`}>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
