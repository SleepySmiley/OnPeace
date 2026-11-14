/**
 * Proposte per l'interfaccia della partita, da provare nella pagina interfaccia.html (le scelte
 * stanno in uilook.ts): fasi del turno nella barra in alto, annuncio di quando tocca a te, avvisi
 * di quello che succede, cassetti di carte e registro. Quando si sceglie, resta solo la scelta.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameEvent } from '@onpeace/conquista';
import type { BoardPainter } from '../board/painter';
import { useSession } from '../store';
import { ChatPanel } from '../ui/ChatPanel';
import { Countdown } from '../ui/Countdown';
import { Chip, SymbolIcon } from './bits';
import { PHASES } from './describe';
import { cardsInScene, useDraw } from './draw';
import { actingPlayer, isMyMove, roundOf, totals } from './logic';
import { BattlePanel, HandPanel, LogPanel } from './panels';
import { useUiLook, type Fasi } from './uilook';
import { useGame } from './useGame';
import './proposte.css';

// ---------------------------------------------------------------- fasi

const PRE = ['briefing', 'draft', 'setup'];
const TURN = ['reinforce', 'attack', 'fortify'];

/** Le tre fasi del momento (preparazione o turno), ognuna fatta, in corso o da fare. */
export function usePhaseSteps() {
  const { view } = useGame();
  const ids = PRE.includes(view.phase) ? PRE : TURN;
  const at = ids.indexOf(view.phase);
  return PHASES.filter((p) => ids.includes(p.id)).map((p, i) => ({ id: p.id, label: p.label, state: i < at ? 'done' : i === at ? 'on' : 'next' }));
}

const phaseLabel = (id: string) => PHASES.find((p) => p.id === id)?.label ?? '';

