/**
 * Inizio partita: la carta dell'obiettivo arriva coperta al centro dello schermo e si gira.
 * Resta finché il giocatore non dice di averla letta (o finché scade il tempo per tutti);
 * dopo, l'obiettivo si ritrova tra le carte.
 */
import { useSession } from '../store';
import { Countdown } from '../ui/Countdown';
import { useGame } from './useGame';

export function ObjectiveCard() {
  const { view, lobby, me } = useGame();
  const online = useSession((s) => s.online);
  const busy = useSession((s) => s.sending !== null);
  const ready = useSession((s) => s.ready);
  const mine = view.players.find((p) => p.id === me);
  const secret = view.mode === 'objectives';
  const text = secret
    ? (mine?.objective ?? '')
    : 'Conquista tutto il mondo: elimina tutti gli avversari.';
  const draft = lobby.rules.setup.distribution === 'draft';
  const others = view.players.filter((p) => p.id !== me);
  const waiting = others.filter((p) => !p.ready).length;

  return (
    <div
      className="objective-reveal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="objective-title"
    >
      <div className="objective-card">
        <div className="card-flip">
          <div className="face back" aria-hidden>
            <span className="back-mark">OnPeace</span>
            <span className="back-sub">{secret ? 'Obiettivo segreto' : 'Obiettivo'}</span>
          </div>
          <div className="face front">
            <p className="card-kicker" id="objective-title">
              {secret ? 'Il tuo obiettivo segreto' : 'Obiettivo'}
            </p>
            <p className="card-text">{text}</p>
            <p className="card-note">
              {secret ? 'Lo vedi solo tu. ' : ''}Lo ritrovi sempre insieme alle tue carte.
              {draft && (
                <> Subito dopo si scelgono i territori a turno: pensa a quali ti servono.</>
              )}
            </p>
            <div className="card-foot">
              <button
                type="button"
                className="primary"
                autoFocus
                disabled={busy}
                onClick={() => ready()}
              >
                Ho capito
              </button>
              <span className="card-clock dim">
                Si parte tra <Countdown deadline={online.deadline} paused={online.paused} />
                {waiting > 0 && <> · altri {waiting} stanno leggendo</>}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
