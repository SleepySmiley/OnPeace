/**
 * Pagina di prova della scena della battaglia (/battaglia.html in sviluppo): la partita vera che
 * gira nel browser contro quattro avversari automatici, con la scena in quattro proposte da
 * confrontare giocando. A tavolo dei dadi · B duello tra le pedine · C la mappa che zooma sui
 * due territori · D riquadro al centro · E la mappa zooma sui due stati e i carri armati si sparano. Dalla barra in alto: come va "fino in fondo", che cosa
 * vede chi non combatte, e battaglie finte per vedere la scena senza giocare.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { setBattleSoundsByScene } from '../audio/useGameSounds';
import type { BoardPainter } from '../board/painter';
import { GameScreen } from '../play/GameScreen';
import { setLinkFactory, useSession } from '../store';
import { connectBattleFeed, PROPOSALS, useBattle, type BlitzMode, type DemoKind, type Proposal, type TankLook, type Watch } from './battaglia-feed';
import { BattleLayer } from './battaglia-scene';
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

// i suoni delle battaglie li fa la scena, a tempo coi dadi
setBattleSoundsByScene(true);
connectBattleFeed();
// per le prove automatiche dalla console
if (import.meta.env.DEV) Object.assign(window, { __battaglia: useBattle });

const params = new URLSearchParams(location.search);

let game: LocalGame | null = null;
function boot(start: Start) {
  game?.stop();
  game = new LocalGame(start);
  setLinkFactory(game.factory);
  useSession.setState({ board: localBoard });
  useSession.getState().create('Andrea', PLAYER_COLORS[0]!, {});
}

const DEMOS: { id: DemoKind; name: string }[] = [
  { id: 'attacco', name: 'Attacchi tu, un tiro' },
  { id: 'fino', name: 'Attacchi tu, fino in fondo' },
  { id: 'perso', name: 'Attacchi tu e ti respingono' },
  { id: 'difesa', name: 'Ti attaccano' },
  { id: 'altri', name: 'Due avversari tra loro' },
];

function Controls() {
  const proposal = useBattle((s) => s.proposal);
  const tankLook = useBattle((s) => s.tankLook);
  const blitzMode = useBattle((s) => s.blitzMode);
  const watch = useBattle((s) => s.watch);
  const setOptions = useBattle((s) => s.setOptions);
  const demo = useBattle((s) => s.demo);
  return (
    <aside className="bt-dock panel" aria-label="Prova della scena della battaglia">
      <span className="bt-dock-title">
        <span className="mock-tag">Prova</span> Scena della battaglia
      </span>
      <div className="bt-seg" role="radiogroup" aria-label="Proposta della scena">
        {PROPOSALS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={proposal === p.id}
            title={p.tip}
            onClick={(e) => {
              e.currentTarget.blur();
              setOptions({ proposal: p.id as Proposal });
            }}
          >
            <b>{p.letter}</b> {p.name}
          </button>
        ))}
      </div>
      {proposal === 'carri' && (
        <select
          className="mock-restart"
          aria-label="Come sono i carri"
          value={tankLook}
          onChange={(e) => {
            e.target.blur();
            setOptions({ tankLook: e.target.value as TankLook });
          }}
        >
          <option value="lato">Carri visti di lato</option>
          <option value="alto">Carri visti dall'alto</option>
        </select>
      )}
      <select
        className="mock-restart"
        aria-label="Guarda una battaglia di prova"
        value=""
        onChange={(e) => {
          const v = e.target.value as DemoKind | '';
          e.target.blur();
          if (v) demo(v);
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
        aria-label="Fino in fondo"
        title="Come si vede l'attacco fino in fondo"
        value={blitzMode}
        onChange={(e) => {
          e.target.blur();
          setOptions({ blitzMode: e.target.value as BlitzMode });
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
          setOptions({ watch: e.target.value as Watch });
        }}
      >
        <option value="piccola">Gli altri: in piccolo</option>
        <option value="intera">Gli altri: scena intera</option>
        <option value="niente">Gli altri: niente</option>
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
  const [painter, setPainter] = useState<BoardPainter | null>(null);
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
  return (
    <GameScreen
      onPainter={setPainter}
      revealBattles={false}
      scene={
        <>
          <BattleLayer painter={painter} />
          <Controls />
        </>
      }
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
