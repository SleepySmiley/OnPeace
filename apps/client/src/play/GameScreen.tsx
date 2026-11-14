/**
 * La schermata della partita: il tabellone a tutto schermo e i pannelli, sistemati secondo la
 * disposizione scelta (plancia laterale, comandi in basso, essenziale). Tasti: Esc annulla,
 * Invio conferma, 1-3 dadi, 0 vista d'insieme.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useGameSounds } from '../audio/useGameSounds';
import { BoardCanvas } from '../board/BoardCanvas';
import type { BoardState } from '../board/common';
import type { BoardPainter, Insets } from '../board/painter';
import { useLook, type Layout } from '../look';
import { useSession } from '../store';
import { GuideModal } from '../ui/GuideModal';
import { ReportModal } from '../ui/ReportModal';
import { ActionPanel } from './ActionPanel';
import { describeEvent, isHighlight, namesFor } from './describe';
import { GameOver } from './GameOver';
import { attackTargets, freeTerritories, isMyMove, maxDice, moveTargets, owned } from './logic';
import { ObjectiveCard } from './ObjectiveCard';
import { BattlePanel, HandPanel, LogChat, PlayersPanel, TerritoryInfo } from './panels';
import { TopBar } from './TopBar';
import { useGame } from './useGame';

const INSETS: Record<Layout, Insets> = {
  plancia: { top: 56, right: 384, bottom: 0, left: 0 },
  comandi: { top: 112, right: 0, bottom: 210, left: 0 },
  essenziale: { top: 56, right: 0, bottom: 0, left: 0 },
};

/** Conta gli spostamenti della vista: chi sta attaccato a un territorio sullo schermo si riposiziona. */
const useViewTick = create<{ n: number }>(() => ({ n: 0 }));

/** Il tabellone con lo stato della partita, le scelte in corso e i lampi delle ultime battaglie. */
function useBoardState(): BoardState {
  const { view, board, me, move, lobby, colorOf } = useGame();
  const draft = useSession((s) => s.draft);
  const hover = useSession((s) => s.hover);
  const fresh = useSession((s) => s.fresh);
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
    return { owners, armies, hover, selected, target, arrows, active, pending, flashes };
  }, [view, board, me, move, lobby, colorOf, draft, hover, fresh]);
}

/** Eventi importanti appena successi, in basso a destra per qualche secondo (disposizione essenziale). */
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

/** Pannello della mossa vicino al territorio scelto (disposizione essenziale). */
function AnchoredAction({ painter }: { painter: BoardPainter | null }) {
  const { move } = useGame();
  const tick = useViewTick((s) => s.n);
  const draft = useSession((s) => s.draft);
  const anchorId = move.kind === 'occupy' ? move.to : (draft.target ?? draft.selected);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const p = anchorId && painter ? painter.territoryOnScreen(anchorId) : null;
    const el = box.current;
    if (!p || !el) {
      setPos(null);
      return;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // a destra del territorio se c'è posto, altrimenti a sinistra; sempre dentro lo schermo
    let left = p[0] + 34;
    if (left + w > innerWidth - 12) left = p[0] - 34 - w;
    const top = Math.min(innerHeight - h - 12, Math.max(64, p[1] - h / 2));
    setPos({ left: Math.max(12, left), top });
  }, [anchorId, painter, tick, move, draft]);
  const mine = move.kind !== 'wait' && move.kind !== 'out' && move.kind !== 'over' && move.kind !== 'wait-setup';
  return (
    <div ref={box} className={`anchored${pos ? ' at' : ''}${mine ? '' : ' quiet'}`} style={pos ? { left: pos.left, top: pos.top } : undefined}>
      <ActionPanel floating />
    </div>
  );
}

