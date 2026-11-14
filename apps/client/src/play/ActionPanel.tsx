/**
 * Il pannello della mossa: dice cosa tocca fare adesso e ha i comandi per farlo (armate da
 * piazzare, dadi, occupazione, spostamento, fine turno). Il tabellone fa il resto con i clic.
 */
import type { ReactNode } from 'react';
import { useSession } from '../store';
import { Chip } from './bits';
import { PHASES } from './describe';
import { attackTargets, freeTerritories, maxDice, moveTargets, reinforcementsFor } from './logic';
import { useGame } from './useGame';

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Numero con − e + (e il cursore se l'intervallo è ampio). */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="ghost" aria-label="Meno" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      {max - min > 2 && (
        <input type="range" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      )}
      <span className="num stepper-value">{value}</span>
      <button type="button" className="ghost" aria-label="Più" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function ActionPanel({ floating = false }: { floating?: boolean }) {
  const game = useGame();
  const { view, lobby, board, me, move, colorOf, playerName, territory } = game;
  const draft = useSession((s) => s.draft);
  const sending = useSession((s) => s.sending);
  const s = useSession.getState();
  const rules = lobby.rules;
  const busy = sending !== null;
  const phaseLabel = PHASES.find((p) => p.id === view.phase)?.label ?? '';

  let body: ReactNode;
  switch (move.kind) {
    case 'briefing':
      body = (
        <>
          <h3>Il tuo obiettivo</h3>
          <p>Leggilo con calma: la partita comincia quando hanno finito tutti.</p>
          <div className="button-row">
            <button type="button" className="primary" disabled={busy} onClick={() => s.ready()}>
              Ho capito
            </button>
          </div>
        </>
      );
      break;
    case 'wait-briefing': {
      const ready = view.players.filter((p) => p.ready).length;
      body = (
        <>
          <h3>Pronto</h3>
          <p>
            Si aspetta che gli altri leggano l'obiettivo (
            <span className="num">
              {ready}/{view.players.length}
            </span>
            ). Poi si scelgono i territori a turno.
          </p>
        </>
      );
      break;
    }
    case 'pick': {
      const free = freeTerritories(view, board.def.territories).length;
      body = (
        <>
          <h3>Scegli un territorio</h3>
          <p>
            Clic su un territorio libero: diventa tuo con un'armata. Ne restano <span className="num">{free}</span>.
          </p>
          <p className="hint">Pensa al tuo obiettivo: territori vicini tra loro si difendono meglio.</p>
        </>
      );
      break;
    }
    case 'place': {
      const placed = sum(draft.placements);
      const left = move.budget - placed;
      let breakdown: ReactNode = null;
      if (!move.setup && me) {
        const r = reinforcementsFor(view, rules, board.def.continents, board.geo.continentOf, me);
        const fromSets = move.budget - r.base - r.bonus;
        breakdown = (
          <p className="dim small">
            {r.base} dai territori
            {r.bonus > 0 && <> · +{r.bonus} dai continenti ({r.held.map((c) => board.def.continents.find((x) => x.id === c)?.name).join(', ')})</>}
            {fromSets > 0 && <> · +{fromSets} dai tris</>}
          </p>
        );
      }
      body = (
        <>
          <h3>{move.setup ? 'Piazzamento iniziale' : 'Rinforzi'}</h3>
          <p className="big-count">
            <span className="num">{left}</span> <span>{left === 1 ? 'armata da mettere' : 'armate da mettere'}</span>
            <span className="dim num"> su {move.budget}</span>
          </p>
          {breakdown}
          <p className="hint">Clic su un tuo territorio: +1 · Maiusc+clic: tutte lì · tasto destro: −1</p>
          {placed > 0 && (
            <ul className="placements">
              {Object.entries(draft.placements).map(([id, n]) => (
                <li key={id}>
                  <span>{territory(id)}</span>
                  <span className="num">+{n}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="button-row">
            <button type="button" className="primary" disabled={left !== 0 || busy} onClick={() => s.confirmPlacement()}>
              Conferma
            </button>
            <button type="button" className="ghost" disabled={placed === 0 || busy} onClick={() => s.resetPlacements()}>
              Ricomincia
            </button>
          </div>
        </>
      );
      break;
    }
    case 'occupy': {
      const value = Math.min(move.max, Math.max(move.min, draft.occupy ?? move.max));
      body = (
        <>
          <h3>Hai conquistato {territory(move.to)}</h3>
          <p>Quante armate ci entrano da {territory(move.from)}?</p>
          <Stepper value={value} min={move.min} max={move.max} label="Armate che entrano" onChange={(n) => s.patchDraft({ occupy: n })} />
          <p className="dim small">
            Almeno {move.min} (i dadi tirati), al massimo {move.max}: un'armata resta in {territory(move.from)}.
          </p>
          <div className="button-row">
            <button type="button" className="primary" disabled={busy} onClick={() => s.occupy(value)}>
              Sposta {value} {value === 1 ? 'armata' : 'armate'}
            </button>
          </div>
        </>
      );
      break;
    }
    case 'attack': {
      const turn = view.turn!;
      const endLabel = turn.fortifyLeft > 0 ? 'Basta attacchi' : 'Fine turno';
      const from = draft.selected ? view.territories[draft.selected] : null;
      const targets = draft.selected && from && from.owner === me ? attackTargets(view, rules, board.geo.neighbours, draft.selected) : [];
      let detail: ReactNode;
      if (!draft.selected || !from || from.owner !== me || from.armies < 2) {
        detail = <p>Scegli un tuo territorio con almeno 2 armate, poi chi attaccare. Oppure clicca direttamente un nemico.</p>;
      } else if (!draft.target) {
        detail = (
          <>
            <p>
              Da <b>{territory(draft.selected)}</b> ({from.armies} armate): chi attacchi?
            </p>
            {targets.length === 0 ? (
              <p className="dim">Nessun nemico confina con questo territorio.</p>
            ) : (
              <ul className="target-list">
                {targets.map((t) => {
                  const x = view.territories[t.id]!;
                  return (
                    <li key={t.id}>
                      <button type="button" className="ghost" disabled={Boolean(t.protectedBy)} onClick={() => s.clickTerritory(t.id, { shift: false, right: false })}>
                        <Chip color={colorOf(x.owner)} />
                        <span>{territory(t.id)}</span>
                        <span className="num dim">{x.armies}</span>
                        {t.protectedBy && <span className="dim small">protetto</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        );
      } else {
        const to = view.territories[draft.target]!;
        const max = maxDice(rules, from.armies);
        const dice = draft.dice === null ? max : Math.min(draft.dice, max);
        const defDice = Math.min(rules.dice.defenseMax, to.armies);
        detail = (
          <>
            <div className="duel">
              <div>
                <Chip color={colorOf(me!)} /> <b>{territory(draft.selected)}</b>
                <span className="num"> {from.armies}</span>
              </div>
              <span className="duel-arrow" aria-hidden>
                →
              </span>
              <div>
                <Chip color={colorOf(to.owner)} /> <b>{territory(draft.target)}</b>
                <span className="num"> {to.armies}</span>
                <span className="dim small"> · {playerName(to.owner)}</span>
              </div>
            </div>
            <div className="dice-pick" role="radiogroup" aria-label="Dadi da tirare">
              <span className="dim">Dadi</span>
              {Array.from({ length: rules.dice.attackMax }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={dice === n}
                  className={dice === n ? 'on' : ''}
                  disabled={n > max}
                  onClick={() => s.patchDraft({ dice: n })}
                >
                  {n}
                </button>
              ))}
              <span className="dim small">contro {defDice}</span>
            </div>
            <div className="button-row">
              {draft.blitz ? (
                <button type="button" className="primary danger" onClick={() => s.stopBlitz()}>
                  Ferma l'attacco
                </button>
              ) : (
                <>
                  <button type="button" className="primary" disabled={busy || max < 1} onClick={() => s.attack()}>
                    Tira {dice} {dice === 1 ? 'dado' : 'dadi'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy || max < 1}
                    title="Si tira finché conquisti o ti resta una sola armata"
                    onClick={() => s.attack(true)}
                  >
                    Fino in fondo
                  </button>
                </>
              )}
            </div>
            <p className="hint">Clic di nuovo sul bersaglio: tira un'altra volta</p>
          </>
        );
      }
      body = (
        <>
          <h3>Attacco</h3>
          {detail}
          <div className="button-row end">
            <button type="button" className="ghost" disabled={busy || draft.blitz} onClick={() => s.endAttack()}>
              {endLabel}
            </button>
          </div>
        </>
      );
      break;
    }
    case 'fortify': {
      const from = draft.selected ? view.territories[draft.selected] : null;
      const ready = draft.selected && draft.target && from && from.owner === me && from.armies >= 2;
      const max = from ? from.armies - 1 : 1;
      const value = Math.min(max, Math.max(1, draft.move ?? max));
      const reach = rules.fortify.reach === 'adjacent' ? 'confinante' : 'collegato da territori tuoi';
      const options = draft.selected && from?.owner === me ? moveTargets(view, rules, board.geo.neighbours, draft.selected) : [];
      body = (
        <>
          <h3>Spostamento</h3>
          {!draft.selected || !from || from.owner !== me ? (
            <p>Puoi spostare armate da un tuo territorio a uno {reach}. Scegli da dove.</p>
          ) : !draft.target ? (
            <p>
              Da <b>{territory(draft.selected)}</b>: scegli dove portarle{options.length === 0 && ' (nessun tuo territorio raggiungibile)'}.
            </p>
          ) : null}
          {ready && (
            <>
              <p>
                <b>{territory(draft.selected!)}</b> → <b>{territory(draft.target!)}</b>
              </p>
              <Stepper value={value} min={1} max={max} label="Armate da spostare" onChange={(n) => s.patchDraft({ move: n })} />
            </>
          )}
          <div className="button-row">
            {ready && (
              <button type="button" className="primary" disabled={busy} onClick={() => s.fortify()}>
                Sposta e chiudi il turno
              </button>
            )}
            <button type="button" className={ready ? 'ghost' : 'primary'} disabled={busy} onClick={() => s.endTurn()}>
              Fine turno
            </button>
          </div>
        </>
      );
      break;
    }
    case 'wait-setup': {
      const done = view.players.filter((p) => p.setupDone || p.pending).length;
      body = (
        <>
          <h3>Piazzamento fatto</h3>
          <p>
            Le tue armate restano coperte finché non hanno finito tutti ({done}/{view.players.length}).
          </p>
        </>
      );
      break;
    }
    case 'wait': {
      const who = move.player;
      body = (
        <>
          <h3>
            {who ? (
              <>
                <Chip color={colorOf(who)} /> Tocca a {playerName(who)}
              </>
            ) : (
              'Si aspetta'
            )}
          </h3>
          <p className="dim">
            {view.phase === 'draft'
              ? `Sta scegliendo un territorio (ne restano ${freeTerritories(view, board.def.territories).length}).`
              : view.phase === 'setup'
                ? 'Sta piazzando le armate iniziali.'
                : `${phaseLabel}.`}{' '}
            Intanto puoi guardare il tabellone.
          </p>
        </>
      );
      break;
    }
    case 'out':
      body = (
        <>
          <h3>Sei fuori dalla partita</h3>
          <p className="dim">Puoi continuare a guardare come va a finire.</p>
        </>
      );
      break;
    case 'over':
      body = <h3>Partita finita</h3>;
      break;
  }

  return (
    <section className={`action-panel${floating ? ' floating' : ''}${busy ? ' busy' : ''}`} aria-label="La tua mossa" aria-live="polite">
      {body}
    </section>
  );
}
