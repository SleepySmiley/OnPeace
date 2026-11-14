/**
 * Tre proposte per la carta dell'obiettivo a inizio partita. Stessi contenuti, tre modi di
 * mostrarli: A la carta del mazzo che si gira, B l'ordine sigillato che si apre, C la mappa che si
 * accende. Ognuna ha il suo aspetto nel tema classico e nel tema vetro.
 */
import type { BoardDef } from '@onpeace/engine';
import type { BoardGeometry } from '../board/geometry';
import { Facts, ObjectiveArt, type ObjectiveInfo, type Skin } from './art';

export interface CardProps {
  info: ObjectiveInfo;
  geo: BoardGeometry;
  board: BoardDef;
  skin: Skin;
  me: { name: string; color: string };
}

const title = (info: ObjectiveInfo) => (info.kind === 'conquest' ? 'Obiettivo' : 'Obiettivo segreto');
const secretNote = (info: ObjectiveInfo) => (info.kind === 'conquest' ? 'Lo stesso per tutti' : 'Lo vedi solo tu');

// ---------------------------------------------------------------- A: la carta del mazzo
export function CardA({ info, geo, board, skin, me }: CardProps) {
  return (
    <div className="oc-a">
      <div className="oc-a-flip">
        <div className="oc-a-face oc-a-back" aria-hidden>
          <span className="oc-a-cartouche">OnPeace</span>
        </div>
        <article className="oc-a-face oc-a-front paper" aria-labelledby="oc-title">
          <div className="oc-a-frame">
            <h2 className="oc-a-title" id="oc-title">
              {title(info)}
            </h2>
            <div className="oc-a-window">
              <ObjectiveArt info={info} geo={geo} skin={skin} me={me.color} />
            </div>
            <p className="oc-a-text">{info.text}</p>
            <Facts info={info} board={board} skin={skin} />
            <p className="oc-a-foot">{secretNote(info)}</p>
          </div>
        </article>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- B: l'ordine sigillato
export function CardB({ info, geo, board, skin, me }: CardProps) {
  return (
    <div className="oc-b">
      <div className="oc-b-env-back" aria-hidden />
      <article className="oc-b-letter paper" aria-labelledby="oc-title">
        <header className="oc-b-head">
          <h2 id="oc-title">Ordini per</h2>
          <span className="oc-b-to">
            <span className="oc-b-dot" style={{ background: me.color }} />
            {me.name}
          </span>
        </header>
        <div className="oc-b-body">
          <p className="oc-b-text">{info.text}</p>
          <figure className="oc-b-stamp">
            <div className="oc-b-stamp-art">
              <ObjectiveArt info={info} geo={geo} skin={skin} me={me.color} />
            </div>
          </figure>
        </div>
        <Facts info={info} board={board} skin={skin} />
        <p className="oc-b-foot">{info.kind === 'conquest' ? 'Gli stessi ordini valgono per tutti.' : 'Questi ordini li conosci solo tu.'}</p>
      </article>
      <div className="oc-b-env-front" aria-hidden />
      <div className="oc-b-flap" aria-hidden />
      <div className="oc-b-seal" aria-hidden>
        <span className="oc-b-seal-half left" />
        <span className="oc-b-seal-half right" />
        <span className="oc-b-seal-mark">OP</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- C: la mappa che si accende
export function CardC({ info, geo, board, skin, me }: CardProps) {
  return (
    <article className="oc-c" aria-labelledby="oc-title">
      <div className="oc-c-map">
        <ObjectiveArt info={info} geo={geo} skin={skin} me={me.color} layered />
        <h2 className="oc-c-label" id="oc-title">
          {title(info)}
        </h2>
      </div>
      <div className="oc-c-band paper">
        <p className="oc-c-text">{info.text}</p>
        <Facts info={info} board={board} skin={skin} inline />
        <p className="oc-c-note">{secretNote(info)}</p>
      </div>
    </article>
  );
}
