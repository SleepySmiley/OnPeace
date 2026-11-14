/**
 * Pagina di prova dell'interfaccia (/interfaccia.html in sviluppo): la partita vera che gira nel
 * browser contro quattro avversari automatici, e un pannello (bottone "Prova" nella barra in alto)
 * per cambiare al volo come si vedono le fasi del turno, come si annuncia che tocca a te, gli
 * avvisi, i cassetti di carte e registro, le frecce del vetro. Le scelte restano nell'indirizzo.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { useLook } from '../look';
import { GameScreen } from '../play/GameScreen';
import { useUiLook, type Annuncio, type Avvisi, type Cassetti, type Fasi, type Frecce, type UiLook } from '../play/uilook';
import { setLinkFactory, useSession } from '../store';
import { LocalGame, localBoard, type Start } from './locale';
import '../styles.css';
import './prova.css';
import './battaglia.css';
import './interfaccia.css';

// la sessione della prova non deve prendere il posto di quella di una partita vera (stesso indirizzo)
const SESSION_KEY = 'onpeace.session';
const setItem = Storage.prototype.setItem;
const removeItem = Storage.prototype.removeItem;
Storage.prototype.setItem = function (key: string, value: string) {
  if (key !== SESSION_KEY) setItem.call(this, key, value);
};
Storage.prototype.removeItem = function (key: string) {
  if (key !== SESSION_KEY) removeItem.call(this, key);
};

const params = new URLSearchParams(location.search);

const FASI: { id: Fasi; name: string }[] = [
  { id: 'percorso', name: 'Percorso' },
  { id: 'giro', name: 'Giocatori' },
  { id: 'sotto', name: 'In basso' },
  { id: 'ora', name: 'Ora' },
];
const ANNUNCIO: { id: Annuncio; name: string }[] = [
  { id: 'fascia', name: 'Fascia' },
  { id: 'cornice', name: 'Cornice' },
  { id: 'entrambi', name: 'Tutte e due' },
  { id: 'ora', name: 'Ora' },
];
const AVVISI: { id: Avvisi; name: string }[] = [
  { id: 'notizie', name: 'Notizie' },
  { id: 'mappa', name: 'Sulla mappa' },
  { id: 'ora', name: 'Ora' },
];
const CASSETTI: { id: Cassetti; name: string }[] = [
  { id: 'colonna', name: 'Colonna' },
  { id: 'basso', name: 'Dal basso' },
  { id: 'mano', name: 'In mano' },
  { id: 'ora', name: 'Ora' },
];
const FRECCE: { id: Frecce; name: string }[] = [
  { id: 'chiare', name: 'Chiare' },
  { id: 'bordate', name: 'Col bordo' },
  { id: 'ora', name: 'Ora' },
];
/** Combinazioni pronte: com'è adesso e tre proposte intere. */
const PRESETS: { id: string; name: string; look: UiLook }[] = [
  { id: '1', name: '1', look: { fasi: 'percorso', annuncio: 'fascia', avvisi: 'notizie', cassetti: 'colonna', frecce: 'chiare' } },
  { id: '2', name: '2', look: { fasi: 'sotto', annuncio: 'cornice', avvisi: 'mappa', cassetti: 'basso', frecce: 'bordate' } },
  { id: '3', name: '3', look: { fasi: 'giro', annuncio: 'entrambi', avvisi: 'notizie', cassetti: 'mano', frecce: 'chiare' } },
  { id: 'ora', name: 'Ora', look: { fasi: 'ora', annuncio: 'ora', avvisi: 'ora', cassetti: 'ora', frecce: 'ora' } },
];

const pick = <T extends string>(v: string | null, all: { id: T }[], d: T): T => (all.some((o) => o.id === v) ? (v as T) : d);
const first = PRESETS[0]!.look;
useUiLook.getState().set({
  fasi: pick(params.get('fasi'), FASI, first.fasi),
  annuncio: pick(params.get('annuncio'), ANNUNCIO, first.annuncio),
  avvisi: pick(params.get('avvisi'), AVVISI, first.avvisi),
  cassetti: pick(params.get('cassetti'), CASSETTI, first.cassetti),
  frecce: pick(params.get('frecce'), FRECCE, first.frecce),
});

/** Le scelte restano nell'indirizzo: ricaricando la pagina si ritrovano. */
function saveChoices() {
  const ui = useUiLook.getState();
  const url = new URLSearchParams(location.search);
  url.set('fasi', ui.fasi);
  url.set('annuncio', ui.annuncio);
  url.set('avvisi', ui.avvisi);
  url.set('cassetti', ui.cassetti);
  url.set('frecce', ui.frecce);
  url.set('stile', useLook.getState().style.id);
  history.replaceState(null, '', `?${url}`);
}
saveChoices();

