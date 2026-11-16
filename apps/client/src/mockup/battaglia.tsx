/**
 * Pagina di prova della battaglia (/battaglia.html in sviluppo): la partita vera che gira nel
 * browser contro quattro avversari automatici, con la scena dei carri armati com'è nel gioco. Dal
 * pannello in alto a destra si provano le scelte ancora aperte ("fino in fondo" tiro per tiro o col
 * conto veloce, che cosa vede chi non combatte), le regole dei dadi (a coppie o a colpi, pari, dadi
 * della difesa: cambiandole si rifà la partita) e si fanno partire battaglie finte senza giocare.
 */
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { sfx } from '../audio/sfx';
import { useBattle, type BlitzMode, type Watch } from '../play/battle';
import { GameScreen } from '../play/GameScreen';
import { setLinkFactory, useSession } from '../store';
import { DEMOS, startDemo, type DemoKind } from './finte';
import { LocalGame, localBoard, type Start } from './locale';
import '../styles.css';
import './prova.css';
import './battaglia.css';

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

// i suoni della scena, come nel gioco: l'audio parte al primo clic o tasto (lo fa main.tsx, che qui non c'è)
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sfx.unlock(), { capture: true });

const params = new URLSearchParams(location.search);
const pick = <T extends string>(v: string | null, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);

useBattle.getState().setOptions({
  blitzMode: pick(params.get('fino'), ['tiri', 'conto'] as const, 'tiri'),
  watch: pick(params.get('altri'), ['piccola', 'intera', 'niente'] as const, 'piccola'),
});

/** Le scelte restano nell'indirizzo: ricaricando la pagina si ritrovano. */
function saveChoices() {
  const s = useBattle.getState();
  const url = new URLSearchParams(location.search);
  url.set('fino', s.blitzMode);
  url.set('altri', s.watch);
  history.replaceState(null, '', `?${url}`);
}
saveChoices();

/** Regole dei dadi della prova: stanno nell'indirizzo (le legge LocalGame), cambiandole si rifà la partita. */
function setRule(key: 'combattimento' | 'pari' | 'difesa', value: string) {
  const url = new URLSearchParams(location.search);
  url.set(key, value);
  history.replaceState(null, '', `?${url}`);
  boot('turno');
}
const rule = (key: string, d: string) => new URLSearchParams(location.search).get(key) ?? d;

let game: LocalGame | null = null;
function boot(start: Start) {
  game?.stop();
  game = new LocalGame(start);
  setLinkFactory(game.factory);
  useSession.setState({ board: localBoard });
  useSession.getState().create('Andrea', PLAYER_COLORS[0]!, {});
}

// per le prove automatiche dalla console
if (import.meta.env.DEV) Object.assign(window, { __battaglia: useBattle, __demo: startDemo });

// ---------------------------------------------------------------- pannello delle scelte

function Controls() {
  const blitzMode = useBattle((s) => s.blitzMode);
  const watch = useBattle((s) => s.watch);
  const setOptions = useBattle((s) => s.setOptions);
  const choose = (patch: Parameters<typeof setOptions>[0]) => {
    setOptions(patch);
    saveChoices();
  };
  return (
    <aside className="bt-dock panel" aria-label="Prova della battaglia">
      <span className="bt-dock-title">
        <span className="mock-tag">Prova</span> Battaglia
      </span>
      <select
        className="mock-restart"
        aria-label="Fino in fondo"
        title="Come si vede l'attacco fino in fondo"
        value={blitzMode}
        onChange={(e) => {
          e.target.blur();
          choose({ blitzMode: e.target.value as BlitzMode });
        }}
      >
        <option value="tiri">Fino in fondo: tiro per tiro</option>
        <option value="conto">Fino in fondo: conto veloce</option>
      </select>
      <select
        className="mock-restart"
        aria-label="Chi guarda"
        title="Che cosa vede chi non combatte"
        value={watch}
        onChange={(e) => {
          e.target.blur();
          choose({ watch: e.target.value as Watch });
        }}
      >
        <option value="piccola">Gli altri: in piccolo</option>
        <option value="intera">Gli altri: scena intera</option>
        <option value="niente">Gli altri: niente</option>
      </select>
      <select
        className="mock-restart"
        aria-label="Combattimento"
        value={rule('combattimento', 'coppie')}
        onChange={(e) => {
          e.target.blur();
          setRule('combattimento', e.target.value);
        }}
      >
        <option value="coppie">Dadi: a coppie</option>
        <option value="colpi">Dadi: a colpi (fino a 9)</option>
        <option value="turno">Dadi: a colpi, a turno</option>
      </select>
      <select
        className="mock-restart"
        aria-label="Dadi pari"
        value={rule('pari', 'difesa')}
        onChange={(e) => {
          e.target.blur();
          setRule('pari', e.target.value);
        }}
      >
        <option value="difesa">Pari: vince chi difende</option>
        <option value="attacco">Pari: vince chi attacca</option>
        <option value="coppia">Pari: si ritira la coppia</option>
        <option value="tutto">Pari: si ritira tutto</option>
      </select>
      <select
        className="mock-restart"
        aria-label="Dadi in difesa"
        value={rule('difesa', '3')}
        onChange={(e) => {
          e.target.blur();
          setRule('difesa', e.target.value);
        }}
      >
        <option value="3">Difesa: fino a 3 dadi</option>
        <option value="2">Difesa: fino a 2 dadi</option>
      </select>
      <select
        className="mock-restart"
        aria-label="Guarda una battaglia di prova"
        value=""
        onChange={(e) => {
          const v = e.target.value as DemoKind | '';
          e.target.blur();
          if (v && !startDemo(v)) useSession.getState().setNotice('Nessuna coppia di territori adatta a questa prova in questo momento.');
        }}
      >
        <option value="">Guarda una battaglia…</option>
        {DEMOS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
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
