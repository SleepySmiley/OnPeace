/**
 * Barra in alto, su tre colonne: a sinistra marchio, giro e pausa; al centro di chi è la mossa, il
 * percorso delle fasi (fatte, in corso, da fare) e il tempo; a destra aspetto, suoni, guida, uscita.
 */
import type { ReactNode } from 'react';
import { useSession } from '../store';
import { AppearanceMenu } from '../ui/Appearance';
import { Countdown } from '../ui/Countdown';
import { SoundButton } from '../ui/SoundButton';
import { Chip } from './bits';
import { PHASES } from './describe';
import { actingPlayer, canUsePause, isMyMove, preparationPhases, roundOf } from './logic';
import { useGame } from './useGame';

const PRE = ['briefing', 'draft', 'setup'];
const TURN = ['reinforce', 'attack', 'fortify'];

/** Le fasi del momento (preparazione o turno), numerate: ✓ quelle fatte, piena nel colore di chi gioca quella in corso. */
function PhasePath({ color }: { color: string }) {
  const { view, lobby } = useGame();
  // nella preparazione solo le fasi che ci sono davvero (con i territori distribuiti a caso non si sceglie)
  const ids = PRE.includes(view.phase) ? preparationPhases(lobby.rules) : TURN;
  const at = ids.indexOf(view.phase);
  const steps = PHASES.filter((p) => ids.includes(p.id));
  return (
    <ol className="phase-path" aria-label="Fasi" style={{ ['--pc' as string]: color }}>
      {steps.map((p, i) => {
        const state = i < at ? 'done' : i === at ? 'on' : 'next';
        return (
          <li key={p.id} className={state} aria-current={state === 'on' ? 'step' : undefined}>
            <i aria-hidden>{state === 'done' ? '✓' : i + 1}</i>
            <span>{p.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Chi deve muoversi: "Tocca a te", il nome di chi gioca, o tutti insieme. */
function Whose() {
  const { view, move, colorOf, playerName } = useGame();
  const acting = actingPlayer(view);
  if (isMyMove(move)) return <b className="tb-mine">Tocca a te</b>;
  if (acting)
    return (
      <span className="tb-whose">
        <Chip color={colorOf(acting)} /> <b>{playerName(acting)}</b>
      </span>
    );
  return <span className="tb-whose dim">{view.phase === 'briefing' ? 'Tutti leggono l’obiettivo' : 'Tutti piazzano'}</span>;
}

export function TopBar({ onGuide, onReport, children }: { onGuide: () => void; onReport: () => void; children?: ReactNode }) {
  const { view, lobby, me, move, colorOf } = useGame();
  const online = useSession((s) => s.online);
  const send = useSession((s) => s.send);
  const leave = useSession((s) => s.leave);
  const acting = actingPlayer(view);
  // ferma il tempo l'host; se l'host non c'è, chi è ancora in partita lo fa ripartire
  const pauseButton = canUsePause(lobby, me, Boolean(online.paused));
  const { round } = roundOf(view);
  const over = view.phase === 'over' || lobby.phase === 'ended';
  const mine = isMyMove(move);

  return (
    <header className={`topbar${mine ? ' my-move' : ''}`}>
      <div className="tb-left">
        <span className="brand">OnPeace</span>
        {view.turn && (
          <span className="status num" title={`Turno ${view.turn.number}, giro ${round}`}>
            Giro <b>{round}</b>
          </span>
        )}
        {pauseButton && !over && (
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
      </div>
      <div className="tb-center">
        {!over && (
          <>
            <Whose />
            <PhasePath color={acting ? colorOf(acting) : me ? colorOf(me) : '#888888'} />
            <Countdown deadline={online.deadline} paused={online.paused} {...(online.total ? { total: online.total } : {})} />
          </>
        )}
      </div>
      <div className="tb-right">
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
      </div>
    </header>
  );
}
