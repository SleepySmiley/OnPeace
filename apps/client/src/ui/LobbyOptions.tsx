/**
 * Opzioni della sala d'attesa a tessere: ogni scelta ha la sua scenetta e sotto c'è la frase che
 * spiega quella in vigore. Quando la scelta cambia la sua scenetta fa un giro; passando sopra a una
 * tessera (o arrivandoci coi tasti) quella si muove finché ci si resta, e la frase diventa la sua.
 * Chi non è l'host le guarda ma non le cambia.
 */
import { useState, type KeyboardEvent } from 'react';
import type { LobbySettings, RoomSettings } from '@onpeace/protocol';
import type { ConquestRules } from '@onpeace/conquista';
import { currentOf, optionDefs, patchFor, Vignette, type Choice, type OptionDef } from './explain';

interface Props {
  rules: ConquestRules;
  settings: RoomSettings;
  isHost: boolean;
  onChange(patch: LobbySettings): void;
}

/** Oltre tante scelte non ci stanno le tessere: bottoni piccoli e una scenetta sola (il tempo del turno). */
const MAX_TILES = 4;

export function LobbyOptions({ rules, settings, isHost, onChange }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const defs = optionDefs(rules, settings);
  return (
    <div className="opts">
      {defs.map((o) => (
        <Option key={o.key} o={o} rules={rules} settings={settings} isHost={isHost} onChange={onChange} hover={hover} setHover={setHover} />
      ))}
    </div>
  );
}

function Option({ o, rules, settings, isHost, onChange, hover, setHover }: Props & { o: OptionDef; hover: string | null; setHover(id: string | null): void }) {
  const cur = currentOf(o, settings);
  const idOf = (c: Choice) => `${o.key}:${c.value}`;
  const pointed = o.choices.find((c) => idOf(c) === hover);
  const shown = pointed ?? cur;
  const tiles = o.choices.length <= MAX_TILES;
  const choose = (c: Choice) => {
    if (isHost && c.value !== cur.value) onChange(patchFor(o.key, c.value));
  };
  // radio coi tasti: le frecce passano alla scelta accanto (e, per l'host, la scelgono)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const j = (i + step + o.choices.length) % o.choices.length;
    (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
    choose(o.choices[j]!);
  };
  const radio = (c: Choice, i: number) => ({
    type: 'button' as const,
    role: 'radio',
    'aria-checked': c.value === cur.value,
    'aria-disabled': !isHost,
    'aria-describedby': `opt-${o.key}-${i}`,
    tabIndex: c.value === cur.value ? 0 : -1,
    onClick: () => choose(c),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKey(e, i),
    onMouseEnter: () => setHover(idOf(c)),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(idOf(c)),
    onBlur: () => setHover(null),
  });
  return (
    <section className="opt" aria-labelledby={`opt-${o.key}`}>
      <h3 className="opt-label" id={`opt-${o.key}`}>
        {o.label}
      </h3>
      {tiles ? (
        <div className="opt-tiles" role="radiogroup" aria-labelledby={`opt-${o.key}`}>
          {o.choices.map((c, i) => (
            <button key={c.value} className="opt-tile" {...radio(c, i)}>
              <span className="opt-art">
                <Vignette
                  option={o.key}
                  value={c.value}
                  rules={rules}
                  settings={settings}
                  playing={pointed === c || c.value === cur.value}
                  once={pointed !== c}
                  scale={1.2}
                />
              </span>
              <span className="opt-name">{c.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="opt-many">
          <span className="opt-art">
            <Vignette key={String(shown.value)} option={o.key} value={shown.value} rules={rules} settings={settings} playing once={!pointed} scale={1.1} />
          </span>
          <div className="opt-chips" role="radiogroup" aria-labelledby={`opt-${o.key}`}>
            {o.choices.map((c, i) => (
              <button key={c.value} {...radio(c, i)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="opt-line">{shown.line}</p>
      {o.choices.map((c, i) => (
        <span key={c.value} id={`opt-${o.key}-${i}`} className="sr-only">
          {c.line}
        </span>
      ))}
    </section>
  );
}