let game: LocalGame | null = null;
let held = false;
function boot(start: Start) {
  game?.stop();
  game = new LocalGame(start);
  game.setHold(held);
  setLinkFactory(game.factory);
  useSession.setState({ board: localBoard });
  useSession.getState().create('Andrea', PLAYER_COLORS[0]!, {});
}

// per le prove automatiche dalla console
if (import.meta.env.DEV) Object.assign(window, { __interfaccia: { ui: useUiLook, hold: (on: boolean) => game?.setHold(on), cards: (n: number) => game?.giveCards(n), boot }, __look: useLook });

// ---------------------------------------------------------------- pannello delle scelte

function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; name: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="ip-row">
      <span className="ip-label">{label}</span>
      <div className="bt-seg" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={o.id === value} onClick={() => onPick(o.id)}>
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Controls({ onClose }: { onClose: () => void }) {
  const ui = useUiLook();
  const style = useLook((s) => s.style);
  const [hold, setHold] = useState(held);
  const choose = (patch: Partial<UiLook>) => {
    ui.set(patch);
    saveChoices();
  };
  const preset = PRESETS.find((p) => (Object.keys(p.look) as (keyof UiLook)[]).every((k) => p.look[k] === ui[k]))?.id ?? '';
  return (
    <aside className="ip-dock panel" aria-label="Prova dell'interfaccia">
      <div className="ip-head">
        <span className="mock-tag">Prova</span> <b>Interfaccia</b>
        <button type="button" className="sc-close" aria-label="Chiudi il pannello" onClick={onClose}>
          ×
        </button>
      </div>
      <Seg label="Proposte intere" value={preset} options={PRESETS} onPick={(id) => choose(PRESETS.find((p) => p.id === id)!.look)} />
      <Seg label="Fasi del turno" value={ui.fasi} options={FASI} onPick={(fasi) => choose({ fasi })} />
      <Seg label="Quando tocca a te" value={ui.annuncio} options={ANNUNCIO} onPick={(annuncio) => choose({ annuncio })} />
      <Seg label="Avvisi" value={ui.avvisi} options={AVVISI} onPick={(avvisi) => choose({ avvisi })} />
      <Seg label="Carte, obiettivo, registro" value={ui.cassetti} options={CASSETTI} onPick={(cassetti) => choose({ cassetti })} />
      <Seg label="Frecce d'attacco (vetro)" value={ui.frecce} options={FRECCE} onPick={(frecce) => choose({ frecce })} />
      <Seg
        label="Tema"
        value={style.id}
        options={[
          { id: 'classico', name: 'Classico' },
          { id: 'vetro', name: 'Vetro' },
        ]}
        onPick={(id) => {
          useLook.getState().setStyle(id);
          saveChoices();
        }}
      />
      <Seg
        label="Avversari"
        value={hold ? 'fermi' : 'giocano'}
        options={[
          { id: 'giocano', name: 'Giocano' },
          { id: 'fermi', name: 'Fermi' },
        ]}
        onPick={(v) => {
          held = v === 'fermi';
          setHold(held);
          game?.setHold(held);
        }}
      />
      <div className="ip-actions">
        <button type="button" className="ghost tiny" onClick={() => useUiLook.setState((s) => ({ demo: s.demo + 1 }))}>
          Prova “Tocca a te”
        </button>
        <button type="button" className="ghost tiny" onClick={() => game?.giveCards(2)}>
          Dammi 2 carte
        </button>
        <select
          className="mock-restart"
          aria-label="Ricomincia la partita di prova"
          value=""
          onChange={(e) => {
            const v = e.target.value as Start | '';
            e.target.blur();
            if (v) boot(v);
          }}
        >
          <option value="">Rifai la partita…</option>
          <option value="turno">dal primo turno</option>
          <option value="inizio">dall'inizio vero</option>
        </select>
      </div>
    </aside>
  );
}

function Page() {
  const view = useSession((s) => s.view);
  const lobby = useSession((s) => s.online.lobby);
  const board = useSession((s) => s.board);
  const joined = useSession((s) => s.online.game);
  const booted = useRef(false);
  const wasIn = useRef(false);
  const [open, setOpen] = useState(params.get('pannello') !== 'chiuso');

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    boot(params.get('da') === 'inizio' ? 'inizio' : 'turno');
  }, []);

  if (view && lobby && board) wasIn.current = true;
  if (!view || !lobby || !board) {
    if (!wasIn.current || joined) return <p className="mock-out">Preparo la partita di prova…</p>;
    return (
      <div className="mock-out panel">
        <p>Sei uscito dalla prova.</p>
        <button type="button" className="primary" onClick={() => boot('turno')}>
          Ricomincia
        </button>
      </div>
    );
  }
  return (
    <GameScreen
      topbarExtra={
        <button type="button" className={`ghost tiny ip-toggle${open ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="mock-tag">Prova</span>
        </button>
      }
      extra={open ? <Controls onClose={() => setOpen(false)} /> : null}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
