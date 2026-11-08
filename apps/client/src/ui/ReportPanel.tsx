import type { GameState, TurnEvent } from '@onpeace/engine';
import { describeEvent, describeUnits, unitName } from '../game/describe';
import { summarizeUnits } from './summarize';

type BattleEvent = Extract<TurnEvent, { kind: 'battle' }>;

interface Props {
  game: GameState;
  events: TurnEvent[];
  turn: number;
}

const asUnits = (list: { uid: string; type: string }[]) =>
  summarizeUnits(list.map((u) => ({ id: u.uid, type: u.type, hp: 0, origin: null, cargo: [] })));

/** Dettaglio di una battaglia: forze in campo, perdite e scambi di colpi. */
function BattleDetail({ e }: { e: BattleEvent }) {
  const killed = new Set(e.exchanges.flatMap((x) => x.killed));
  const typeOf = new Map([...e.attackers, ...e.defenders].map((u) => [u.uid, u.type]));
  const lostA = e.attackers.filter((u) => killed.has(u.uid));
  const lostD = e.defenders.filter((u) => killed.has(u.uid));
  const shown = e.exchanges.slice(0, 14);
  return (
    <div className="battle-detail">
      <dl className="facts">
        <dt>Attacco</dt>
        <dd>{describeUnits(asUnits(e.attackers))}</dd>
        <dt>Difesa</dt>
        <dd>{describeUnits(asUnits(e.defenders))}</dd>
        <dt>Perdite attacco</dt>
        <dd>{lostA.length ? describeUnits(asUnits(lostA)) : 'nessuna'}</dd>
        <dt>Perdite difesa</dt>
        <dd>{lostD.length ? describeUnits(asUnits(lostD)) : 'nessuna'}</dd>
      </dl>
      <ol className="exchanges">
        {shown.map((x, i) => (
          <li key={i}>
            <span>
              {unitName(typeOf.get(x.attacker) ?? '?')} <b className="num">{x.attackRoll}</b>
              {x.attackCrit && <span className="crit"> critico</span>}
            </span>
            <span className="dim">contro</span>
            <span>
              {unitName(typeOf.get(x.defender) ?? '?')} <b className="num">{x.defenceRoll}</b>
              {x.defenceCrit && <span className="crit"> critico</span>}
            </span>
            {x.killed.length > 0 && <span className="dead">✝ {x.killed.map((k) => unitName(typeOf.get(k) ?? '?')).join(', ')}</span>}
          </li>
        ))}
      </ol>
      {e.exchanges.length > shown.length && <p className="dim">… altri {e.exchanges.length - shown.length} scambi</p>}
    </div>
  );
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
        {lines.map(({ e, text }, i) =>
          e.kind === 'battle' ? (
            <li key={i} className="ev-battle">
              <details>
                <summary>{text}</summary>
                <BattleDetail e={e} />
              </details>
            </li>
          ) : (
            <li key={i} className={`ev-${e.kind}`}>
              {text}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
