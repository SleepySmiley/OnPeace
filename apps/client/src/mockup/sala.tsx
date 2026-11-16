/**
 * Pagina di prova della sala d'attesa (/sala.html in sviluppo): le opzioni a tessere, ognuna con
 * la sua scenetta, nella sala vera ma senza server. In alto si sceglie il tema e se sei l'host
 * (cambi le opzioni) o un ospite (le guardi soltanto). Su tre proposte (tessere, sotto la scelta,
 * tavolo a lato) si sono scelte le tessere.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import rulesJson from '@data/conquista/regole.json';
import { ConquestRules } from '@onpeace/conquista';
import { PLAYER_COLORS, type LobbySettings, type RoomSettings } from '@onpeace/protocol';
import { styleColor, useLook } from '../look';
import { diceRules } from '../play/describe';
import { LobbyOptions } from '../ui/LobbyOptions';
import '../styles.css';
import './prova.css';
import './sala.css';

const base = ConquestRules.parse(rulesJson);
const params = new URLSearchParams(location.search);

const PLAYERS = [
  { name: 'Andrea', color: PLAYER_COLORS[0]!, host: true },
  { name: 'Marco', color: PLAYER_COLORS[1]! },
  { name: 'Sara', color: PLAYER_COLORS[2]! },
];

function Page() {
  const look = useLook();
  const [isHost, setHost] = useState(params.get('ruolo') !== 'ospite');
  const [settings, setSettings] = useState<RoomSettings>({
    board: 'mondo',
    mode: 'objectives',
    distribution: base.setup.distribution,
    placement: base.setup.placement,
    turnSeconds: base.timers.turnSeconds,
    combat: 'alternate',
    ties: base.dice.tiesTo,
    defenseDice: base.dice.defenseMax,
  });
  useEffect(() => {
    const url = new URLSearchParams(location.search);
    url.set('stile', look.style.id);
    url.set('ruolo', isHost ? 'host' : 'ospite');
    history.replaceState(null, '', `?${url}`);
  }, [look.style.id, isHost]);
  // come il server: le regole della sala sono quelle di base con le opzioni dell'host
  const rules: ConquestRules = {
    ...base,
    setup: { ...base.setup, distribution: settings.distribution, placement: settings.placement },
    timers: { ...base.timers, turnSeconds: settings.turnSeconds },
    dice: { ...base.dice, combat: settings.combat, tiesTo: settings.ties, defenseMax: settings.defenseDice },
  };
  const set = (patch: LobbySettings) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <div className="home sala-mock">
      <aside className="sala-dock panel" aria-label="Prova della sala d'attesa">
        <span className="mock-tag">Prova</span>
        <b>Sala d'attesa</b>
        <select className="mock-restart" aria-label="Tema" value={look.style.id} onChange={(e) => look.setStyle(e.target.value)}>
          <option value="classico">Tavolo classico</option>
          <option value="vetro">Vetro</option>
        </select>
        <select className="mock-restart" aria-label="Chi sei" value={isHost ? 'host' : 'ospite'} onChange={(e) => setHost(e.target.value === 'host')}>
          <option value="host">Sei l'host</option>
          <option value="ospite">Sei un ospite</option>
        </select>
      </aside>

      <div className="lobby-card panel">
        <header className="lobby-head">
          <div>
            <p className="kicker">
              Sala d'attesa · Mondo · codice <span className="num">ermrqb</span>
            </p>
            <h1>Aspettando i giocatori</h1>
          </div>
          <button type="button" className="ghost">
            Esci
          </button>
        </header>

        <div className="lobby-grid">
          <section>
            <h2 className="section-title">
              Giocatori <span className="dim num">3/{rules.players.max}</span>
            </h2>
            <ul className="player-rows">
              {PLAYERS.map((p) => (
                <li key={p.name}>
                  <span className="chip" style={{ ['--c' as string]: styleColor(look.style, p.color) }} />
                  <span className="player-name">
                    {p.name}
                    {p.host && <span className="dim"> · host{isHost ? ' (tu)' : ''}</span>}
                  </span>
                  <span className="dot on" title="Collegato" />
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="section-title">Opzioni {!isHost && <span className="dim">(le sceglie l'host)</span>}</h2>
            <LobbyOptions rules={rules} settings={settings} isHost={isHost} onChange={set} />
          </section>
        </div>

        <details className="rules-brief">
          <summary>Le regole in breve</summary>
          <ul>
            <li>{diceRules(rules.dice)}</li>
          </ul>
        </details>

        <footer className="lobby-actions">
          {isHost ? (
            <button type="button" className="primary">
              Comincia la partita
            </button>
          ) : (
            <span className="dim">L'host farà partire la partita.</span>
          )}
        </footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
