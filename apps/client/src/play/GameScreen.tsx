/**
 * La schermata della partita: il tabellone a tutto schermo, i giocatori in alto a sinistra, la
 * barra dei comandi in basso, carte e registro in due cassetti, la scena delle battaglie sopra la mappa. Tasti: Esc annulla (nei rinforzi
 * toglie le armate non confermate), Invio conferma, 1-3 dadi, 0 vista d'insieme.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setBattleSoundsByScene, useGameSounds } from '../audio/useGameSounds';
import { BoardCanvas } from '../board/BoardCanvas';
import type { BoardState } from '../board/common';
import type { BoardPainter, Insets } from '../board/painter';
import { useLook } from '../look';
import { useSession } from '../store';
import { GuideModal } from '../ui/GuideModal';
import { ReportModal } from '../ui/ReportModal';
import { CommandBar } from './CommandBar';
import { describeEvent, isHighlight, namesFor } from './describe';
import { GameOver } from './GameOver';
import { attackTargets, freeTerritories, isMyMove, maxDice, moveTargets, owned } from './logic';
import { ObjectiveCard } from './ObjectiveCard';
import { connectBattleFeed, useBattle } from './battle';
import { BattleLayer } from './BattleScene';
import { cardsInScene, useDraw } from './draw';
import { connectDrawFeed, DrawLayer } from './DrawScene';
import { BattlePanel, HandPanel, LogChat, PlayersPanel, TerritoryInfo } from './panels';
import { BottomSheet, HandFan, HandTable, MapCallouts, NewsToasts, SideColumn, TurnAnnounce, type ColumnTab } from './proposte';
import { TopBar } from './TopBar';
import { useUiLook } from './uilook';
import { useGame } from './useGame';

/** Spazio coperto da barra in alto e barra dei comandi: la mappa si adatta nel resto. */
const INSETS: Insets = { top: 56, right: 0, bottom: 110, left: 0 };
/** Proposta "colonna": larghezza della colonna a destra (con il suo margine). */
const COLUMN = 384;

/** Il tabellone con lo stato della partita, le scelte in corso e i lampi delle ultime battaglie. */
function useBoardState(): BoardState {
  const { view, board, me, move, lobby, colorOf } = useGame();
  const draft = useSession((s) => s.draft);
  const hover = useSession((s) => s.hover);
  const fresh = useSession((s) => s.fresh);
  // durante la scena della battaglia i due territori non hanno la pedina: ci sono i carri della scena
  const fighting = useBattle((s) => (s.playing && !s.playing.small && s.playing.stage !== 'outro' ? `${s.playing.eng.a.territory}|${s.playing.eng.d.territory}` : ''));
  // la carta appena pescata: il suo territorio lampeggia
  const spot = useDraw((s) => s.spot);
  const arrowLook = useUiLook((s) => s.frecce);
  return useMemo(() => {
    const owners = new Map<string, string>();
    const armies = new Map<string, number>();
    for (const [id, t] of Object.entries(view.territories)) {
      owners.set(id, colorOf(t.owner));
      armies.set(id, t.armies);
    }
    const pending = new Map<string, number>(Object.entries(draft.placements));
    // piazzamento alla cieca già confermato: le mie armate coperte le vedo solo io
    for (const [id, n] of Object.entries(view.players.find((p) => p.id === me)?.pending ?? {})) pending.set(id, (pending.get(id) ?? 0) + n);
    const flashes = new Map<string, number>();
    for (const e of fresh?.events ?? []) {
      if (e.event.type === 'battle') {
        flashes.set(e.event.to, fresh!.at);
        if (e.event.attackerLosses > 0) flashes.set(e.event.from, fresh!.at);
      }
    }
    if (spot) flashes.set(spot.territory, spot.at);
    const rules = lobby.rules;
    const n = board.geo.neighbours;
    const mine = me ? owned(view, me) : [];
    const sel = draft.selected ? view.territories[draft.selected] : null;
    const selMine = sel?.owner === me && (sel?.armies ?? 0) >= 2;
    let arrows: BoardState['arrows'] = null;
    let active: Set<string> | null = null;
    let selected = draft.selected;
    let target = draft.target;
    if (move.kind === 'attack') {
      if (selMine) arrows = { to: attackTargets(view, rules, n, draft.selected!).filter((t) => !t.protectedBy).map((t) => t.id), kind: 'attack' };
      else active = new Set(mine.filter((id) => maxDice(rules, view.territories[id]!.armies) > 0 && (n.get(id) ?? []).some((x) => view.territories[x]!.owner !== me)));
    } else if (move.kind === 'fortify') {
      if (selMine) arrows = { to: moveTargets(view, rules, n, draft.selected!), kind: 'move' };
      else active = new Set(mine.filter((id) => view.territories[id]!.armies >= 2 && moveTargets(view, rules, n, id).length > 0));
    } else if (move.kind === 'place') {
      active = new Set(mine);
    } else if (move.kind === 'pick') {
      active = new Set(freeTerritories(view, board.def.territories));
    } else if (move.kind === 'occupy') {
      selected = move.from;
      target = move.to;
      arrows = { to: [move.to], kind: 'move' };
    }
    const hidden = fighting ? new Set(fighting.split('|')) : null;
    return { owners, armies, hover, selected, target, arrows, active, pending, flashes, hidden, arrowLook };
  }, [view, board, me, move, lobby, colorOf, draft, hover, fresh, fighting, spot, arrowLook]);
}

