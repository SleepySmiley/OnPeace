/** Barra in alto: fase del turno, di chi è la mossa, tempo, pausa, aspetto, suoni, guida, uscita. */
import type { ReactNode } from 'react';
import { useSession } from '../store';
import { AppearanceMenu } from '../ui/Appearance';
import { Countdown } from '../ui/Countdown';
import { SoundButton } from '../ui/SoundButton';
import { Chip } from './bits';
import { PHASES } from './describe';
import { actingPlayer, roundOf } from './logic';
import { useGame } from './useGame';

export function TopBar({ onGuide, onReport, children }: { onGuide: () => void; onReport: () => void; children?: ReactNode }) {
  const { view, lobby, me, move, colorOf, playerName } = useGame();
  const online = useSession((s) => s.online);
  const send = useSession((s) => s.send);
  const leave = useSession((s) => s.leave);
  const acting = actingPlayer(view);
  const isHost = lobby.hostId === me;
  const { round } = roundOf(view);
  const over = view.phase === 'over' || lobby.phase === 'ended';
  const mine = move.kind === 'place' || move.kind === 'attack' || move.kind === 'fortify' || move.kind === 'occupy';

  return (
    <header className={`topbar${mine ? ' my-move' : ''}`}>
      <span className="brand">OnPeace</span>
      <ol className="phases" aria-label="Fasi del turno">
        {PHASES.filter((p) => p.id !== 'setup' || view.phase === 'setup').map((p) => (
          <li key={p.id} className={view.phase === p.id ? 'on' : ''} aria-current={view.phase === p.id ? 'step' : undefined}>
            {p.label}
          </li>
        ))}
      </ol>
      {view.turn && (
        <span className="status num" title={`Turno ${view.turn.number}, giro ${round}`}>
          Giro <b>{round}</b>
        </span>
      )}
      {!over && (
        <span className="whose">
          {mine ? (
            <b>Tocca a te</b>
          ) : acting ? (
            <>
              <Chip color={colorOf(acting)} /> {playerName(acting)}
            </>
          ) : (
            'Tutti piazzano'
          )}
        </span>
      )}
      {!over && <Countdown deadline={online.deadline} paused={online.paused} {...(online.total ? { total: online.total } : {})} />}
      {isHost && !over && (
        <button
          type="button"
          className="ghost tiny"
          title={online.paused ? 'Fa ripartire il tempo' : 'Ferma il tempo per tutti (si può giocare lo stesso)'}
          onClick={() => send({ t: 'pause', paused: !online.paused })}
        >
          {online.paused?.reason === 'error' ? 'Riprova' : online.paused ? 'Riprendi' : 'Pausa'}
        </button>
      )}
      {!online.connected && <span className="status offline">Riconnessione…</span>}
      <span className="spacer" />
      {children}
      <AppearanceMenu />
      <SoundButton />
      <button type="button" className="ghost tiny" onClick={onGuide}>
        Guida
      </button>
      <button type="button" className="ghost tiny" onClick={onReport}>
        Segnala
      </button>
      <button
        type="button"
        className="ghost tiny"
        onClick={() => {
          if (over || confirm('Uscire dalla partita? Le tue armate restano sul tabellone e il server giocherà al posto tuo.')) leave();
        }}
      >
        Esci
      </button>
    </header>
  );
}
