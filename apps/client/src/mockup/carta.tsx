/**
 * Pagina di prova della carta dell'obiettivo (/carta.html in sviluppo): le tre proposte sopra il
 * tabellone vero, nei due temi e con ogni tipo di obiettivo. Tasti: 1-3 proposta, T tema,
 * frecce obiettivo, R rifà l'animazione.
 */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import boardJson from '@data/territori/mondo.json';
import objectivesJson from '@data/conquista/obiettivi/mondo.json';
import { BoardDef } from '@onpeace/engine';
import { ObjectivesFile } from '@onpeace/conquista';
import { BoardCanvas } from '../board/BoardCanvas';
import type { BoardState } from '../board/common';
import { buildGeometry } from '../board/geometry';
import { classico } from '../board/styles/classico';
import { vetro } from '../board/styles/vetro';
import type { ObjectiveInfo, Skin } from './art';
import { CardA, CardB, CardC, type CardProps } from './cards';
import '../styles.css';
import './carta.css';

const board = BoardDef.parse(boardJson);
const geo = buildGeometry(board);
const STYLES = { classico, vetro };

const DIRECTIONS = [
  { id: 'a', name: 'Carta del mazzo', Card: CardA },
  { id: 'b', name: 'Ordine sigillato', Card: CardB },
  { id: 'c', name: 'Mappa che si accende', Card: CardC },
] as const;

const CASES = [
  { id: 'asia_africa', name: 'Due continenti' },
  { id: 'americhe_oceania', name: 'Tre continenti' },
  { id: 'europa_sudamerica_altro', name: 'Due continenti e uno a scelta' },
  { id: 'territori_26', name: '26 territori' },
  { id: 'territori_20_presidiati', name: '20 territori con 2 armate' },
  { id: 'elimina', name: 'Elimina un giocatore' },
  { id: 'conquest', name: 'Conquista del mondo' },
] as const;

const defs = ObjectivesFile.parse(objectivesJson).objectives;

function infoFor(caseId: string, skin: Skin): ObjectiveInfo {
  const colors = STYLES[skin].playerColors;
  if (caseId === 'conquest') return { kind: 'conquest', text: 'Conquista tutto il mondo: elimina tutti gli avversari.' };
  const d = defs.find((x) => x.id === caseId)!;
  if (d.kind === 'continents') return { kind: 'continents', continents: d.continents, plusAny: d.plusAny ?? 0, text: d.text };
  if (d.kind === 'territories') return { kind: 'territories', count: d.count, minArmies: d.minArmies ?? null, text: d.text };
  const fallback = defs.find((x) => x.id === d.fallback);
  return {
    kind: 'eliminate',
    target: { name: 'Marco', color: colors[1]! },
    fallback: fallback && fallback.kind === 'territories' ? fallback.count : 26,
    text: d.text.replace('{giocatore}', 'Marco'),
  };
}

const EMPTY: BoardState = { owners: new Map(), armies: new Map(), hover: null, selected: null, tokens: false };
const INSETS = { top: 52, right: 0, bottom: 0, left: 0 };

function readUrl() {
  const q = new URLSearchParams(location.search);
  const dir = DIRECTIONS.find((d) => d.id === q.get('v'))?.id ?? 'a';
  const skin: Skin = q.get('stile') === 'vetro' ? 'vetro' : 'classico';
  const obj = CASES.find((c) => c.id === q.get('obiettivo'))?.id ?? CASES[0].id;
  return { dir, skin, obj };
}

function Page() {
  const [{ dir, skin, obj }, setState] = useState(readUrl);
  const [replay, setReplay] = useState(0);
  const set = (patch: Partial<{ dir: string; skin: Skin; obj: string }>) => setState((s) => ({ ...s, ...patch }) as typeof s);

  useEffect(() => {
    document.body.dataset.stile = skin;
    history.replaceState(null, '', `?v=${dir}&stile=${skin}&obiettivo=${obj}`);
  }, [dir, skin, obj]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('select')) return;
      const i = CASES.findIndex((c) => c.id === obj);
      if (/^[1-3]$/.test(e.key)) set({ dir: DIRECTIONS[Number(e.key) - 1]!.id });
      else if (e.key === 't' || e.key === 'T') set({ skin: skin === 'classico' ? 'vetro' : 'classico' });
      else if (e.key === 'ArrowRight') set({ obj: CASES[(i + 1) % CASES.length]!.id });
      else if (e.key === 'ArrowLeft') set({ obj: CASES[(i - 1 + CASES.length) % CASES.length]!.id });
      else if (e.key === 'r' || e.key === 'R') setReplay((n) => n + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const info = useMemo(() => infoFor(obj, skin), [obj, skin]);
  const props: CardProps = { info, geo, board, skin, me: { name: 'Tu', color: STYLES[skin].playerColors[0]! } };
  const { Card } = DIRECTIONS.find((d) => d.id === dir)!;

  return (
    <>
      <div className="mock-stage">
        <BoardCanvas geo={geo} style={STYLES[skin]} state={EMPTY} insets={INSETS} />
      </div>
      <header className="mock-bar">
        <span className="mock-name">Prova: carta dell'obiettivo</span>
        <div className="segmented mock-seg" role="tablist" aria-label="Proposta">
          {DIRECTIONS.map((d, i) => (
            <button key={d.id} type="button" role="tab" aria-selected={dir === d.id} onClick={() => set({ dir: d.id })}>
              <span className="num">{i + 1}</span> {d.name}
            </button>
          ))}
        </div>
        <div className="segmented mock-seg" role="tablist" aria-label="Tema">
          {(['classico', 'vetro'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={skin === s} onClick={() => set({ skin: s })}>
              {s === 'classico' ? 'Classico' : 'Vetro'}
            </button>
          ))}
        </div>
        <label className="mock-pick">
          <span className="dim">Obiettivo</span>
          <select value={obj} onChange={(e) => set({ obj: e.target.value })}>
            {CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost tiny" onClick={() => setReplay((n) => n + 1)}>
          Rifai l'animazione
        </button>
      </header>
      <div className={`oc-reveal oc-reveal-${dir}`} role="dialog" aria-modal="true" aria-labelledby="oc-title" key={`${dir}-${skin}-${obj}-${replay}`}>
        <Card {...props} />
        <div className="oc-actions">
          <button type="button" className="primary">
            Ho capito
          </button>
          <p className="oc-wait">
            La scelta dei territori comincia tra 
            <b className="num">0:25</b>
          </p>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
