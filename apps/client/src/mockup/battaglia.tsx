/**
 * Pagina di prova della battaglia (/battaglia.html in sviluppo): la partita vera che gira nel
 * browser contro quattro avversari automatici, con la scena dei carri armati com'è nel gioco. Dal
 * pannello in alto a destra si provano le scelte ancora aperte ("fino in fondo" tiro per tiro o col
 * conto veloce, che cosa vede chi non combatte) e si fanno partire battaglie finte senza giocare.
 */
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { feedRoll, fighter, useBattle, type BlitzMode, type Role, type Roll, type Watch } from '../play/battle';
import { GameScreen } from '../play/GameScreen';
import { setLinkFactory, useSession } from '../store';
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

let game: LocalGame | null = null;
function boot(start: Start) {
  game?.stop();
  game = new LocalGame(start);
  setLinkFactory(game.factory);
  useSession.setState({ board: localBoard });
  useSession.getState().create('Andrea', PLAYER_COLORS[0]!, {});
}

// ---------------------------------------------------------------- battaglie finte

type DemoKind = 'attacco' | 'fino' | 'difesa' | 'altri' | 'perso';

const DEMOS: { id: DemoKind; name: string }[] = [
  { id: 'attacco', name: 'Attacchi tu, un tiro' },
  { id: 'fino', name: 'Attacchi tu, fino in fondo' },
  { id: 'perso', name: 'Attacchi tu e ti respingono' },
  { id: 'difesa', name: 'Ti attaccano' },
  { id: 'altri', name: 'Due avversari tra loro' },
];

function rollDice(n: number) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)).sort((x, y) => y - x);
}

function fight(a: number, d: number): Roll {
  const attack = rollDice(Math.min(3, a - 1));
  const defense = rollDice(Math.min(3, d));
  let aLoss = 0;
  let dLoss = 0;
  for (let i = 0; i < Math.min(attack.length, defense.length); i++) {
    if (attack[i]! > defense[i]!) dLoss++;
    else aLoss++;
  }
  return { attack, defense, aLoss, dLoss, conquered: d - dLoss === 0 };
}

/** Una battaglia finta tra territori veri della partita: i tiri arrivano uno alla volta, come dal server. */
function startDemo(kind: DemoKind): boolean {
  const s = useSession.getState();
  const view = s.view;
  const board = s.board;
  const me = s.online.me;
  if (!view || !board || !me) return false;
  // una coppia di territori confinanti con i padroni giusti per il tipo di prova
  const wantA = (o: string) => (kind === 'difesa' || kind === 'altri' ? o !== me : o === me);
  const wantD = (o: string, a: string) => (kind === 'difesa' ? o === me : kind === 'altri' ? o !== me && o !== a : o !== me);
  const ids = Object.keys(view.territories).sort(() => Math.random() - 0.5);
  let pair: [string, string] | null = null;
  for (const from of ids) {
    const fo = view.territories[from]!.owner;
    if (!wantA(fo)) continue;
    const to = (board.geo.neighbours.get(from) ?? []).find((n) => wantD(view.territories[n]!.owner, fo));
    if (to) {
      pair = [from, to];
      break;
    }
  }
  if (!pair) return false;
  const [from, to] = pair;
  const start = { attacco: [7, 3], fino: [11, 6], difesa: [6, 4], altri: [5, 3], perso: [4, 7] }[kind] as [number, number];
  let [a, d] = start;
  const rolls: Roll[] = [];
  const many = kind === 'fino' || kind === 'perso';
  do {
    const r = fight(a, d);
    rolls.push(r);
    a -= r.aLoss;
    d -= r.dLoss;
  } while (many && d > 0 && a > 1);
  if (kind === 'difesa' && d > 0 && a > 1) rolls.push(fight(a, d));
  const role: Role = kind === 'difesa' ? 'defender' : kind === 'altri' ? 'spectator' : 'attacker';
  const demo = { blitz: many };
  const base = {
    role,
    a: fighter(view, view.territories[from]!.owner, from, start[0]),
    d: fighter(view, view.territories[to]!.owner, to, start[1]),
    demo,
  };
  const step = useBattle.getState().blitzMode === 'conto' ? 380 : 1000;
  let left = start[0];
  rolls.forEach((r, i) => {
    setTimeout(
      () => {
        left -= r.aLoss;
        if (i === rolls.length - 1) demo.blitz = false;
        feedRoll(base, r, left);
      },
      i === 0 ? 0 : 60 + i * step,
    );
  });
  return true;
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