/** Il tabellone, a parte: spostare la vista o passare col mouse sui territori non ridisegna i pannelli. */
function Board({ insets, onPainter }: { insets: Insets; onPainter: (p: BoardPainter | null) => void }) {
  const board = useSession((s) => s.board)!;
  const style = useLook((s) => s.style);
  const state = useBoardState();
  const frame = useRef(0);
  const onView = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => useViewTick.setState((s) => ({ n: s.n + 1 })));
  }, []);
  const onClick = useCallback((id: string | null, how: { shift: boolean; right: boolean }) => useSession.getState().clickTerritory(id, how), []);
  const onHover = useCallback((id: string | null) => useSession.getState().setHover(id), []);
  return <BoardCanvas geo={board.geo} style={style} state={state} insets={insets} onClick={onClick} onHover={onHover} onView={onView} painterRef={onPainter} />;
}

interface Props {
  /** Disposizione essenziale: il pannello della mossa da usare al posto di quello vicino al territorio. */
  command?: ReactNode;
  /** Spazio coperto dai pannelli, se diverso da quello della disposizione. */
  insets?: Insets;
  /** In più nella barra in alto (pagine di prova). */
  topbarExtra?: ReactNode;
}

export function GameScreen({ command, insets, topbarExtra }: Props = {}) {
  const game = useGame();
  const { view, lobby, me, move } = game;
  const layout = useLook((s) => s.layout);
  const online = useSession((s) => s.online);
  const fresh = useSession((s) => s.fresh);
  const notice = useSession((s) => s.notice);
  const [painter, setPainter] = useState<BoardPainter | null>(null);
  const [overlay, setOverlay] = useState<'guide' | 'report' | null>(null);
  const [overClosed, setOverClosed] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

  // nuovo turno mio: il territorio conquistato o perso di recente resta in vista
  useEffect(() => {
    const battle = fresh?.events.findLast((e) => e.event.type === 'battle');
    if (battle && battle.event.type === 'battle' && battle.event.defender === me) painter?.reveal(battle.event.to);
  }, [fresh, me, painter]);

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
  const cardCount = view.players.find((p) => p.id === me)?.cardCount ?? 0;

  return (
    <div className={`game layout-${layout}`}>
      <Board insets={insets ?? INSETS[layout]} onPainter={setPainter} />
      <TopBar onGuide={() => setOverlay('guide')} onReport={() => setOverlay('report')}>
        {topbarExtra}
      </TopBar>

      {layout === 'plancia' && (
        <aside className="side panel">
          <PlayersPanel />
          <ActionPanel />
          <BattlePanel />
          <HandPanel />
          <LogChat />
        </aside>
      )}

      {layout === 'comandi' && (
        <>
          <div className="players-strip panel">
            <PlayersPanel compact />
          </div>
          <div className="dock">
            <div className="dock-hand panel">
              <HandPanel fan />
            </div>
            <div className="dock-action panel">
              <ActionPanel />
            </div>
            <div className="dock-battle panel">
              <BattlePanel />
              <LogChat />
            </div>
          </div>
        </>
      )}

      {layout === 'essenziale' && (
        <>
          <div className="corner-players panel">
            <PlayersPanel compact />
          </div>
          {move.kind !== 'briefing' && (command ?? <AnchoredAction painter={painter} />)}
          <div className="corner-tools">
            <button type="button" className="pill panel" aria-expanded={cardsOpen} onClick={() => setCardsOpen((o) => !o)}>
              Carte e obiettivo <span className="count">{cardCount}</span>
            </button>
            <button type="button" className="pill panel" aria-expanded={chatOpen} onClick={() => setChatOpen((o) => !o)}>
              Registro e chat {online.unread > 0 && <span className="count">{online.unread}</span>}
            </button>
          </div>
          {cardsOpen && (
            <div className="drawer drawer-left panel">
              <HandPanel />
            </div>
          )}
          {chatOpen && (
            <div className="drawer drawer-right panel">
              <BattlePanel />
              <LogChat />
            </div>
          )}
          {!chatOpen && <EventToasts />}
        </>
      )}

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
