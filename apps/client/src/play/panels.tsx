/** Pannelli della partita: giocatori, ultima battaglia, carte e obiettivo, registro, scheda del territorio. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { possibleSets, type Card, type GameEvent } from '@onpeace/conquista';
import { useLook } from '../look';
import { useSession } from '../store';
import { ChatPanel } from '../ui/ChatPanel';
import { CardView, Chip, Die } from './bits';
import { describeEvent, isHighlight, namesFor } from './describe';
import { actingPlayer, owned, totals } from './logic';
import { ObjectiveSheet, objectiveInfo, skinOf } from './objective';
import { useGame } from './useGame';

// ---------------------------------------------------------------- giocatori

export function PlayersPanel({ compact = false }: { compact?: boolean }) {
  const { view, lobby, me, colorOf } = useGame();
  const acting = actingPlayer(view);
  const seats = new Map(lobby.players.map((p) => [p.id, p]));
  const players = view.order.map((id) => view.players.find((p) => p.id === id)!);
  return (
    <section className={`players-panel${compact ? ' compact' : ''}`} aria-label="Giocatori">
      {!compact && <h2 className="section-title">Giocatori</h2>}
      <ol>
        {players.map((p) => {
          const seat = seats.get(p.id);
          const t = totals(view, p);
          const waiting = view.phase === 'setup' && !view.setupPlayer && !p.setupDone && !p.pending;
          const status = !p.alive ? 'eliminato' : seat?.left ? 'uscito' : !seat?.connected ? 'non collegato' : null;
          return (
            <li
              key={p.id}
              className={`${p.id === acting ? 'acting' : ''}${!p.alive ? ' dead' : ''}${seat?.left ? ' gone' : ''}`}
              title={status ?? undefined}
            >
              <span className="turn-mark" aria-hidden>
                {p.id === acting || waiting ? '▸' : ''}
              </span>
              <Chip color={colorOf(p.id)} />
              <span className="player-name">
                {p.name}
                {p.id === me && <span className="dim"> (tu)</span>}
                {status && !compact && <span className="status-tag">{status}</span>}
              </span>
              <span className="stat num" title="Territori">
                {t.territories}
                <small>terr.</small>
              </span>
              {!compact && (
                <span className="stat num" title="Armate">
                  {t.armies}
                  <small>arm.</small>
                </span>
              )}
              <span className="stat num" title="Carte in mano">
                {p.cardCount}
                <small>carte</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- ultima battaglia

type Battle = Extract<GameEvent, { type: 'battle' }>;

export function BattlePanel() {
  const { colorOf, playerName, territory, me } = useGame();
  const log = useSession((s) => s.log);
  const fresh = useSession((s) => s.fresh);
  const last = useMemo(() => [...log].reverse().find((e) => e.event.type === 'battle'), [log]);
  if (!last) return null;
  const b = last.event as Battle;
  const rolling = fresh?.events.some((e) => e.seq === last.seq) ?? false;
  const pairs = Math.min(b.attack.length, b.defense.length);
  const attackerWon = (i: number) => i < pairs && b.attack[i]! > b.defense[i]!;
  return (
    <section className="battle-panel" aria-label="Ultima battaglia" key={last.seq}>
      <div className={`battle-row${rolling ? ' rolling' : ''}`}>
        <div className="battle-side">
          <span className="battle-who">
            <Chip color={colorOf(b.player)} /> {b.player === me ? 'Tu' : playerName(b.player)}
          </span>
          <span className="battle-place">{territory(b.from)}</span>
          <span className="dice">
            {b.attack.map((v, i) => (
              <Die key={i} value={v} side="attack" lost={i < pairs && !attackerWon(i)} />
            ))}
          </span>
          <span className={`losses num${b.attackerLosses ? ' neg' : ''}`}>{b.attackerLosses ? `−${b.attackerLosses}` : '0'}</span>
        </div>
        <span className="battle-vs" aria-hidden>
          contro
        </span>
        <div className="battle-side">
          <span className="battle-who">
            <Chip color={colorOf(b.defender)} /> {b.defender === me ? 'Tu' : playerName(b.defender)}
          </span>
          <span className="battle-place">{territory(b.to)}</span>
          <span className="dice">
            {b.defense.map((v, i) => (
              <Die key={i} value={v} side="defense" lost={attackerWon(i)} />
            ))}
          </span>
          <span className={`losses num${b.defenderLosses ? ' neg' : ''}`}>{b.defenderLosses ? `−${b.defenderLosses}` : '0'}</span>
        </div>
      </div>
      {b.conquered && <p className="battle-result">Territorio conquistato</p>}
    </section>
  );
}

// ---------------------------------------------------------------- carte e obiettivo

export function HandPanel({ fan = false }: { fan?: boolean }) {
  const { view, lobby, board, me, move, territory, colorOf, playerName } = useGame();
  const skin = useLook((s) => skinOf(s.style.id));
  const sending = useSession((s) => s.sending);
  const playSet = useSession((s) => s.playSet);
  const mine = view.players.find((p) => p.id === me);
  const [chosen, setChosen] = useState<string[]>([]);
  const cards = useMemo(() => mine?.cards ?? [], [mine]);
  // le carte giocate spariscono dalla mano: si tolgono anche dalla scelta
  useEffect(() => setChosen((c) => c.filter((id) => cards.some((x) => x.id === id))), [cards]);
  if (!mine) return null;
  const objective = objectiveInfo(view, me, colorOf, playerName);
  const rules = lobby.rules;
  const ownedSet = new Set(me ? owned(view, me) : []);
  const bonusOf = (cs: Card[]) => cs.filter((c) => c.territory && ownedSet.has(c.territory)).length * rules.cards.ownedTerritoryBonus;
  const sets = possibleSets(rules, cards)
    .map((s) => ({ ...s, total: s.value + bonusOf(s.cards) }))
    .sort((a, b) => b.total - a.total);
  const canPlay = move.kind === 'place' && !move.setup && sending === null;
  const picked = chosen.map((id) => cards.find((c) => c.id === id)!).filter(Boolean);
  const pickedSet = picked.length === 3 ? sets.find((s) => s.cards.every((c) => chosen.includes(c.id))) : undefined;
  const best = sets[0];
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? [...c.slice(1), id] : [...c, id]));

  return (
    <section className={`hand-panel${fan ? ' fan' : ''}`} aria-label="Le tue carte e il tuo obiettivo">
      {objective && me && <ObjectiveSheet info={objective} geo={board.geo} board={board.def} skin={skin} me={colorOf(me)} compact />}
      <div className="hand-head">
        <h2 className="section-title">
          Carte <span className="dim num">{cards.length}</span>
        </h2>
        {sets.length > 0 && (
          <span className="dim">
            {sets.length === 1 ? 'Un tris giocabile' : `${sets.length} tris giocabili`}
          </span>
        )}
      </div>
      {cards.length === 0 ? (
        <p className="dim empty">Conquista almeno un territorio in un turno per pescare una carta.</p>
      ) : (
        <div className="cards">
          {cards.map((c) => (
            <CardView
              key={c.id}
              card={c}
              territory={c.territory ? territory(c.territory) : null}
              owned={Boolean(c.territory && ownedSet.has(c.territory))}
              chosen={chosen.includes(c.id)}
              onClick={sets.length > 0 ? () => toggle(c.id) : undefined}
            />
          ))}
        </div>
      )}
      {sets.length > 0 && (
        <div className="set-actions">
          {pickedSet ? (
            <button type="button" className="primary" disabled={!canPlay} onClick={() => playSet(pickedSet.cards.map((c) => c.id) as [string, string, string])}>
              Gioca questo tris · +{pickedSet.total}
            </button>
          ) : (
            best && (
              <button type="button" className={canPlay ? 'primary' : 'ghost'} disabled={!canPlay} onClick={() => playSet(best.cards.map((c) => c.id) as [string, string, string])}>
                Gioca il tris migliore · +{best.total}
              </button>
            )
          )}
          <span className="hint">
            {!canPlay ? 'I tris si giocano all’inizio del tuo turno, prima dei rinforzi.' : picked.length > 0 && !pickedSet ? 'Queste carte non fanno un tris.' : 'Tocca le carte per scegliere un tris diverso.'}
          </span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- registro e chat

export function LogPanel() {
  const { view, territory, me } = useGame();
  const log = useSession((s) => s.log);
  const end = useRef<HTMLLIElement>(null);
  const names = useMemo(() => namesFor(view, territory), [view, territory]);
  // scrollIntoView nei browser recenti restituisce una promessa: l'effetto non deve restituirla
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);
  return (
    <ol className="log">
      {log.length === 0 && <li className="dim">Ancora niente.</li>}
      {log.slice(-150).map((e) => (
        <li key={e.seq} className={`${isHighlight(e.event) ? 'hl ' : ''}ev-${e.event.type}`}>
          {describeEvent(e.event, names, me)}
        </li>
      ))}
      <li ref={end} aria-hidden />
    </ol>
  );
}

export function LogChat({ initial = 'log' }: { initial?: 'log' | 'chat' }) {
  const [tab, setTab] = useState<'log' | 'chat'>(initial);
  const unread = useSession((s) => s.online.unread);
  return (
    <section className="logchat" aria-label="Registro e chat">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>
          Registro
        </button>
        <button type="button" role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>
          Chat {unread > 0 && tab !== 'chat' && <span className="count">{unread}</span>}
        </button>
      </div>
      <div className="tab-body">{tab === 'log' ? <LogPanel /> : <ChatPanel />}</div>
    </section>
  );
}

// ---------------------------------------------------------------- territorio sotto il mouse

export function TerritoryInfo() {
  const { view, board, colorOf, playerName, me } = useGame();
  const hover = useSession((s) => s.hover);
  const selected = useSession((s) => s.draft.selected);
  const id = hover ?? selected;
  if (!id) return null;
  const def = board.def.territories.find((t) => t.id === id);
  const t = view.territories[id];
  if (!def || !t) return null;
  const continent = board.def.continents.find((c) => c.id === def.continent);
  const holder = continent && Object.entries(view.territories).every(([tid, x]) => board.geo.continentOf.get(tid) !== continent.id || x.owner === t.owner);
  return (
    <aside className="territory-info" aria-live="polite">
      <p className="ti-name">{def.name}</p>
      <p className="ti-continent dim">
        {continent?.name} · bonus +{continent?.bonus}
        {holder && <> · {t.owner === me ? 'tutto tuo' : `tutto di ${playerName(t.owner)}`}</>}
      </p>
      <p className="ti-owner">
        <Chip color={colorOf(t.owner)} /> {t.owner === me ? 'Tuo' : playerName(t.owner)}
        <span className="ti-armies num">{t.armies}</span>
      </p>
    </aside>
  );
}
