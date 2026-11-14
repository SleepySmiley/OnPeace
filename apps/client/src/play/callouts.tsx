/**
 * Avvisi di quello che fanno gli altri, sulla mappa: perdite, rinforzi, spostamenti e conquiste
 * escono dal territorio dove succedono e svaniscono, seguendo la mappa se la si sposta. Le mie
 * battaglie le racconta già la scena. Quello che non ha un posto sulla mappa (eliminazioni, tris,
 * vittoria, armate scoperte) resta per qualche secondo in basso a destra.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameEvent } from '@onpeace/conquista';
import type { BoardPainter } from '../board/painter';
import { useSession } from '../store';
import { Chip } from './bits';
import { useGame } from './useGame';

interface Callout {
  key: string;
  territory: string;
  text: string;
  kind: 'loss' | 'gain' | 'conquest';
  color: string;
  /** Ritardo (ms) perché le scritte dello stesso evento non escano tutte insieme. */
  delay: number;
}

/** Quanto dura una scritta (ms), come l'animazione in styles.css. */
const CALLOUT_MS = 2600;

/** `news`: anche le notizie in basso a destra (no quando c'è aperto il registro, che le ha già). */
export function MapCallouts({ painter, news }: { painter: BoardPainter | null; news: boolean }) {
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
        if (e.conquered) {
          const text = e.defender === me ? `${playerName(e.player)} ti prende` : `${playerName(e.player)} conquista`;
          add.push({ key: k('c'), territory: e.to, text, kind: 'conquest', color: colorOf(e.player), delay: 120 });
        } else if (e.defenderLosses > 0) add.push({ key: k('d'), territory: e.to, text: `−${e.defenderLosses}`, kind: 'loss', color: colorOf(e.defender), delay: 120 });
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
    // il timer non si annulla al prossimo evento: ogni gruppo di scritte se ne va da solo
    setTimeout(() => setItems((cur) => cur.filter((x) => !keys.has(x.key))), CALLOUT_MS + 500);
  }, [fresh, me, colorOf, playerName]);

  // seguono la mappa mentre la si sposta (senza ridisegnare React a ogni fotogramma)
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
      {news && <News />}
    </>
  );
}

// ---------------------------------------------------------------- notizie senza posto sulla mappa

type Icon = 'skull' | 'cards' | 'crown' | 'eye';

function NewsIcon({ icon }: { icon: Icon }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (icon) {
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
    case 'eye':
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.8" fill="currentColor" />
        </svg>
      );
  }
}

interface Item {
  seq: number;
  icon: Icon;
  color: string;
  head: ReactNode;
  sub?: string;
  tone?: 'bad' | 'good';
  until: number;
}

type Names = { me: string | null; colorOf(id: string): string; playerName(id: string): string; territory(id: string): string };

/** Un evento come notizia; null per quelli che stanno sulla mappa o solo nel registro. */
function toItem(e: GameEvent, seq: number, n: Names, until: number): Item | null {
  const who = (id: string) => (id === n.me ? 'Tu' : n.playerName(id));
  const chip = (id: string) => <Chip color={n.colorOf(id)} />;
  switch (e.type) {
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
      return { seq, until, icon: 'eye', color: '#888888', head: <b>Si scoprono le armate di tutti</b>, sub: 'comincia la partita' };
    default:
      return null;
  }
}

function News() {
  const { me, colorOf, playerName, territory } = useGame();
  const fresh = useSession((s) => s.fresh);
  const seen = useRef<typeof fresh>(null);
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (!fresh || fresh === seen.current) return;
    seen.current = fresh;
    const until = Date.now() + 6500;
    const names = { me, colorOf, playerName, territory };
    const add = fresh.events.map((e) => toItem(e.event, e.seq, names, until)).filter((x): x is Item => x !== null);
    if (add.length > 0) setItems((cur) => [...cur, ...add].slice(-4));
  }, [fresh, me, colorOf, playerName, territory]);
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
