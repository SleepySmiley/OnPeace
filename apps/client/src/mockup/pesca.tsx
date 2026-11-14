/**
 * Pagina di prova della pesca (/pesca.html in sviluppo): la partita vera che gira nel browser
 * contro quattro avversari automatici, con la scena della pesca a fine turno com'è nel gioco. Dal
 * pannello in alto a destra si fanno partire pescate finte senza giocare un turno intero: un
 * territorio tuo o di altri, il jolly, due carte di fila, e gli incroci con le battaglie.
 */
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Card } from '@onpeace/conquista';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { useBattle } from '../play/battle';
import { useDraw } from '../play/draw';
import { GameScreen } from '../play/GameScreen';
import { useLook } from '../look';
import { setLinkFactory, useSession } from '../store';
import { startDemo } from './finte';
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

const params = new URLSearchParams(location.search);

let game: LocalGame | null = null;
function boot(start: Start) {
  game?.stop();
  game = new LocalGame(start);
  setLinkFactory(game.factory);
  useSession.setState({ board: localBoard });
  useSession.getState().create('Andrea', PLAYER_COLORS[0]!, {});
}

// ---------------------------------------------------------------- pescate finte

const SYMBOLS = ['infantry', 'cavalry', 'artillery'] as const;
let fakes = 0;

/** Una carta inventata (non finisce tra le carte vere): un territorio a caso, o il jolly. */
function fakeCard(kind: 'territorio' | 'mio' | 'jolly'): Card | null {
  fakes++;
  if (kind === 'jolly') return { id: `prova_${fakes}`, territory: null, symbol: 'joker' };
  const s = useSession.getState();
  const me = s.online.me;
  const ids = Object.entries(s.view?.territories ?? {})
    .filter(([, t]) => (kind === 'mio' ? t.owner === me : t.owner !== me))
    .map(([id]) => id);
  const territory = ids[Math.floor(Math.random() * ids.length)];
  if (!territory) return null;
  return { id: `prova_${fakes}`, territory, symbol: SYMBOLS[fakes % 3]! };
}

const DEMOS = [
  { id: 'territorio', name: 'Un territorio di un altro' },
  { id: 'mio', name: 'Un territorio tuo' },
  { id: 'jolly', name: 'Il jolly' },
  { id: 'due', name: 'Due carte di fila (eliminazione)' },
  { id: 'dopo', name: 'Subito dopo la tua battaglia' },
  { id: 'attaccato', name: 'Ti attaccano mentre peschi' },
] as const;

function demo(id: (typeof DEMOS)[number]['id']) {
  const push = useDraw.getState().push;
  const notice = (ok: boolean) => ok || useSession.getState().setNotice('Nessuna coppia di territori adatta a questa prova in questo momento.');
  if (id === 'dopo') {
    // la carta arriva mentre la tua battaglia è ancora in scena: aspetta che finisca
    notice(startDemo('attacco'));
    const c = fakeCard('territorio');
    if (c) setTimeout(() => push(c), 400);
    return;
  }
  if (id === 'attaccato') {
    // il mazzo aspetta il clic, e intanto ti attaccano: si toglie di mezzo e torna dopo
    const c = fakeCard('territorio');
    if (c) push(c);
    setTimeout(() => notice(startDemo('difesa')), 1600);
    return;
  }
  const cards = id === 'due' ? [fakeCard('territorio'), fakeCard('mio')] : [fakeCard(id)];
  for (const c of cards) if (c) push(c);
}

// per le prove automatiche dalla console
if (import.meta.env.DEV) Object.assign(window, { __pesca: useDraw, __demoPesca: demo, __look: useLook, __battaglia: useBattle });

// ---------------------------------------------------------------- pannello delle scelte

function Controls() {
  return (
    <aside className="bt-dock panel" aria-label="Prova della pesca">
      <span className="bt-dock-title">
        <span className="mock-tag">Prova</span> Pesca della carta
      </span>
      <select
        className="mock-restart"
        aria-label="Pesca una carta di prova"
        value=""
        onChange={(e) => {
          const v = e.target.value as (typeof DEMOS)[number]['id'] | '';
          e.target.blur();
          if (v) demo(v);
        }}
      >
        <option value="">Pesca una carta di prova…</option>
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
