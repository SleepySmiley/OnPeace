/**
 * Pagina di prova della carta dell'obiettivo (/carta.html in sviluppo): la carta del gioco sopra il
 * tabellone vero, nei due temi e con ogni tipo di obiettivo, senza dover avviare una partita.
 * Tasti: T tema, frecce obiettivo, R rifà l'animazione.
 */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import boardJson from '@data/territori/mondo.json';
import objectivesJson from '@data/conquista/obiettivi/mondo.json';
import { BoardDef } from '@onpeace/engine';
import { ObjectivesFile, type FallbackObjectiveView } from '@onpeace/conquista';
import { BoardCanvas } from '../board/BoardCanvas';
import type { BoardState } from '../board/common';
import { buildGeometry } from '../board/geometry';
import { classico } from '../board/styles/classico';
import { vetro } from '../board/styles/vetro';
import { CONQUEST_TEXT, ObjectiveSheet, type ObjectiveInfo, type Skin } from '../play/objective';
import '../styles.css';
import './carta.css';

const board = BoardDef.parse(boardJson);
const geo = buildGeometry(board);
const STYLES = { classico, vetro };

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

/** Come la vede il giocatore: quello che arriverebbe dal server, col bersaglio "Marco". */
function infoFor(caseId: string, skin: Skin): ObjectiveInfo {
  if (caseId === 'conquest') return { kind: 'conquest', text: CONQUEST_TEXT };
  const asView = (id: string): FallbackObjectiveView => {
    const d = defs.find((x) => x.id === id)!;
    if (d.kind === 'continents') return { kind: 'continents', continents: d.continents, plusAny: d.plusAny ?? 0, text: d.text };
    if (d.kind === 'territories') return { kind: 'territories', count: d.count, minArmies: d.minArmies ?? null, text: d.text };
    throw new Error(`${id}: "elimina" non ha una vista di riserva`);
  };
  const d = defs.find((x) => x.id === caseId)!;
  if (d.kind !== 'eliminate') return asView(d.id);
  return {
    kind: 'eliminate',
    target: { name: 'Marco', color: STYLES[skin].playerColors[4]! },
    fallback: asView(d.fallback),
    text: d.text.replace('{giocatore}', 'Marco'),
  };
}

const EMPTY: BoardState = { owners: new Map(), armies: new Map(), hover: null, selected: null, tokens: false };
const INSETS = { top: 52, right: 0, bottom: 0, left: 0 };

function readUrl() {
  const q = new URLSearchParams(location.search);
  const skin: Skin = q.get('stile') === 'vetro' ? 'vetro' : 'classico';
  const obj = CASES.find((c) => c.id === q.get('obiettivo'))?.id ?? CASES[0].id;
  return { skin, obj };
}

function Page() {
  const [{ skin, obj }, setState] = useState(readUrl);
  const [replay, setReplay] = useState(0);
  const set = (patch: Partial<{ skin: Skin; obj: string }>) => setState((s) => ({ ...s, ...patch }) as typeof s);

  useEffect(() => {
    document.body.dataset.stile = skin;
    history.replaceState(null, '', `?stile=${skin}&obiettivo=${obj}`);
  }, [skin, obj]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('select')) return;
      const i = CASES.findIndex((c) => c.id === obj);
      if (e.key === 't' || e.key === 'T') set({ skin: skin === 'classico' ? 'vetro' : 'classico' });
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
  const me = STYLES[skin].playerColors[0]!;

  return (
    <>
      <div className="mock-stage">
        <BoardCanvas geo={geo} style={STYLES[skin]} state={EMPTY} insets={INSETS} />
      </div>
      <header className="mock-bar">
        <span className="mock-name">Prova: carta dell'obiettivo</span>
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
      <div className="objective-reveal" role="dialog" aria-modal="true" aria-labelledby="objective-title" key={`${skin}-${obj}-${replay}`}>
        <ObjectiveSheet info={info} geo={geo} board={board} skin={skin} me={me} titleId="objective-title" />
        <div className="objective-actions">
          <button type="button" className="primary">
            Ho capito
          </button>
          <p className="objective-wait">
            Si parte tra <b className="countdown num">0:25</b>
            <span>· altri 2 stanno leggendo</span>
          </p>
        </div>
        <p className="objective-hint">Lo ritrovi sempre insieme alle tue carte. Subito dopo si scelgono i territori a turno: pensa a quali ti servono.</p>
        <aside className="mock-compact" aria-label="Come appare tra le carte">
          <ObjectiveSheet info={info} geo={geo} board={board} skin={skin} me={me} compact />
        </aside>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
