import { useState } from 'react';
import { relationKey, type Action, type GameState, type PlayerId } from '@onpeace/engine';
import { playerName } from '../game/describe';
import { strategyName } from '../game/doctrine';
import { ctx, useSession } from '../game/store';

const RELATION_LABEL = { war: 'Guerra', peace: 'Pace', alliance: 'Alleanza' } as const;
const fmt = new Intl.NumberFormat('it-IT');

interface Props {
  game: GameState;
  planner: PlayerId | null;
  actions: Action[];
}

/** Giocatori, relazioni e diplomazia del giocatore di turno. */
export function PlayersPanel({ game, planner, actions }: Props) {
  const addAction = useSession((s) => s.addAction);
  const send = useSession((s) => s.send);
  const online = useSession((s) => s.online);
  const lobby = online.lobby;
  const kickAfter = ctx.rules.game.kickAfterInactiveTurns;
  const isHost = lobby !== null && lobby.hostId === online.me;
  const [amount, setAmount] = useState(200);
  const planned = (pred: (a: Action) => boolean) => actions.some(pred);
  const incoming = planner ? game.proposals.filter((p) => p.to === planner && p.turn < game.turn) : [];

  return (
    <div className="players">
      {incoming.length > 0 && (
        <ul className="proposals">
          {incoming.map((p) => {
            const answered = planned((a) => a.kind === 'respond' && a.proposal === p.id);
            return (
              <li key={p.id}>
                <span>
                  {playerName(game, p.from)} propone {p.kind === 'peace' ? 'la pace' : "l'alleanza"}
                </span>
                <span className="button-row">
                  <button
                    type="button"
                    className="primary tiny"
                    disabled={answered}
                    onClick={() => addAction({ kind: 'respond', proposal: p.id, accept: true })}
                  >
                    Accetta
                  </button>
                  <button
                    type="button"
                    className="ghost tiny"
                    disabled={answered}
                    onClick={() => addAction({ kind: 'respond', proposal: p.id, accept: false })}
                  >
                    Rifiuta
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="player-rows">
        {game.players.map((p) => {
          const cities = Object.values(game.cities).filter((c) => c.owner === p.id).length;
          const isMe = p.id === planner;
          const rel = planner && !isMe ? game.relations[relationKey(planner, p.id)] : undefined;
          const pendingWar = rel?.warFromTurn !== undefined;
          const proposed = (kind: 'peace' | 'alliance' | 'war') =>
            planned((a) => a.kind === 'diplomacy' && a.to === p.id && a.proposal === kind);
          return (
            <li key={p.id} className={p.status !== 'active' ? 'out' : ''}>
              <span className="swatch small" style={{ background: p.color }} />
              <span className="player-name">
                {p.name}
                {isMe && <span className="dim"> (tu)</span>}
                {game.settings.strategies && game.phase !== 'selection' && (
                  <span className="strategy-label">{strategyName(p.strategy)}</span>
                )}
              </span>
              <span className="num dim" title="Città">
                {cities} città
              </span>
              <span className="num dim" title="Punti">
                {fmt.format(Math.round(p.score))} pt
              </span>
              {p.status !== 'active' && <span className="tag">{p.status === 'eliminated' ? 'eliminato' : 'fuori'}</span>}
              {lobby && p.status === 'active' && (() => {
                const seat = lobby.players.find((x) => x.id === p.id);
                if (!seat) return null;
                return (
                  <>
                    <span className={`dot ${seat.connected ? 'on' : 'off'}`} title={seat.connected ? 'Collegato' : 'Non collegato'} />
                    {seat.inactiveTurns > 0 && <span className="dim tiny-text">inattivo da {seat.inactiveTurns}</span>}
                    {isHost && p.id !== online.me && seat.inactiveTurns >= kickAfter && (
                      <button type="button" className="ghost tiny danger" onClick={() => send({ t: 'kick', player: p.id })}>
                        Espelli
                      </button>
                    )}
                  </>
                );
              })()}
              {rel && p.status === 'active' && (
                <div className="diplo">
                  <span className={`relation ${rel.relation}`}>
                    {RELATION_LABEL[rel.relation]}
                    {pendingWar && ` → guerra al turno ${rel.warFromTurn}`}
                  </span>
                  {rel.relation === 'war' && (
                    <button
                      type="button"
                      className="ghost tiny"
                      disabled={proposed('peace')}
                      onClick={() => addAction({ kind: 'diplomacy', to: p.id, proposal: 'peace' })}
                    >
                      Proponi pace
                    </button>
                  )}
                  {rel.relation === 'peace' && !pendingWar && (
                    <>
                      <button
                        type="button"
                        className="ghost tiny"
                        disabled={proposed('alliance')}
                        onClick={() => addAction({ kind: 'diplomacy', to: p.id, proposal: 'alliance' })}
                      >
                        Proponi alleanza
                      </button>
                      <button
                        type="button"
                        className="ghost tiny danger"
                        disabled={proposed('war')}
                        onClick={() => addAction({ kind: 'diplomacy', to: p.id, proposal: 'war' })}
                      >
                        Dichiara guerra
                      </button>
                    </>
                  )}
                  {rel.relation === 'alliance' && !pendingWar && (
                    <>
                      <span className="money-send">
                        <input
                          type="number"
                          min={1}
                          step={50}
                          value={amount}
                          aria-label={`Denaro da inviare a ${p.name}`}
                          onChange={(e) => setAmount(Number(e.target.value))}
                        />
                        <button
                          type="button"
                          className="ghost tiny"
                          onClick={() => addAction({ kind: 'send_money', to: p.id, amount })}
                        >
                          Invia
                        </button>
                      </span>
                      <button
                        type="button"
                        className="ghost tiny danger"
                        disabled={proposed('war')}
                        onClick={() => addAction({ kind: 'diplomacy', to: p.id, proposal: 'war' })}
                      >
                        Rompi alleanza
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
