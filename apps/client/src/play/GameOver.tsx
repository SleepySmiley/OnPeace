/** Fine partita: chi vince e perché, gli obiettivi segreti di tutti, i territori di ciascuno. */
import { useSession } from '../store';
import { Chip } from './bits';
import { totals } from './logic';
import { useGame } from './useGame';

export function GameOver({ onClose }: { onClose: () => void }) {
  const { view, me, colorOf } = useGame();
  const log = useSession((s) => s.log);
  const leave = useSession((s) => s.leave);
  const winner = view.players.find((p) => p.id === view.winner);
  const victory = [...log].reverse().find((e) => e.event.type === 'victory')?.event;
  const mine = winner?.id === me;
  const why = victory?.type === 'victory' ? victory.reason : null;
  const reason =
    why === 'objective'
      ? mine
        ? 'hai raggiunto il tuo obiettivo segreto'
        : 'ha raggiunto il suo obiettivo segreto'
      : why === 'conquest'
        ? mine
          ? 'hai conquistato tutto il mondo'
          : 'ha conquistato tutto il mondo'
        : 'non è rimasto nessun altro in gioco';
  const rows = [...view.players].sort((a, b) => totals(view, b).territories - totals(view, a).territories);

  return (
    <div className="modal-backdrop">
      <div className="modal gameover" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
        <p className="kicker">Partita finita</p>
        <h1 id="gameover-title">
          {winner ? (
            <>
              <Chip color={colorOf(winner.id)} /> {winner.id === me ? 'Hai vinto!' : `Vince ${winner.name}`}
            </>
          ) : (
            'Nessun vincitore'
          )}
        </h1>
        {winner && (
          <p className="lead">
            {mine ? `Complimenti: ${reason}.` : why === 'objective' || why === 'conquest' ? `${winner.name} ${reason}.` : 'Non è rimasto nessun altro in gioco.'}
          </p>
        )}
        <ul className="gameover-rows">
          {rows.map((p) => (
            <li key={p.id} className={p.id === view.winner ? 'winner' : ''}>
              <Chip color={colorOf(p.id)} />
              <span className="player-name">
                {p.name}
                {p.id === me && <span className="dim"> (tu)</span>}
              </span>
              <span className="num">{totals(view, p).territories} terr.</span>
              {p.objective && <span className="objective-text">{p.objective.text}</span>}
            </li>
          ))}
        </ul>
        <div className="button-row">
          <button type="button" className="primary" onClick={leave}>
            Torna all'inizio
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Guarda il tabellone
          </button>
        </div>
      </div>
    </div>
  );
}
