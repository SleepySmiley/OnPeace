/**
 * Barra dei comandi della partita: fissa in basso al centro, su una riga dice
 * che cosa fare adesso e ha quello che serve per farlo (contatore, chi contro chi, dadi, armate
 * da spostare, conferma). Non copre mai il territorio su cui si clicca. Invio conferma, Esc annulla.
 */
import type { ReactNode } from 'react';
import { useSession } from '../store';
import { Chip } from './bits';
import { useCommand, type Btn, type Command, type Side } from './command';
import { CommandSteps } from './proposte';
import { useUiLook } from './uilook';

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

function Kbd({ k }: { k?: string | undefined }) {
  return k ? <kbd className="kbd">{k}</kbd> : null;
}

function Action({ b, primary = false }: { b: Btn | null | undefined; primary?: boolean }) {
  if (!b) return null;
  return (
    <button
      type="button"
      className={`${primary ? 'primary' : 'ghost'}${b.danger ? ' danger' : ''}`}
      disabled={b.disabled}
      onClick={(e) => {
        // senza il fuoco sul bottone, Invio resta al gioco (e non ripete il clic)
        e.currentTarget.blur();
        b.run();
      }}
    >
      {b.label}
      <Kbd k={b.kbd} />
    </button>
  );
}

function Who({ side }: { side: Side }) {
  return (
    <span className="cb-who" title={side.player}>
      <Chip color={side.color} />
      <span className="cb-name">{side.name}</span>
      <span className="cb-armies num">{side.armies}</span>
    </span>
  );
}

function Dice({ d }: { d: NonNullable<Command['dice']> }) {
  return (
    <div className="dice-pick cb-dice" role="radiogroup" aria-label="Dadi da tirare">
      {Array.from({ length: d.all }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={d.value === n} className={d.value === n ? 'on' : ''} disabled={n > d.max} onClick={() => d.set(n)}>
          {n}
        </button>
      ))}
      <span className="dim small">contro {d.defense}</span>
    </div>
  );
}

function Targets({ list }: { list: NonNullable<Command['targets']> }) {
  const click = useSession((s) => s.clickTerritory);
  return (
    <div className="cb-targets">
      {list.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={t.protectedBy}
          title={t.protectedBy ? 'Protetto: ha un solo territorio' : `Attacca ${t.name}`}
          onClick={() => click(t.id, { shift: false, right: false })}
        >
          <Chip color={t.color} />
          {t.name}
          <span className="num dim">{t.armies}</span>
        </button>
      ))}
    </div>
  );
}

/** La parte che cambia con la mossa: contatore, chi contro chi, bersagli, dadi, quante armate. */
function Middle({ c }: { c: Command }) {
  const parts: ReactNode[] = [];
  if (c.count) {
    parts.push(
      <div key="count" className="cb-count">
        <span className="num cb-count-n">{c.count.left}</span>
        <span className="cb-count-text">
          <span>{c.count.noun}</span>
          {c.count.total !== null && (
            <span className="dim">
              su {c.count.total}
              {c.breakdown && ` · ${c.breakdown}`}
            </span>
          )}
        </span>
      </div>,
    );
  }
  if (c.from && c.to) {
    parts.push(
      <div key="pair" className="cb-pair">
        <Who side={c.from} />
        <span className="cb-arrow" aria-hidden>
          →
        </span>
        <Who side={c.to} />
      </div>,
    );
  } else if (c.from) {
    parts.push(
      <div key="from" className="cb-pair">
        <span className="dim">da</span> <Who side={c.from} />
      </div>,
    );
  }
  if (c.targets && c.targets.length > 0) parts.push(<Targets key="targets" list={c.targets} />);
  if (c.dice) parts.push(<Dice key="dice" d={c.dice} />);
  if (c.amount) parts.push(<Stepper key="amount" value={c.amount.value} min={c.amount.min} max={c.amount.max} label={c.amount.label} onChange={c.amount.set} />);
  if (c.who) {
    parts.push(
      <span key="who" className="cb-who">
        <Chip color={c.who.color} />
        <span className="cb-name">{c.who.name}</span>
      </span>,
    );
  }
  return parts.length > 0 ? <div className="cb-mid">{parts}</div> : null;
}

export function CommandBar() {
  const c = useCommand();
  const steps = useUiLook((s) => s.fasi === 'sotto');
  // la fase si vede quando tocca a me, o di chi aspetto il turno (con la proposta "sotto" c'è la linguetta delle fasi)
  const phase = !steps && (c.mine || c.kind === 'wait') ? c.phase : '';
  return (
    <section className={`command-bar${c.mine ? ' mine' : ' idle'}${c.busy ? ' busy' : ''}${steps ? ' with-steps' : ''}`} aria-label="La tua mossa" aria-live="polite">
      {steps && <CommandSteps />}
      <div className="cb-head">
        {phase && <span className="cb-phase">{phase}</span>}
        <b className="cb-title">{c.title}</b>
        {c.hint && <span className="cb-hint">{c.hint}</span>}
      </div>
      <Middle c={c} />
      {(c.primary || c.secondary || c.end) && (
        <div className="cb-actions">
          <Action b={c.secondary} />
          <Action b={c.primary} primary />
          {c.end && (
            <>
              <span className="cb-sep" aria-hidden />
              <Action b={c.end} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
