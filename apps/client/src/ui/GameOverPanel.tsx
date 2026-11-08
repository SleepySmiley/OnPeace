import { useState } from 'react';
import type { GameState } from '@onpeace/engine';
import { playerName } from '../game/describe';
import { StatsChart } from './StatsChart';

const fmt = new Intl.NumberFormat('it-IT');
const STATUS = { active: 'in gioco', eliminated: 'eliminato', surrendered: 'arreso', left: 'uscito' } as const;

/** Schermata di fine partita: vincitori, classifica e andamento. */
export function GameOverPanel({ game, onNew }: { game: GameState; onNew: () => void }) {
  const [hidden, setHidden] = useState(false);
  const final = game.history?.[game.history.length - 1];
  const winners = game.winners ?? [];
  const ranking = [...game.players].sort((a, b) => {
    const w = Number(winners.includes(b.id)) - Number(winners.includes(a.id));
    return w !== 0 ? w : b.score - a.score;
  });

  if (hidden) {
    return (
      <button type="button" className="primary floating-results" onClick={() => setHidden(false)}>
        Risultati della partita
      </button>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal gameover">
        <div className="panel-kicker">Partita finita · turno {game.turn}</div>
        <h1>
          {winners.length === 0
            ? 'Nessun vincitore'
            : `${winners.length > 1 ? 'Vincono' : 'Vince'} ${winners.map((w) => playerName(game, w)).join(' e ')}`}
        </h1>

        <table className="ranking">
          <thead>
            <tr>
              <th>Giocatore</th>
              <th>Stato</th>
              <th className="r">Città</th>
              <th className="r">Unità</th>
              <th className="r">Punti</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((p) => (
              <tr key={p.id} className={winners.includes(p.id) ? 'winner' : ''}>
                <td>
                  <span className="swatch small" style={{ background: p.color }} /> {p.name}
                </td>
                <td className="dim">{winners.includes(p.id) ? 'vincitore' : STATUS[p.status]}</td>
                <td className="r num">{final?.players[p.id]?.cities ?? '—'}</td>
                <td className="r num">{final?.players[p.id]?.units ?? '—'}</td>
                <td className="r num">{fmt.format(Math.round(p.score))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-title">Andamento</h3>
        <StatsChart game={game} metrics={['cities', 'score', 'income', 'units', 'money']} width={640} />

        <div className="button-row lobby-actions">
          <button type="button" className="primary" onClick={onNew}>
            Nuova partita
          </button>
          <button type="button" className="ghost" onClick={() => setHidden(true)}>
            Guarda la mappa
          </button>
        </div>
      </div>
    </div>
  );
}
