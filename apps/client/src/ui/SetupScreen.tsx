import { useState } from 'react';
import { gameFromUrl } from '../game/net';
import { PLAYER_COLORS, ctx, useSession } from '../game/store';
import { RARE_OPTIONS } from './LobbyScreen';

const DEFAULT_NAMES = ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena', 'Fabio', 'Giulia', 'Luca'];
const NAME_KEY = 'onpeace.name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // non disponibile: pazienza
  }
}

/** Schermata iniziale: partita online (crea o entra dal link) oppure sullo stesso PC. */
export function SetupScreen() {
  const invited = gameFromUrl();
  const [tab, setTab] = useState<'online' | 'local'>('online');
  return (
    <div className="modal-backdrop">
      <div className="modal setup">
        <div className="tabs setup-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>
            Online
          </button>
          <button type="button" role="tab" aria-selected={tab === 'local'} className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}>
            Stesso PC
          </button>
        </div>
        {tab === 'online' ? invited ? <JoinForm game={invited} /> : <CreateForm /> : <LocalForm />}
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-pick" role="group" aria-label="Colore">
      {PLAYER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${c === value ? 'chosen' : ''}`}
          style={{ background: c }}
          aria-label={`Colore ${c}`}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function CreateForm() {
  const createOnline = useSession((s) => s.createOnline);
  const joinOnline = useSession((s) => s.joinOnline);
  const [name, setName] = useState(savedName);
  const [color, setColor] = useState(PLAYER_COLORS[0]!);
  const [turnSeconds, setTurnSeconds] = useState(ctx.rules.turn.defaultSeconds);
  const [code, setCode] = useState('');
  const valid = name.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        rememberName(name.trim());
        createOnline(name.trim(), color, { turnSeconds });
      }}
    >
      <h1>Nuova partita online</h1>
      <p className="lead">Crei la partita e mandi il link agli amici: entrano con un nome, senza registrarsi.</p>
      <fieldset>
        <legend>Tu</legend>
        <input className="wide-input" value={name} maxLength={18} placeholder="Il tuo nome" aria-label="Il tuo nome" onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={color} onChange={setColor} />
      </fieldset>
      <fieldset className="options">
        <legend>Opzioni (modificabili nella sala d'attesa)</legend>
        <label>
          Durata turno
          <select value={turnSeconds} onChange={(e) => setTurnSeconds(Number(e.target.value))}>
            {[60, 90, 120, 180, 300, 480, 720].map((s) => (
              <option key={s} value={s}>
                {s < 120 ? `${s} s` : `${s / 60} min`}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <button type="submit" className="primary" disabled={!valid}>
        Crea partita
      </button>

      <div className="join-code">
        <span className="dim">Hai un codice?</span>
        <input value={code} maxLength={12} placeholder="es. k7hq2m" aria-label="Codice partita" onChange={(e) => setCode(e.target.value.trim())} />
        <button
          type="button"
          className="ghost"
          disabled={!valid || code.length < 4}
          onClick={() => {
            rememberName(name.trim());
            joinOnline(code, name.trim(), color);
          }}
        >
          Entra
        </button>
      </div>
    </form>
  );
}

function JoinForm({ game }: { game: string }) {
  const joinOnline = useSession((s) => s.joinOnline);
  const [name, setName] = useState(savedName);
  const [color, setColor] = useState(PLAYER_COLORS[1]!);
  const valid = name.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        rememberName(name.trim());
        joinOnline(game, name.trim(), color);
      }}
    >
      <h1>Sei stato invitato</h1>
      <p className="lead">
        Partita <span className="num">{game}</span>. Scegli un nome e un colore per entrare.
      </p>
      <fieldset>
        <legend>Tu</legend>
        <input className="wide-input" value={name} maxLength={18} placeholder="Il tuo nome" aria-label="Il tuo nome" autoFocus onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={color} onChange={setColor} />
      </fieldset>
      <button type="submit" className="primary" disabled={!valid}>
        Entra nella partita
      </button>
    </form>
  );
}

function LocalForm() {
  const newGame = useSession((s) => s.newGame);
  const [players, setPlayers] = useState(() =>
    DEFAULT_NAMES.slice(0, 3).map((name, i) => ({ name, color: PLAYER_COLORS[i]! })),
  );
  const [funds, setFunds] = useState(ctx.rules.game.startingFunds);
  const [maxTurns, setMaxTurns] = useState(ctx.rules.game.maxTurns);
  const [strategies, setStrategies] = useState(ctx.rules.game.strategies);
  const [general, setGeneral] = useState(ctx.rules.game.general);
  const [rarePct, setRarePct] = useState(ctx.rules.game.rareUnitChancePct);

  const setPlayer = (i: number, patch: Partial<{ name: string; color: string }>) =>
    setPlayers((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const nextColor = (current: string) => {
    const used = new Set(players.map((p) => p.color));
    const start = PLAYER_COLORS.indexOf(current);
    for (let k = 1; k <= PLAYER_COLORS.length; k++) {
      const c = PLAYER_COLORS[(start + k) % PLAYER_COLORS.length]!;
      if (!used.has(c)) return c;
    }
    return current;
  };
  const valid = players.length >= 2 && players.every((p) => p.name.trim().length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) {
          newGame(
            players.map((p) => ({ ...p, name: p.name.trim() })),
            { startingFunds: funds, maxTurns, strategies, general, rareUnitChancePct: rarePct },
          );
        }
      }}
    >
      <h1>Partita sullo stesso PC</h1>
      <p className="lead">
        Ognuno pianifica il proprio turno a schermo, poi passa il mouse al successivo. Quando tutti hanno finito, il turno
        si risolve.
      </p>
      <fieldset>
        <legend>Giocatori</legend>
        <ul className="player-list">
          {players.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                className="swatch"
                style={{ background: p.color }}
                aria-label={`Cambia colore di ${p.name}`}
                onClick={() => setPlayer(i, { color: nextColor(p.color) })}
              />
              <input value={p.name} maxLength={18} aria-label={`Nome giocatore ${i + 1}`} onChange={(e) => setPlayer(i, { name: e.target.value })} />
              <button
                type="button"
                className="ghost"
                onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))}
                disabled={players.length <= 2}
                aria-label={`Togli ${p.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="ghost"
          disabled={players.length >= 8}
          onClick={() =>
            setPlayers((ps) => [
              ...ps,
              {
                name: DEFAULT_NAMES[ps.length] ?? `Giocatore ${ps.length + 1}`,
                color: PLAYER_COLORS.find((c) => !ps.some((p) => p.color === c))!,
              },
            ])
          }
        >
          + Aggiungi giocatore
        </button>
      </fieldset>
      <fieldset className="options">
        <legend>Opzioni</legend>
        <label>
          Fondi iniziali
          <input type="number" min={0} step={100} value={funds} onChange={(e) => setFunds(Number(e.target.value))} />
        </label>
        <label>
          Durata (turni)
          <input type="number" min={5} max={200} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} />
        </label>
        <label>
          Strategie
          <select value={strategies ? 'si' : 'no'} onChange={(e) => setStrategies(e.target.value === 'si')}>
            <option value="si">Attive</option>
            <option value="no">Disattivate</option>
          </select>
        </label>
        <label>
          Generale
          <select value={general ? 'si' : 'no'} onChange={(e) => setGeneral(e.target.value === 'si')}>
            <option value="si">Sì</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          Unità rare
          <select value={rarePct} onChange={(e) => setRarePct(Number(e.target.value))}>
            {RARE_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <button type="submit" className="primary" disabled={!valid}>
        Scegli i paesi
      </button>
    </form>
  );
}