/** Eventi importanti appena successi, in basso a destra per qualche secondo. */
function EventToasts() {
  const { view, territory, me } = useGame();
  const fresh = useSession((s) => s.fresh);
  const [items, setItems] = useState<{ seq: number; text: string; until: number }[]>([]);
  const seen = useRef<typeof fresh>(null);
  const names = useMemo(() => namesFor(view, territory), [view, territory]);
  useEffect(() => {
    if (!fresh || fresh === seen.current) return;
    seen.current = fresh;
    const until = Date.now() + 6000;
    const add = fresh.events
      .filter((e) => isHighlight(e.event) || e.event.type === 'turn')
      .map((e) => ({ seq: e.seq, text: describeEvent(e.event, names, me), until }));
    if (add.length > 0) setItems((cur) => [...cur, ...add].slice(-4));
  }, [fresh, names, me]);
  useEffect(() => {
    if (items.length === 0) return;
    const id = setInterval(() => setItems((cur) => (cur.some((x) => x.until <= Date.now()) ? cur.filter((x) => x.until > Date.now()) : cur)), 500);
    return () => clearInterval(id);
  }, [items]);
  return (
    <ol className="event-toasts" aria-live="polite">
      {items.map((x) => (
        <li key={x.seq}>{x.text}</li>
      ))}
    </ol>
  );
}

/** Il tabellone, a parte: spostare la vista o passare col mouse sui territori non ridisegna i pannelli. */
function Board({ onPainter, insets }: { onPainter: (p: BoardPainter | null) => void; insets: Insets }) {
  const board = useSession((s) => s.board)!;
  const style = useLook((s) => s.style);
  const state = useBoardState();
  const onClick = useCallback((id: string | null, how: { shift: boolean; right: boolean }) => useSession.getState().clickTerritory(id, how), []);
  const onHover = useCallback((id: string | null) => useSession.getState().setHover(id), []);
  return <BoardCanvas geo={board.geo} style={style} state={state} insets={insets} onClick={onClick} onHover={onHover} painterRef={onPainter} />;
}

interface Props {
  /** In più nella barra in alto (pagina di prova). */
  topbarExtra?: ReactNode;
  /** In più sopra il tabellone (pagina di prova). */
  extra?: ReactNode;
}

