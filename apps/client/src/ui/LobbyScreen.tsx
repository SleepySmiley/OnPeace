import { useState } from 'react';
import { inviteIsLocalOnly, inviteLink } from '../game/net';
import { PLAYER_COLORS, ctx, useSession } from '../game/store';
import { ChatPanel } from './ChatPanel';
import { DoctrinePanel } from './DoctrinePanel';
import { MapPicker } from './MapPicker';

/** Probabilità di trovare un'unità rara conquistando una città. */
export const RARE_OPTIONS: [number, string][] = [
  [0, 'Nessuna'],
  [2, 'Poche (2%)'],
  [5, 'Normali (5%)'],
  [10, 'Molte (10%)'],
  [20, 'Moltissime (20%)'],
];

/** Sala d'attesa online: link d'invito, giocatori, colori, opzioni dell'host, dottrina. */
export function LobbyScreen() {
  const online = useSession((s) => s.online);
  const send = useSession((s) => s.send);
  const chooseDoctrine = useSession((s) => s.chooseDoctrine);
  const leave = useSession((s) => s.leaveOnline);
  const [copied, setCopied] = useState(false);
  const lobby = online.lobby;

  if (!lobby) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="panel-kicker">Partita online</div>
          <h1>{online.connected ? 'Entro nella partita…' : 'Mi collego al server…'}</h1>
          <p className="lead">Se non succede nulla, controlla che il server sia acceso.</p>
          <button type="button" className="ghost" onClick={leave}>
            Annulla
          </button>
        </div>
      </div>
    );
  }

  const isHost = lobby.hostId === online.me;
  const me = lobby.players.find((p) => p.id === online.me);
  const link = inviteLink(lobby.id, online.publicUrl);
  const localOnly = inviteIsLocalOnly(online.publicUrl);
  const settings = lobby.settings;
  const used = new Set(lobby.players.map((p) => p.color));
  const strategiesOn = settings.strategies ?? ctx.rules.game.strategies;
  const generalOn = settings.general ?? ctx.rules.game.general;

  return (
    <div className="modal-backdrop">
      <div className="modal lobby">
        <div className="panel-kicker">
          Sala d'attesa · {lobby.mapName} · codice <span className="num">{lobby.id}</span>
        </div>
        <h1>Aspettando i giocatori</h1>

        <div className="invite">
          <input readOnly value={link} aria-label="Link d'invito" onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Copiato' : 'Copia link'}
          </button>
        </div>
        {localOnly && (
          <p className="hint-text warn">
            Questo link funziona solo su questo PC. Per invitare gli amici avvia il gioco con{' '}
            <code>npm run serata</code>: il link userà l'indirizzo pubblico del tunnel.
          </p>
        )}

        <div className="lobby-grid">
          <section>
            <h3 className="section-title">Giocatori ({lobby.players.length}/8)</h3>
            <ul className="player-rows">
              {lobby.players.map((p) => (
                <li key={p.id}>
                  <span className="swatch small" style={{ background: p.color }} />
                  <span className="player-name">
                    {p.name}
                    {p.id === lobby.hostId && <span className="dim"> · host</span>}
                    {p.id === online.me && <span className="dim"> (tu)</span>}
                  </span>
                  <span className={`dot ${p.connected ? 'on' : 'off'}`} title={p.connected ? 'Collegato' : 'Non collegato'} />
                  {isHost && p.id !== online.me && (
                    <button type="button" className="ghost tiny" onClick={() => send({ t: 'kick', player: p.id })}>
                      Togli
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {me && (
              <div className="color-pick" role="group" aria-label="Il tuo colore">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${c === me.color ? 'chosen' : ''}`}
                    style={{ background: c }}
                    disabled={used.has(c) && c !== me.color}
                    aria-label={`Colore ${c}`}
                    onClick={() => send({ t: 'color', color: c })}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="section-title">Opzioni</h3>
            <div className="options">
              <MapPicker
                maps={lobby.maps}
                value={lobby.mapId}
                disabled={!isHost}
                onChange={(map) => send({ t: 'settings', settings: { map } })}
              />
              <label>
                Durata turno
                <select
                  disabled={!isHost}
                  value={settings.turnSeconds ?? ctx.rules.turn.defaultSeconds}
                  onChange={(e) => send({ t: 'settings', settings: { turnSeconds: Number(e.target.value) } })}
                >
                  {[60, 90, 120, 180, 300, 480, 720].map((s) => (
                    <option key={s} value={s}>
                      {s < 120 ? `${s} s` : `${s / 60} min`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fondi iniziali
                <input
                  type="number"
                  disabled={!isHost}
                  min={0}
                  step={100}
                  defaultValue={settings.startingFunds ?? ctx.rules.game.startingFunds}
                  onBlur={(e) => send({ t: 'settings', settings: { startingFunds: Number(e.target.value) } })}
                />
              </label>
              <label>
                Durata (turni)
                <input
                  type="number"
                  disabled={!isHost}
                  min={5}
                  max={500}
                  defaultValue={settings.maxTurns ?? ctx.rules.game.maxTurns}
                  onBlur={(e) => send({ t: 'settings', settings: { maxTurns: Number(e.target.value) } })}
                />
              </label>
              <label>
                Paesi a testa
                <select
                  disabled={!isHost}
                  value={settings.initialCountries ?? ctx.rules.game.initialCountries}
                  onChange={(e) => send({ t: 'settings', settings: { initialCountries: Number(e.target.value) } })}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Strategie
                <select
                  disabled={!isHost}
                  value={strategiesOn ? 'si' : 'no'}
                  onChange={(e) => send({ t: 'settings', settings: { strategies: e.target.value === 'si' } })}
                >
                  <option value="si">Attive</option>
                  <option value="no">Disattivate</option>
                </select>
              </label>
              <label>
                Generale
                <select
                  disabled={!isHost}
                  value={generalOn ? 'si' : 'no'}
                  onChange={(e) => send({ t: 'settings', settings: { general: e.target.value === 'si' } })}
                >
                  <option value="si">Sì</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                Unità rare
                <select
                  disabled={!isHost}
                  value={settings.rareUnitChancePct ?? ctx.rules.game.rareUnitChancePct}
                  onChange={(e) => send({ t: 'settings', settings: { rareUnitChancePct: Number(e.target.value) } })}
                >
                  {RARE_OPTIONS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        {(strategiesOn || generalOn) && (
          <section className="lobby-doctrine">
            <h3 className="section-title">La tua dottrina (segreta fino al turno 1)</h3>
            <DoctrinePanel
              doctrine={lobby.doctrine}
              strategies={strategiesOn}
              general={generalOn}
              onChange={chooseDoctrine}
            />
          </section>
        )}

        <h3 className="section-title">Chat</h3>
        <div className="lobby-chat">
          <ChatPanel />
        </div>

        <div className="button-row lobby-actions">
          {isHost ? (
            <button
              type="button"
              className="primary"
              disabled={lobby.players.length < 2}
              onClick={() => send({ t: 'start' })}
            >
              Inizia la partita
            </button>
          ) : (
            <span className="dim">L'host farà partire la partita.</span>
          )}
          <button type="button" className="ghost" onClick={leave}>
            Esci
          </button>
        </div>
      </div>
    </div>
  );
}
