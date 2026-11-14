/**
 * Pagina di prova della mappa (/mappa.html in sviluppo): la partita vera che gira nel browser
 * contro quattro avversari automatici, e un pannello in alto a destra per cambiare al volo come si
 * legge la mappa: di chi è un territorio, dove si può agire adesso, dove finisce un continente.
 * Gli avversari si possono fermare per guardare con calma.
 */
import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { mapLook, onMapLook, setMapLook, type ActiveLook, type ContinentLook, type MapLook, type OwnerLook } from '../board/maplook';
import { GameScreen } from '../play/GameScreen';
import { useLook } from '../look';
import { setLinkFactory, useSession } from '../store';
import { LocalGame, localBoard, type Start } from './locale';
import '../styles.css';
import './prova.css';
import './battaglia.css';
import './mappa.css';

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

const OWNER: { id: OwnerLook; name: string }[] = [
  { id: 'fill', name: 'Pieno' },
  { id: 'rim', name: 'Bordo' },
  { id: 'hatch', name: 'Righe' },
  { id: 'now', name: 'Ora' },
];
const ACTIVE: { id: ActiveLook; name: string }[] = [
  { id: 'fade', name: 'Sbiaditi' },
  { id: 'pulse', name: 'Contorno' },
  { id: 'both', name: 'Entrambi' },
  { id: 'veil', name: 'Ora' },
];
const CONTINENT: { id: ContinentLook; name: string }[] = [
  { id: 'ribbon', name: 'Nastro' },
  { id: 'gap', name: 'Canale' },
  { id: 'line', name: 'Ora' },
];
/** Combinazioni pronte: com'è adesso e tre proposte intere. */
const PRESETS: { id: string; name: string; look: MapLook }[] = [
  { id: 'ora', name: 'Ora', look: { owner: 'now', active: 'veil', continent: 'line' } },
  { id: '1', name: '1', look: { owner: 'fill', active: 'fade', continent: 'ribbon' } },
  { id: '2', name: '2', look: { owner: 'rim', active: 'pulse', continent: 'gap' } },
  { id: '3', name: '3', look: { owner: 'hatch', active: 'both', continent: 'ribbon' } },
];

const pick = <T extends string>(v: string | null, all: { id: T }[], d: T): T => (all.some((o) => o.id === v) ? (v as T) : d);
setMapLook({
  owner: pick(params.get('chi'), OWNER, 'fill'),
  active: pick(params.get('attivi'), ACTIVE, 'fade'),
  continent: pick(params.get('continenti'), CONTINENT, 'ribbon'),
});

/** Le scelte restano nell'indirizzo: ricaricando la pagina si ritrovano. */
function saveChoices() {
  const url = new URLSearchParams(location.search);
  url.set('chi', mapLook.owner);
  url.set('attivi', mapLook.active);
  url.set('continenti', mapLook.continent);
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
if (import.meta.env.DEV) Object.assign(window, { __mappa: { mapLook, setMapLook, hold: (on: boolean) => game?.setHold(on) }, __look: useLook });

// ---------------------------------------------------------------- pannello delle scelte

const snapshot = () => `${mapLook.owner}|${mapLook.active}|${mapLook.continent}`;

function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; name: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="mp-row">
      <span className="mp-label">{label}</span>
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

function Controls() {
  useSyncExternalStore(onMapLook, snapshot);
  const style = useLook((s) => s.style);
  const [hold, setHold] = useState(held);
  const choose = (patch: Partial<MapLook>) => {
    setMapLook(patch);
    saveChoices();
  };
  const preset = PRESETS.find((p) => p.look.owner === mapLook.owner && p.look.active === mapLook.active && p.look.continent === mapLook.continent)?.id ?? '';
  return (
    <aside className="bt-dock mp-dock panel" aria-label="Prova della mappa">
      <span className="bt-dock-title">
        <span className="mock-tag">Prova</span> Mappa leggibile
      </span>
      <Seg label="Proposte" value={preset} options={PRESETS} onPick={(id) => choose(PRESETS.find((p) => p.id === id)!.look)} />
      <Seg label="Di chi è" value={mapLook.owner} options={OWNER} onPick={(owner) => choose({ owner })} />
      <Seg label="Dove puoi agire" value={mapLook.active} options={ACTIVE} onPick={(active) => choose({ active })} />
      <Seg label="Continenti" value={mapLook.continent} options={CONTINENT} onPick={(continent) => choose({ continent })} />
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
        <option value="inizio">dall'inizio vero (scelta dei territori)</option>
      </select>
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
  return <GameScreen extra={<Controls />} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
