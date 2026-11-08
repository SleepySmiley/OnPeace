import { useState } from 'react';
import { PLAYER_COLORS, ctx, useSession } from '../game/store';

const DEFAULT_NAMES = ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena', 'Fabio', 'Giulia', 'Luca'];

/** Preparazione della partita locale: giocatori, colori e opzioni principali. */
export function SetupScreen() {
  const newGame = useSession((s) => s.newGame);
  const [players, setPlayers] = useState(() =>
    DEFAULT_NAMES.slice(0, 3).map((name, i) => ({ name, color: PLAYER_COLORS[i]! })),
  );
  const [funds, setFunds] = useState(ctx.rules.game.startingFunds);
  const [maxTurns, setMaxTurns] = useState(ctx.rules.game.maxTurns);

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
    <div className="modal-backdrop">
      <form
        className="modal setup"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) newGame(players.map((p) => ({ ...p, name: p.name.trim() })), { startingFunds: funds, maxTurns });
        }}
      >
        <div className="panel-kicker">Partita locale · stesso PC</div>
        <h1>Nuova partita</h1>
        <p className="lead">
          Ognuno pianifica il proprio turno a schermo, poi passa il mouse al successivo. Quando tutti hanno finito, il
          turno si risolve.
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
                <input
                  value={p.name}
                  maxLength={18}
                  aria-label={`Nome giocatore ${i + 1}`}
                  onChange={(e) => setPlayer(i, { name: e.target.value })}
                />
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
            <input
              type="number"
              min={5}
              max={200}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
            />
          </label>
        </fieldset>

        <button type="submit" className="primary" disabled={!valid}>
          Scegli i paesi
        </button>
      </form>
    </div>
  );
}
