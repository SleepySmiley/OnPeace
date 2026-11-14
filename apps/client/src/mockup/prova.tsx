/**
 * Partita di prova (/prova.html in sviluppo): il gioco vero, ma la partita gira nel browser
 * contro quattro avversari automatici, senza server e senza altri browser. Serve a provare
 * l'interfaccia giocando. Si parte dal primo turno, o dall'inizio vero con ?da=inizio
 * (obiettivo, scelta dei territori, piazzamento a giri); il tema con ?stile=vetro.
 */
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { useLook, type Layout } from '../look';
import { GameScreen } from '../play/GameScreen';
import { setLinkFactory, useSession } from '../store';
import { LocalGame, localBoard, type Start } from './locale';
import '../styles.css';
import './prova.css';

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

// disposizione: quella dell'indirizzo, altrimenti l'essenziale (senza cambiare la preferenza salvata)
const params = new URLSearchParams(location.search);
const layout = (['plancia', 'comandi', 'essenziale'] as Layout[]).find((l) => l === params.get('disposizione')) ?? 'essenziale';
useLook.setState({ layout });
document.body.dataset.disposizione = layout;

let game: LocalGame | null = null;
function boot(start: Start) {
  game?.stop();
  game = new LocalGame(start);
  setLinkFactory(game.factory);
  useSession.setState({ board: localBoard });
  useSession.getState().create('Andrea', PLAYER_COLORS[0]!, {});
}

function Restart() {
  return (
    <div className="mock-switch">
      <span className="mock-tag">Prova</span>
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
        <option value="">Rifai…</option>
        <option value="turno">dal primo turno</option>
        <option value="inizio">dall'inizio vero</option>
      </select>
    </div>
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
  return <GameScreen topbarExtra={<Restart />} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
