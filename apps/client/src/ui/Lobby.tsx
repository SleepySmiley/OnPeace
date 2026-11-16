/** Sala d'attesa: link d'invito, giocatori e colori, opzioni dell'host (a tessere, ognuna spiegata), regole in breve, chat. */
import { useState } from 'react';
import { PLAYER_COLORS, type LobbySettings } from '@onpeace/protocol';
import { styleColor, useLook } from '../look';
import { inviteIsLocalOnly, inviteLink } from '../net';
import { diceRules } from '../play/describe';
import { useSession } from '../store';
import { ChatPanel } from './ChatPanel';
import { LobbyOptions } from './LobbyOptions';

export function Lobby() {
  const online = useSession((s) => s.online);
  const send = useSession((s) => s.send);
  const leave = useSession((s) => s.leave);
  const style = useLook((s) => s.style);
  const [copied, setCopied] = useState(false);
  const lobby = online.lobby;

  if (!lobby || lobby.phase !== 'lobby') {
    return (
      <div className="home">
        <div className="home-card panel">
          <p className="kicker">Partita online</p>
          <h1>{!online.connected ? 'Mi collego al server…' : lobby ? 'Carico la partita…' : 'Entro nella partita…'}</h1>
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
  const { settings, rules } = lobby;
  const used = new Set(lobby.players.map((p) => p.color));
  const set = (patch: LobbySettings) => send({ t: 'settings', settings: patch });
  const tooFewForObjectives = settings.mode === 'objectives' && lobby.players.length < rules.players.objectivesMin;
  const canStart = lobby.players.length >= rules.players.min && !tooFewForObjectives;
  const sets = rules.cards.sets;

  return (
    <div className="home">
      <div className="lobby-card panel">
        <header className="lobby-head">
          <div>
            <p className="kicker">
              Sala d'attesa · {lobby.board.name} · codice <span className="num">{lobby.id}</span>
            </p>
            <h1>Aspettando i giocatori</h1>
          </div>
          <button type="button" className="ghost" onClick={leave}>
            Esci
          </button>
        </header>

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
            {copied ? 'Copiato' : 'Copia il link'}
          </button>
        </div>
        {localOnly && (
          <p className="hint warn">
            Questo link funziona solo su questo PC. Per invitare gli amici avvia il gioco con <code>npm run serata</code>: il link userà
            l'indirizzo pubblico del tunnel.
          </p>
        )}

        <div className="lobby-grid">
          <section>
            <h2 className="section-title">
              Giocatori <span className="dim num">{lobby.players.length}/{rules.players.max}</span>
            </h2>
            <ul className="player-rows">
              {lobby.players.map((p) => (
                <li key={p.id}>
                  <span className="chip" style={{ ['--c' as string]: styleColor(style, p.color) }} />
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
              <div className="swatches" role="radiogroup" aria-label="Il tuo colore">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={c === me.color}
                    className="swatch"
                    style={{ ['--c' as string]: styleColor(style, c) }}
                    disabled={used.has(c) && c !== me.color}
                    aria-label={`Colore ${PLAYER_COLORS.indexOf(c) + 1}`}
                    onClick={() => send({ t: 'color', color: c })}
                  />
                ))}
              </div>
            )}
            <h2 className="section-title lobby-chat-title">Chat</h2>
            <div className="lobby-chat">
              <ChatPanel />
            </div>
          </section>

          <section>
            <h2 className="section-title">Opzioni {!isHost && <span className="dim">(le sceglie l'host)</span>}</h2>
            <LobbyOptions rules={rules} settings={settings} isHost={isHost} onChange={set} />
            {lobby.boards.length > 1 && (
              <label className="field lobby-board">
                <span>Tabellone</span>
                <select disabled={!isHost} value={settings.board} onChange={(e) => set({ board: e.target.value })}>
                  {lobby.boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.territories} territori)
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tooFewForObjectives && (
              <p className="hint warn">
                Con gli obiettivi segreti servono almeno {rules.players.objectivesMin} giocatori: in meno si gioca alla conquista del
                mondo.
              </p>
            )}
          </section>
        </div>

        <details className="rules-brief">
          <summary>Le regole in breve</summary>
          <ul>
            <li>
              All'inizio ognuno legge il suo obiettivo, poi i territori{' '}
              {settings.distribution === 'draft' ? 'si scelgono a turno, uno alla volta' : 'si distribuiscono a caso'}; le armate rimaste si
              piazzano {settings.placement === 'rounds' ? `a giri, ${rules.setup.perRound} per volta` : 'tutti insieme, alla cieca'}.
            </li>
            <li>
              A ogni turno: <b>rinforzi</b> (un'armata ogni {rules.reinforcements.divisor} territori, almeno {rules.reinforcements.minimum}
              , più il bonus dei continenti interi), poi <b>attacchi</b> quanto vuoi, poi <b>{rules.fortify.moves} spostamento</b> verso un
              territorio confinante.
            </li>
            <li>{diceRules(rules.dice)}</li>
            <li>
              Conquisti almeno un territorio nel turno: peschi una carta. Tris: tre uguali {sets.threeOfAKind.artillery}–
              {sets.threeOfAKind.cavalry} armate, uno per tipo {sets.oneOfEach}, jolly e coppia {sets.jokerPlusPair}; +
              {rules.cards.ownedTerritoryBonus} per ogni carta che mostra un tuo territorio.
            </li>
            <li>
              Nessuno può essere eliminato prima della fine del {rules.elimination.protectedRounds}° giro. Chi elimina un giocatore ne prende le
              carte.
            </li>
          </ul>
        </details>

        <footer className="lobby-actions">
          {isHost ? (
            <button type="button" className="primary" disabled={!canStart} onClick={() => send({ t: 'start' })}>
              Comincia la partita
            </button>
          ) : (
            <span className="dim">L'host farà partire la partita.</span>
          )}
          {isHost && lobby.players.length < rules.players.min && <span className="dim">Servono almeno {rules.players.min} giocatori.</span>}
        </footer>
      </div>
    </div>
  );
}