export function GameScreen({ topbarExtra, extra }: Props = {}) {
  const game = useGame();
  const { view, lobby, me, move } = game;
  const online = useSession((s) => s.online);
  const fresh = useSession((s) => s.fresh);
  const notice = useSession((s) => s.notice);
  const [painter, setPainter] = useState<BoardPainter | null>(null);
  const [overlay, setOverlay] = useState<'guide' | 'report' | null>(null);
  const [overClosed, setOverClosed] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const ui = useUiLook();
  // proposte dei cassetti: colonna a destra (con la scheda aperta), pannello dal basso, mano aperta
  const [column, setColumn] = useState<ColumnTab | null>(null);
  const [sheet, setSheet] = useState<'log' | 'chat' | null>(null);
  const [table, setTable] = useState(false);
  const insets = useMemo<Insets>(() => (ui.cassetti === 'colonna' && column ? { ...INSETS, right: COLUMN } : INSETS), [ui.cassetti, column]);

  const mine = isMyMove(move);
  useGameSounds({ me, fresh, deadline: online.deadline, paused: Boolean(online.paused), myMove: mine, chat: online.chat });

  // gli avvisi si chiudono da soli
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useSession.getState().setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  // titolo della scheda: avvisa se tocca a te
  useEffect(() => {
    document.title = `${mine ? '● Tocca a te · ' : ''}OnPeace`;
    return () => {
      document.title = 'OnPeace';
    };
  }, [mine]);

  // le battaglie: la scena le riceve dalla partita e ne fa anche i suoni (a tempo coi dadi e coi colpi)
  useEffect(() => {
    setBattleSoundsByScene(true);
    const off = connectBattleFeed();
    return () => {
      off();
      setBattleSoundsByScene(false);
    };
  }, []);

  // le carte pescate passano dalla loro scena prima di arrivare tra le carte
  useEffect(() => connectDrawFeed(), []);

  // in sviluppo, per le prove automatiche: il tabellone e la sessione raggiungibili dalla console
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __tabellone: painter, __sessione: useSession });
  }, [painter]);

  // tasti
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select') || overlay) return;
      const s = useSession.getState();
      if (e.key === 'Escape') {
        // nei rinforzi il territorio scelto è solo l'ultimo cliccato: Esc toglie le armate non ancora confermate
        if (move.kind === 'place') s.resetPlacements();
        s.patchDraft({ selected: null, target: null, blitz: false });
      }
      else if (e.key === '0') painter?.resetView();
      else if (e.key === 'Enter') {
        if (move.kind === 'briefing') s.ready();
        else if (move.kind === 'place') s.confirmPlacement();
        else if (move.kind === 'attack' && s.draft.target) s.attack();
        else if (move.kind === 'occupy') s.occupy(Math.min(move.max, Math.max(move.min, s.draft.occupy ?? move.max)));
        else if (move.kind === 'fortify' && s.draft.target) s.fortify();
        else return;
      } else if (/^[1-5]$/.test(e.key) && move.kind === 'attack') s.patchDraft({ dice: Number(e.key) });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, painter, overlay]);

  const over = view.phase === 'over' || lobby.phase === 'ended';
  // le carte ancora in scena si contano quando arrivano
  const inScene = useDraw((s) => [...cardsInScene(s)].join('|'));
  const landed = useDraw((s) => s.landed);
  const mineView = view.players.find((p) => p.id === me);
  const waiting = inScene ? (mineView?.cards ?? []).filter((c) => inScene.split('|').includes(c.id)).length : 0;
  const cardCount = (mineView?.cardCount ?? 0) - waiting;

  const pills = (
    <div className="corner-tools">
      {ui.cassetti !== 'mano' && (
        <button
          type="button"
          className="pill panel"
          data-hand-pill
          aria-expanded={ui.cassetti === 'colonna' ? column === 'carte' : ui.cassetti === 'basso' ? sheet !== null : cardsOpen}
          onClick={() => {
            if (ui.cassetti === 'colonna') setColumn((c) => (c === 'carte' ? null : 'carte'));
            else if (ui.cassetti === 'basso') setSheet((o) => (o ? null : 'log'));
            else setCardsOpen((o) => !o);
          }}
        >
          Carte e obiettivo{' '}
          <span key={landed} className={`count${landed ? ' bump' : ''}`}>
            {cardCount}
          </span>
        </button>
      )}
      <button
        type="button"
        className="pill panel"
        aria-expanded={ui.cassetti === 'colonna' ? column === 'registro' || column === 'chat' : ui.cassetti === 'basso' ? sheet !== null : chatOpen}
        onClick={() => {
          if (ui.cassetti === 'colonna') setColumn((c) => (c === 'registro' || c === 'chat' ? null : online.unread > 0 ? 'chat' : 'registro'));
          else if (ui.cassetti === 'basso') setSheet((o) => (o ? null : online.unread > 0 ? 'chat' : 'log'));
          else setChatOpen((o) => !o);
        }}
      >
        Registro e chat {online.unread > 0 && <span className="count">{online.unread}</span>}
      </button>
    </div>
  );
  // con il registro aperto gli avvisi in un angolo non servono
  const logOpen = ui.cassetti === 'colonna' ? column === 'registro' : ui.cassetti === 'basso' ? sheet !== null : chatOpen;

  return (
    <div className={`game ui-fasi-${ui.fasi} ui-cassetti-${ui.cassetti}${ui.cassetti === 'colonna' && column ? ' has-column' : ''}`}>
      <Board onPainter={setPainter} insets={insets} />
      <TopBar onGuide={() => setOverlay('guide')} onReport={() => setOverlay('report')}>
        {topbarExtra}
      </TopBar>

      {ui.fasi !== 'giro' && (
        <div className="corner-players panel">
          <PlayersPanel />
        </div>
      )}
      <BattleLayer painter={painter} />
      <DrawLayer />
      {extra}
      {move.kind !== 'briefing' && <CommandBar />}
      {pills}
      {ui.cassetti === 'mano' && <HandFan open={table} onOpen={() => setTable((o) => !o)} />}
      {ui.cassetti === 'ora' && cardsOpen && (
        <div className="drawer drawer-left panel">
          <HandPanel />
        </div>
      )}
      {(ui.cassetti === 'ora' || ui.cassetti === 'mano') && chatOpen && (
        <div className="drawer drawer-right panel">
          <BattlePanel />
          <LogChat />
        </div>
      )}
      {ui.cassetti === 'colonna' && column && <SideColumn tab={column} onTab={setColumn} onClose={() => setColumn(null)} />}
      {ui.cassetti === 'basso' && sheet && <BottomSheet initial={sheet} onClose={() => setSheet(null)} />}
      {ui.cassetti === 'mano' && table && <HandTable onClose={() => setTable(false)} />}
      {!logOpen && ui.avvisi === 'ora' && <EventToasts />}
      {!logOpen && ui.avvisi === 'notizie' && <NewsToasts />}
      {ui.avvisi === 'mappa' && <MapCallouts painter={painter} />}
      <TurnAnnounce />

      <TerritoryInfo />

      {notice && (
        <div className="toast" role="status" onClick={() => useSession.getState().setNotice(null)}>
          {notice}
        </div>
      )}
      {online.paused && !over && (
        <div className="banner" role="status">
          {online.paused.reason === 'host' ? (
            <>
              <b>Tempo fermato dall'host.</b> Si può giocare lo stesso.
            </>
          ) : (
            <>
              <b>Il server non riesce ad andare avanti.</b> L'errore è registrato: l'host può riprovare.
            </>
          )}
        </div>
      )}
      {move.kind === 'briefing' && <ObjectiveCard />}
      {over && !overClosed && <GameOver onClose={() => setOverClosed(true)} />}
      {overlay === 'guide' && <GuideModal rules={lobby.rules} onClose={() => setOverlay(null)} />}
      {overlay === 'report' && <ReportModal onClose={() => setOverlay(null)} />}
    </div>
  );
}
