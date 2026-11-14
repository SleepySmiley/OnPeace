/**
 * Inizio partita: la carta dell'obiettivo al centro dello schermo, con la mappa che accende quello
 * che devi prendere. Resta finché il giocatore non dice di averla letta (o finché scade il tempo per
 * tutti); dopo, l'obiettivo si ritrova tra le carte.
 */
import { useLook } from '../look';
import { useSession } from '../store';
import { Countdown } from '../ui/Countdown';
import { ObjectiveSheet, objectiveInfo, skinOf } from './objective';
import { useGame } from './useGame';

export function ObjectiveCard() {
  const { view, lobby, board, me, colorOf, playerName } = useGame();
  const skin = useLook((s) => skinOf(s.style.id));
  const online = useSession((s) => s.online);
  const busy = useSession((s) => s.sending !== null);
  const ready = useSession((s) => s.ready);
  const info = objectiveInfo(view, me, colorOf, playerName);
  if (!info || !me) return null;
  const draft = lobby.rules.setup.distribution === 'draft';
  const waiting = view.players.filter((p) => p.id !== me && !p.ready).length;

  return (
    <div className="objective-reveal" role="dialog" aria-modal="true" aria-labelledby="objective-title">
      <ObjectiveSheet info={info} geo={board.geo} board={board.def} skin={skin} me={colorOf(me)} titleId="objective-title" />
      <div className="objective-actions">
        <button type="button" className="primary" autoFocus disabled={busy} onClick={() => ready()}>
          Ho capito
        </button>
        <p className="objective-wait">
          Si parte tra <Countdown deadline={online.deadline} paused={online.paused} />
          {waiting > 0 && <span>· {waiting === 1 ? 'un altro sta leggendo' : `altri ${waiting} stanno leggendo`}</span>}
        </p>
      </div>
      <p className="objective-hint">
        Lo ritrovi sempre insieme alle tue carte.
        {draft && ' Subito dopo si scelgono i territori a turno: pensa a quali ti servono.'}
      </p>
    </div>
  );
}