/** Percorso numerato: ✓ fatte, la fase in corso piena nel colore di chi gioca, le altre vuote. */
export function PhasePath({ color, compact = false }: { color: string; compact?: boolean }) {
  const steps = usePhaseSteps();
  return (
    <ol className={`phase-path${compact ? ' compact' : ''}`} aria-label="Fasi" style={{ ['--pc' as string]: color }}>
      {steps.map((s, i) => (
        <li key={s.id} className={s.state} aria-current={s.state === 'on' ? 'step' : undefined}>
          <i aria-hidden>{s.state === 'done' ? '✓' : i + 1}</i>
          <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Chi deve muoversi: "Tocca a te", il nome di chi gioca, o tutti insieme. */
function Whose() {
  const { view, move, colorOf, playerName } = useGame();
  const acting = actingPlayer(view);
  if (isMyMove(move)) return <b className="tb-mine">Tocca a te</b>;
  if (acting)
    return (
      <span className="tb-whose">
        <Chip color={colorOf(acting)} /> <b>{playerName(acting)}</b>
      </span>
    );
  return <span className="tb-whose dim">{view.phase === 'briefing' ? 'Tutti leggono l’obiettivo' : 'Tutti piazzano'}</span>;
}

/** Il centro della barra in alto, nelle proposte diverse da "ora". */
export function TopCenter({ fasi }: { fasi: Exclude<Fasi, 'ora'> }) {
  const { view, lobby, me, colorOf } = useGame();
  const online = useSession((s) => s.online);
  const over = view.phase === 'over' || lobby.phase === 'ended';
  const acting = actingPlayer(view);
  const color = acting ? colorOf(acting) : me ? colorOf(me) : '#888';
  const clock = !over && <Countdown deadline={online.deadline} paused={online.paused} {...(online.total ? { total: online.total } : {})} />;
  if (over) return <div className="tb-center" />;
  if (fasi === 'percorso') {
    return (
      <div className="tb-center tb-path">
        <Whose />
        <PhasePath color={color} />
        {clock}
      </div>
    );
  }
  if (fasi === 'sotto') {
    return (
      <div className="tb-center tb-simple">
        <Whose />
        {clock}
      </div>
    );
  }
  // giro: i giocatori nella barra, chi gioca allargato con la fase e il tempo
  const players = view.order.map((id) => view.players.find((p) => p.id === id)!);
  const seats = new Map(lobby.players.map((p) => [p.id, p]));
  const steps = PRE.includes(view.phase) ? PRE : TURN;
  return (
    <div className="tb-center tb-ring">
      {!acting && <span className="tb-all dim">{view.phase === 'briefing' ? 'Tutti leggono l’obiettivo' : 'Tutti piazzano'}</span>}
      <ol className="tb-players" aria-label="Giocatori in ordine di turno">
        {players.map((p) => {
          const on = p.id === acting;
          const seat = seats.get(p.id);
          const status = !p.alive ? 'eliminato' : seat?.left ? 'uscito' : !seat?.connected ? 'non collegato' : null;
          const t = totals(view, p);
          return (
            <li
              key={p.id}
              className={`tb-p${on ? ' on' : ''}${!p.alive ? ' dead' : ''}${seat?.left ? ' gone' : ''}${p.id === me ? ' me' : ''}`}
              style={{ ['--pc' as string]: colorOf(p.id) }}
              title={`${p.name}${status ? ` (${status})` : ''}: ${t.territories} territori, ${p.cardCount} carte`}
            >
              <Chip color={colorOf(p.id)} />
              <span className="tb-p-name">{on && p.id === me ? 'Tocca a te' : p.id === me ? 'Tu' : p.name}</span>
              <span className="num tb-p-terr">{t.territories}</span>
              {on && (
                <>
                  <span className="tb-p-phase">
                    {phaseLabel(view.phase)}
                    <span className="tb-dots" aria-hidden>
                      {steps.map((s, i) => (
                        <i key={s} className={i < steps.indexOf(view.phase) ? 'done' : s === view.phase ? 'on' : ''} />
                      ))}
                    </span>
                  </span>
                  {clock}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Proposta "sotto": le fasi come linguetta sopra la barra dei comandi. */
export function CommandSteps() {
  const { view, colorOf } = useGame();
  const acting = actingPlayer(view);
  if (view.phase === 'over') return null;
  return (
    <div className="cb-steps">
      <PhasePath color={acting ? colorOf(acting) : '#888'} compact />
    </div>
  );
}

// ---------------------------------------------------------------- annuncio del turno

interface Shout {
  key: number;
  kind: 'big' | 'mid' | 'small';
  title: string;
  sub?: string;
  color: string;
}

/** Quando tocca a te: fascia al centro che passa, cornice dello schermo nel tuo colore, o entrambe. */
export function TurnAnnounce() {
  const annuncio = useUiLook((s) => s.annuncio);
  const { view, me, move, colorOf, playerName } = useGame();
  const [shout, setShout] = useState<Shout | null>(null);
  const prev = useRef<{ phase: string; turn: number | null } | null>(null);
  const band = annuncio === 'fascia' || annuncio === 'entrambi';
  const frame = annuncio === 'cornice' || annuncio === 'entrambi';

  useEffect(() => {
    const cur = { phase: view.phase, turn: view.turn?.number ?? null };
    const was = prev.current;
    prev.current = cur;
    if (!was) return;
    const turn = view.turn;
    const mineTurn = turn?.player === me;
    let next: Omit<Shout, 'key'> | null = null;
    if (turn && cur.turn !== was.turn) {
      next = mineTurn
        ? { kind: 'big', title: 'Tocca a te', sub: `Rinforzi · ${turn.reinforcements} ${turn.reinforcements === 1 ? 'armata' : 'armate'} da mettere`, color: colorOf(turn.player) }
        : { kind: 'small', title: `Tocca a ${playerName(turn.player)}`, color: colorOf(turn.player) };
    } else if (cur.phase !== was.phase) {
      const color = me ? colorOf(me) : '#888';
      if (mineTurn && cur.phase === 'attack') next = { kind: 'mid', title: 'Attacco', sub: 'Scegli da dove attaccare, o passa', color };
      else if (mineTurn && cur.phase === 'fortify') next = { kind: 'mid', title: 'Spostamento', sub: 'Sposta armate, se vuoi, poi chiudi il turno', color };
      else if (cur.phase === 'draft') next = { kind: 'mid', title: 'Scelta dei territori', sub: 'A turno, un territorio libero a testa', color };
      else if (cur.phase === 'setup') next = { kind: 'mid', title: 'Piazzamento', sub: 'Metti le armate iniziali sui tuoi territori', color };
    }
    if (next) setShout({ ...next, key: performance.now() });
  }, [view.phase, view.turn, me, colorOf, playerName]);

  // dalla pagina di prova: l'annuncio di inizio turno, subito
  const demo = useUiLook((s) => s.demo);
  useEffect(() => {
    if (demo === 0) return;
    const r = view.turn?.reinforcements ?? 3;
    setShout({ key: performance.now(), kind: 'big', title: 'Tocca a te', sub: `Rinforzi · ${r} armate da mettere`, color: me ? colorOf(me) : '#888' });
  }, [demo]);

  useEffect(() => {
    if (!shout) return;
    const id = setTimeout(() => setShout(null), shout.kind === 'big' ? 2300 : shout.kind === 'mid' ? 1700 : 1500);
    return () => clearTimeout(id);
  }, [shout]);

  const myColor = me ? colorOf(me) : '#888';
  const framed = frame && isMyMove(move) && move.kind !== 'briefing';
  return (
    <>
      {framed && <div className="my-frame" style={{ ['--pc' as string]: myColor }} aria-hidden />}
      {band && shout && (
        <div key={shout.key} className={`announce announce-${shout.kind}`} style={{ ['--pc' as string]: shout.color }} role="status">
          <b>{shout.title}</b>
          {shout.sub && <span>{shout.sub}</span>}
        </div>
      )}
      {frame && !band && shout && shout.kind !== 'small' && (
        <div key={shout.key} className="announce-tag" style={{ ['--pc' as string]: shout.color }} role="status">
          <b>{shout.title}</b>
          {shout.sub && <span>{shout.sub}</span>}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- avvisi

type Icon = 'flag' | 'swords' | 'skull' | 'cards' | 'crown' | 'turn' | 'eye';

function NewsIcon({ icon }: { icon: Icon }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (icon) {
    case 'flag':
      return (
        <svg {...p}>
          <path d="M6 21V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 4.5h10.5l-2.6 3.8 2.6 3.8H7z" fill="currentColor" />
        </svg>
      );
    case 'swords':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 4l11 11M15 15l-2 3M15 15l3-2M17 17l3 3" />
          <path d="M20 4L9 15M9 15l2 3M9 15l-3-2M7 17l-3 3" />
        </svg>
      );
    case 'skull':
      return (
        <svg {...p}>
          <path d="M12 3a8 8 0 0 0-5 14.2V20h3v-2h4v2h3v-2.8A8 8 0 0 0 12 3z" fill="currentColor" />
          <circle cx="9" cy="11.5" r="1.8" fill="var(--panel-solid)" />
          <circle cx="15" cy="11.5" r="1.8" fill="var(--panel-solid)" />
        </svg>
      );
    case 'cards':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <rect x="3.5" y="6" width="10" height="14" rx="1.6" transform="rotate(-10 8.5 13)" />
          <rect x="10" y="4" width="10" height="14" rx="1.6" transform="rotate(8 15 11)" fill="currentColor" fillOpacity="0.25" />
        </svg>
      );
    case 'crown':
      return (
        <svg {...p}>
          <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="currentColor" />
        </svg>
      );
    case 'turn':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12a8 8 0 1 1-2.4-5.7" />
          <path d="M20 4v4.5h-4.5" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.8" fill="currentColor" />
        </svg>
      );
  }
}

interface News {
  seq: number;
  icon: Icon;
  color: string;
  head: ReactNode;
  sub?: string;
  tone?: 'bad' | 'good';
  until: number;
}

type Names = { me: string | null; colorOf(id: string): string; playerName(id: string): string; territory(id: string): string };

/** Un evento come notizia (null: resta solo nel registro). `only`: solo questi tipi. */
function toNews(e: GameEvent, seq: number, n: Names, until: number, opts: { mapToo: boolean }): News | null {
  const who = (id: string) => (id === n.me ? 'Tu' : n.playerName(id));
  const chip = (id: string) => <Chip color={n.colorOf(id)} />;
  switch (e.type) {
    case 'battle': {
      // le mie battaglie le racconta già la scena
      if (e.player === n.me) return null;
      const losses = [e.attackerLosses > 0 ? `${who(e.player)} −${e.attackerLosses}` : null, e.defenderLosses > 0 ? `${who(e.defender)} −${e.defenderLosses}` : null].filter(Boolean).join(' · ');
      if (e.conquered) {
        if (opts.mapToo) return null;
        const mine = e.defender === n.me;
        return {
          seq,
          until,
          icon: 'flag',
          color: n.colorOf(e.player),
          tone: mine ? 'bad' : undefined,
          head: (
            <>
              {chip(e.player)} <b>{n.playerName(e.player)}</b> {mine ? 'ti prende' : 'conquista'} <b>{n.territory(e.to)}</b>
            </>
          ),
          sub: `da ${n.territory(e.from)} · ${losses}`,
        };
      }
      if (e.defender !== n.me || opts.mapToo) return null;
      return {
        seq,
        until,
        icon: 'swords',
        color: n.colorOf(e.player),
        head: (
          <>
            {chip(e.player)} <b>{n.playerName(e.player)}</b> ti attacca in <b>{n.territory(e.to)}</b>
          </>
        ),
        sub: losses || 'nessuna perdita',
      };
    }
    case 'eliminated':
      return {
        seq,
        until,
        icon: 'skull',
        color: n.colorOf(e.by),
        tone: e.player === n.me ? 'bad' : e.by === n.me ? 'good' : undefined,
        head: (
          <>
            {chip(e.by)} <b>{who(e.by)}</b> {e.by === n.me ? 'elimini' : 'elimina'} <b>{e.player === n.me ? 'te' : n.playerName(e.player)}</b>
          </>
        ),
        sub: e.cardsTaken > 0 ? `${e.by === n.me ? 'prendi' : 'prende'} ${e.cardsTaken} carte` : undefined,
      };
    case 'set':
      return {
        seq,
        until,
        icon: 'cards',
        color: n.colorOf(e.player),
        head: (
          <>
            {chip(e.player)} <b>{who(e.player)}</b> {e.player === n.me ? 'giochi' : 'gioca'} un tris: <b>+{e.armies}</b>
          </>
        ),
        sub: e.cards.map((c) => (c.symbol === 'joker' ? 'jolly' : c.territory ? n.territory(c.territory) : '')).join(', '),
      };
    case 'victory':
      return {
        seq,
        until: until + 6000,
        icon: 'crown',
        color: n.colorOf(e.player),
        tone: e.player === n.me ? 'good' : undefined,
        head: (
          <>
            {chip(e.player)} <b>{e.player === n.me ? 'Hai vinto' : `Vince ${n.playerName(e.player)}`}</b>
          </>
        ),
      };
    case 'setup-reveal':
      return { seq, until, icon: 'eye', color: '#888', head: <b>Si scoprono le armate di tutti</b>, sub: 'comincia la partita' };
    case 'turn':
      if (e.player === n.me || opts.mapToo) return null;
      return {
        seq,
        until: until - 2500,
        icon: 'turn',
        color: n.colorOf(e.player),
        head: (
          <>
            Turno di {chip(e.player)} <b>{n.playerName(e.player)}</b>
          </>
        ),
        sub: `+${e.reinforcements} armate`,
      };
    default:
      return null;
  }
}

/** Avvisi "notizie": in basso a destra, col segno e i colori, solo quello che conta. */
export function NewsToasts({ mapToo = false }: { mapToo?: boolean }) {
  const { me, colorOf, playerName, territory } = useGame();
  const fresh = useSession((s) => s.fresh);
  const seen = useRef<typeof fresh>(null);
  const [items, setItems] = useState<News[]>([]);
  useEffect(() => {
    if (!fresh || fresh === seen.current) return;
    seen.current = fresh;
    const until = Date.now() + 6500;
    const names = { me, colorOf, playerName, territory };
    const add = fresh.events.map((e) => toNews(e.event, e.seq, names, until, { mapToo })).filter((x): x is News => x !== null);
    if (add.length > 0) setItems((cur) => [...cur, ...add].slice(-4));
  }, [fresh, me, colorOf, playerName, territory, mapToo]);
  useEffect(() => {
    if (items.length === 0) return;
    const id = setInterval(() => setItems((cur) => (cur.some((x) => x.until <= Date.now()) ? cur.filter((x) => x.until > Date.now()) : cur)), 400);
    return () => clearInterval(id);
  }, [items]);
  return (
    <ol className="news" aria-live="polite">
      {items.map((x) => (
        <li key={x.seq} className={x.tone ?? ''} style={{ ['--nc' as string]: x.color }}>
          <span className="news-icon">
            <NewsIcon icon={x.icon} />
          </span>
          <span className="news-text">
            <span className="news-head">{x.head}</span>
            {x.sub && <span className="news-sub">{x.sub}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

interface Callout {
  key: string;
  territory: string;
  text: string;
  kind: 'loss' | 'gain' | 'conquest';
  color: string;
  /** Ritardo (ms) perché le scritte dello stesso evento non escano tutte insieme. */
  delay: number;
}

const CALLOUT_MS = 2600;

/** Avvisi "sulla mappa": le perdite, i rinforzi e le conquiste degli altri escono dal territorio e svaniscono. */
export function MapCallouts({ painter }: { painter: BoardPainter | null }) {
  const { me, colorOf, playerName } = useGame();
  const fresh = useSession((s) => s.fresh);
  const seen = useRef<typeof fresh>(null);
  const [items, setItems] = useState<Callout[]>([]);
  const refs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!fresh || fresh === seen.current) return;
    seen.current = fresh;
    const add: Callout[] = [];
    for (const { seq, event: e } of fresh.events) {
      const k = (s: string) => `${seq}-${s}`;
      if (e.type === 'battle' && e.player !== me) {
        if (e.attackerLosses > 0) add.push({ key: k('a'), territory: e.from, text: `−${e.attackerLosses}`, kind: 'loss', color: colorOf(e.player), delay: 0 });
        if (e.conquered) add.push({ key: k('c'), territory: e.to, text: e.defender === me ? `${playerName(e.player)} ti prende` : `${playerName(e.player)} conquista`, kind: 'conquest', color: colorOf(e.player), delay: 120 });
        else if (e.defenderLosses > 0) add.push({ key: k('d'), territory: e.to, text: `−${e.defenderLosses}`, kind: 'loss', color: colorOf(e.defender), delay: 120 });
      } else if ((e.type === 'reinforce' || (e.type === 'setup-place' && !e.hidden)) && e.player !== me) {
        let i = 0;
        for (const [t, n] of Object.entries(e.placements)) add.push({ key: k(t), territory: t, text: `+${n}`, kind: 'gain', color: colorOf(e.player), delay: i++ * 90 });
      } else if (e.type === 'fortify' && e.player !== me) {
        add.push({ key: k('f'), territory: e.from, text: `−${e.armies}`, kind: 'loss', color: colorOf(e.player), delay: 0 });
        add.push({ key: k('t'), territory: e.to, text: `+${e.armies}`, kind: 'gain', color: colorOf(e.player), delay: 160 });
      }
    }
    if (add.length === 0) return;
    setItems((cur) => [...cur, ...add].slice(-24));
    const keys = new Set(add.map((x) => x.key));
    const id = setTimeout(() => setItems((cur) => cur.filter((x) => !keys.has(x.key))), CALLOUT_MS + 500);
    return () => clearTimeout(id);
  }, [fresh, me, colorOf, playerName]);

  // seguono la mappa mentre la si sposta
  useEffect(() => {
    if (!painter || items.length === 0) return;
    let raf = 0;
    const place = () => {
      for (const it of items) {
        const el = refs.current.get(it.key);
        const p = painter.territoryOnScreen(it.territory);
        if (el && p) el.style.transform = `translate(${p[0]}px, ${p[1]}px)`;
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [painter, items]);

  return (
    <>
      <div className="callouts" aria-hidden>
        {items.map((it) => (
          <div
            key={it.key}
            ref={(el) => {
              if (el) refs.current.set(it.key, el);
              else refs.current.delete(it.key);
            }}
            className="callout-at"
          >
            <span className={`callout ${it.kind}`} style={{ ['--cc' as string]: it.color, animationDelay: `${it.delay}ms`, animationDuration: `${CALLOUT_MS}ms` } as CSSProperties}>
              {it.text}
            </span>
          </div>
        ))}
      </div>
      {/* quello che non ha un posto sulla mappa (tris, eliminazioni, vittoria) resta in un angolo */}
      <NewsToasts mapToo />
    </>
  );
}

// ---------------------------------------------------------------- cassetti

export type ColumnTab = 'carte' | 'registro' | 'chat';

/** Proposta "colonna": un pannello a destra, alto quanto lo schermo; la mappa si sposta per fargli posto. */
export function SideColumn({ tab, onTab, onClose }: { tab: ColumnTab; onTab: (t: ColumnTab) => void; onClose: () => void }) {
  const unread = useSession((s) => s.online.unread);
  const tabs: { id: ColumnTab; label: ReactNode }[] = [
    { id: 'carte', label: 'Carte e obiettivo' },
    { id: 'registro', label: 'Registro' },
    {
      id: 'chat',
      label: (
        <>
          Chat {unread > 0 && tab !== 'chat' && <span className="count">{unread}</span>}
        </>
      ),
    },
  ];
  return (
    <aside className="side-column panel" aria-label="Carte, obiettivo, registro e chat">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
        <button type="button" className="sc-close" aria-label="Chiudi" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="sc-body">
        {tab === 'carte' && <HandPanel />}
        {tab === 'registro' && (
          <>
            <BattlePanel />
            <LogPanel />
          </>
        )}
        {tab === 'chat' && <ChatPanel />}
      </div>
    </aside>
  );
}

/** Proposta "dal basso": un solo pannello largo sopra la barra dei comandi, con tutto affiancato. */
export function BottomSheet({ onClose, initial }: { onClose: () => void; initial: 'log' | 'chat' }) {
  const [tab, setTab] = useState<'log' | 'chat'>(initial);
  const unread = useSession((s) => s.online.unread);
  useEffect(() => setTab(initial), [initial]);
  return (
    <section className="sheet panel" aria-label="Carte, obiettivo, registro e chat">
      <button type="button" className="sc-close sheet-close" aria-label="Chiudi" onClick={onClose}>
        ×
      </button>
      <div className="sheet-hand">
        <HandPanel />
      </div>
      <div className="sheet-log">
        <BattlePanel />
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>
            Registro
          </button>
          <button type="button" role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>
            Chat {unread > 0 && tab !== 'chat' && <span className="count">{unread}</span>}
          </button>
        </div>
        <div className="tab-body">{tab === 'log' ? <LogPanel /> : <ChatPanel />}</div>
      </div>
    </section>
  );
}

/** Le carte da mostrare: quelle in mano, tranne quelle ancora nella scena della pesca. */
function useHandCards() {
  const { view, me } = useGame();
  const inScene = useDraw((s) => [...cardsInScene(s)].join('|'));
  const mine = view.players.find((p) => p.id === me);
  return useMemo(() => (mine?.cards ?? []).filter((c) => !inScene.split('|').includes(c.id)), [mine, inScene]);
}

/** Proposta "in mano": le carte a ventaglio nell'angolo in basso a sinistra, l'obiettivo per primo. */
export function HandFan({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const { territory } = useGame();
  const cards = useHandCards();
  const landed = useDraw((s) => s.landed);
  const all = [{ id: 'obiettivo' as const }, ...cards];
  const n = all.length;
  return (
    <button type="button" className={`hand-fan${open ? ' open' : ''}`} data-hand-pill aria-expanded={open} onClick={onOpen} title="Le tue carte e il tuo obiettivo">
      <span className="hf-cards">
        {all.map((c, i) => {
          const spread = n === 1 ? 0 : (i - (n - 1) / 2) * Math.min(7, 28 / (n - 1));
          const style = { ['--r' as string]: `${spread}deg`, ['--x' as string]: `${(i - (n - 1) / 2) * Math.min(22, 100 / n)}px`, zIndex: i } as CSSProperties;
          if (c.id === 'obiettivo')
            return (
              <span key="obiettivo" className="hf-card hf-objective" style={style}>
                <b>Obiettivo</b>
                <small>segreto</small>
              </span>
            );
          const card = c as (typeof cards)[number];
          return (
            <span key={card.id} className={`hf-card${card.symbol === 'joker' ? ' joker' : ''}${i === n - 1 && landed ? ' fresh' : ''}`} style={style}>
              <SymbolIcon symbol={card.symbol} size={20} />
              <small>{card.symbol === 'joker' ? 'Jolly' : card.territory ? territory(card.territory) : ''}</small>
            </span>
          );
        })}
      </span>
      <span className="hf-label">
        {cards.length === 0 ? 'Obiettivo' : `Obiettivo e ${cards.length} ${cards.length === 1 ? 'carta' : 'carte'}`}
      </span>
    </button>
  );
}

/** La mano aperta: obiettivo e carte grandi al centro, sopra la mappa scurita. */
export function HandTable({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="hand-table-veil" onClick={onClose}>
      <section className="hand-table panel" aria-label="Le tue carte e il tuo obiettivo" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sc-close" aria-label="Chiudi" onClick={onClose}>
          ×
        </button>
        <HandPanel />
      </section>
    </div>
  );
}

/** Per la proposta "giro": il giro in corso, accanto al marchio. */
export function RoundTag() {
  const { view } = useGame();
  if (!view.turn) return null;
  const { round } = roundOf(view);
  return (
    <span className="status num" title={`Turno ${view.turn.number}, giro ${round}`}>
      Giro <b>{round}</b>
    </span>
  );
}
