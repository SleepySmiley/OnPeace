/**
 * Scena della pesca (i tempi e le fasi sono in draw.ts): la carta grande col suo retro, il mazzo e
 * i tre modi di farla arrivare. Il punto d'arrivo è il bottone "Carte e obiettivo"
 * (data-hand-pill); nel modo "angolo" il mazzo vive accanto a lui (data-hand-deck).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { Card } from '@onpeace/conquista';
import { shade } from '../board/common';
import { geometryAt, type BoardGeometry } from '../board/geometry';
import { CONTINENT } from '../board/styles/classico';
import { useLook } from '../look';
import { Chip, SymbolIcon } from './bits';
import { SYMBOL_NAME } from './describe';
import { AUTO_MS, FAN, flipMs, flyMs, useDraw, type Drawing } from './draw';
import { skinOf, type Skin } from './objective';
import { useGame } from './useGame';
import './draw.css';

/** Altezza della carta grande (px, larga 220): le altre sono questa in scala. */
const CARD_H = 308;

// ---------------------------------------------------------------- la mappa sulla carta

/** Il territorio della carta coi vicini intorno: si vede dov'è e che forma ha. */
function paintSpot(ctx: CanvasRenderingContext2D, geo: BoardGeometry, id: string, skin: Skin, w: number, h: number, dpr: number) {
  const classic = skin === 'classico';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, classic ? '#bcd7de' : '#151a22');
  sea.addColorStop(1, classic ? '#a1c3ce' : '#0c0f14');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);
  const box = geo.boxes.get(id);
  if (!box) return;
  const [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // finestra: il territorio con un bel margine intorno, mai troppo stretta (le isole piccole)
  const span = Math.max((x1 - x0) * 2.6, (y1 - y0) * 2.6 * (w / h), geo.width * 0.075);
  const fit = w / span;
  const ox = w / 2 - cx * fit;
  const oy = h / 2 - cy * fit;
  const g = geometryAt(geo, fit);
  const px = 1 / fit;
  const half = [span / 2, span / 2 / (w / h)];
  const inView = (b: readonly number[]) => b[2]! >= cx - half[0]! && b[0]! <= cx + half[0]! && b[3]! >= cy - half[1]! && b[1]! <= cy + half[1]!;
  ctx.setTransform(dpr * fit, 0, 0, dpr * fit, dpr * ox, dpr * oy);

  const continent = g.continentOf.get(id) ?? '';
  const land = classic ? '#ebe1c4' : '#2a2e36';
  for (const t of g.board.territories) {
    if (t.id === id || !inView(g.boxes.get(t.id) ?? [0, 0, 0, 0])) continue;
    ctx.fillStyle = land;
    ctx.fill(g.paths.get(t.id)!, 'evenodd');
  }
  ctx.lineWidth = 0.6 * px;
  ctx.strokeStyle = classic ? 'rgba(43, 34, 25, 0.28)' : 'rgba(255, 255, 255, 0.08)';
  for (const b of g.borders) ctx.stroke(b.path);
  ctx.lineWidth = 0.9 * px;
  ctx.strokeStyle = classic ? 'rgba(43, 34, 25, 0.55)' : 'rgba(255, 255, 255, 0.18)';
  ctx.stroke(g.coast);

  // il territorio: pieno, col contorno marcato
  const path = g.paths.get(id)!;
  if (classic) {
    ctx.fillStyle = shade(CONTINENT[continent] ?? '#c98468', -0.12);
    ctx.fill(path, 'evenodd');
    ctx.lineWidth = 1.6 * px;
    ctx.strokeStyle = '#2b2219';
    ctx.stroke(path);
  } else {
    ctx.shadowColor = 'rgba(47, 140, 255, 0.9)';
    ctx.shadowBlur = 12 * dpr;
    ctx.fillStyle = '#2f8cff';
    ctx.fill(path, 'evenodd');
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2 * px;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.stroke(path);
  }
}

function SpotMap({ geo, territory, skin }: { geo: BoardGeometry; territory: string; skin: Skin }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // disegnata al doppio: la carta si ingrandisce nella scena
    const dpr = Math.min(3, (window.devicePixelRatio || 1) * 2);
    const w = 188;
    const h = 112;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d');
    if (ctx) paintSpot(ctx, geo, territory, skin, w, h, dpr);
  }, [geo, territory, skin]);
  return <canvas ref={ref} className="dc-map" aria-hidden />;
}

// ---------------------------------------------------------------- la carta

/** Stemma del retro: una rosa dei venti. */
function Emblem() {
  return (
    <svg className="dc-emblem" viewBox="-50 -50 100 100" aria-hidden>
      <circle r="46" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle r="40.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <path d="M0 -24L5 -5L24 0L5 5L0 24L-5 5L-24 0L-5 -5Z" fill="currentColor" opacity="0.55" transform="rotate(45)" />
      <path d="M0 -36L7 -7L36 0L7 7L0 36L-7 7L-36 0L-7 -7Z" fill="currentColor" />
      <circle r="3.6" className="dc-emblem-dot" />
    </svg>
  );
}

function CardBack() {
  return (
    <div className="dc-face dc-back">
      <div className="dc-back-field">
        <Emblem />
        <span className="dc-brand">OnPeace</span>
      </div>
    </div>
  );
}

interface FaceInfo {
  name: string;
  continent: string;
  owner: { color: string; text: string } | null;
}

function CardFront({ card, info, geo, skin }: { card: Card; info: FaceInfo; geo: BoardGeometry; skin: Skin }) {
  const corner = (end: boolean) => (
    <span className={`dc-corner${end ? ' dc-corner-end' : ''}`}>
      <SymbolIcon symbol={card.symbol} size={17} />
    </span>
  );
  if (card.symbol === 'joker' || !card.territory) {
    return (
      <div className="dc-face dc-front dc-joker">
        {corner(false)}
        <p className="dc-kind">Carta speciale</p>
        <div className="dc-star">
          <SymbolIcon symbol="joker" size={104} />
        </div>
        <p className="dc-name">Jolly</p>
        <p className="dc-sub">Vale come qualsiasi simbolo in un tris</p>
        {corner(true)}
      </div>
    );
  }
  return (
    <div className="dc-face dc-front">
      {corner(false)}
      <p className="dc-kind">{SYMBOL_NAME[card.symbol]}</p>
      <div className="dc-mapwrap">
        <SpotMap geo={geo} territory={card.territory} skin={skin} />
        <span className="dc-medal">
          <SymbolIcon symbol={card.symbol} size={26} />
        </span>
      </div>
      <p className="dc-name">{info.name}</p>
      <p className="dc-sub">{info.continent}</p>
      {info.owner && (
        <p className="dc-owner">
          <Chip color={info.owner.color} /> {info.owner.text}
        </p>
      )}
      {corner(true)}
    </div>
  );
}

/** Nome, continente e padrone del territorio della carta, per il fronte. */
function useFaceInfo(card: Card): FaceInfo {
  const { view, board, me, lobby, colorOf, playerName, territory } = useGame();
  if (!card.territory) return { name: 'Jolly', continent: '', owner: null };
  const def = board.def.territories.find((t) => t.id === card.territory);
  const continent = board.def.continents.find((c) => c.id === def?.continent)?.name ?? '';
  const holder = view.territories[card.territory]?.owner;
  const bonus = lobby.rules.cards.ownedTerritoryBonus;
  const owner = holder
    ? { color: colorOf(holder), text: holder === me ? (bonus > 0 ? `Tuo: +${bonus} nel tris` : 'Tuo') : `Di ${playerName(holder)}` }
    : null;
  return { name: territory(card.territory), continent, owner };
}

/** La carta che si gira: retro e fronte uno dietro l'altro. */
function BigCard({ drawing, className, style, onClick, cardRef }: { drawing: Drawing; className: string; style?: CSSProperties; onClick?: () => void; cardRef?: RefObject<HTMLDivElement | null> }) {
  const { board } = useGame();
  const skin = useLook((s) => skinOf(s.style.id));
  const info = useFaceInfo(drawing.card);
  return (
    <div ref={cardRef} className={`dc ${className}`} style={style} onClick={onClick}>
      <div className="dc-inner">
        <CardBack />
        <CardFront card={drawing.card} info={info} geo={board.geo} skin={skin} />
      </div>
    </div>
  );
}

/** Pila di retri (il mazzo). */
function Deck({ count, className, onClick }: { count: number; className?: string; onClick?: () => void }) {
  return (
    <div className={`dc-deck ${className ?? ''}`} onClick={onClick}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="dc dc-stacked" style={{ ['--k' as string]: i }}>
          <div className="dc-inner">
            <CardBack />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- misure

type Delta = { x: number; y: number; r?: number; s?: number };

const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Da dove a dove vola la carta: dal centro di `slot` al bottone delle carte. */
function useFlyDelta(active: boolean, slot: RefObject<HTMLElement | null>): Delta | null {
  const [d, setD] = useState<Delta | null>(null);
  useLayoutEffect(() => {
    if (!active) return setD(null);
    const pill = document.querySelector<HTMLElement>('[data-hand-pill]');
    if (!pill || !slot.current) return setD({ x: 0, y: 260, s: 0.2 });
    const a = centerOf(slot.current.getBoundingClientRect());
    const b = centerOf(pill.getBoundingClientRect());
    setD({ x: b.x - a.x, y: b.y - a.y, s: (pill.offsetHeight * 1.15) / CARD_H });
  }, [active, slot]);
  return d;
}

/** Classe della carta: "fly" solo quando si sa dove volare (fino ad allora resta ferma, girata). */
const cardStage = (d: Drawing, fly: Delta | null) => (d.stage === 'fly' && !fly ? 'is-reveal' : `is-${d.stage}`);

const flyVars = (d: Delta | null): CSSProperties =>
  d ? ({ '--fx': `${d.x}px`, '--fy': `${d.y}px`, '--fs': d.s ?? 0.12 } as CSSProperties) : {};

/** Barra che si svuota: quando finisce la carta parte da sola. */
function AutoBar({ id }: { id: number }) {
  return (
    <span className="dl-auto" aria-hidden>
      <i key={id} style={{ animationDuration: `${AUTO_MS}ms` }} />
    </span>
  );
}

// ---------------------------------------------------------------- A: al centro

function Centro({ d }: { d: Drawing }) {
  const { view } = useGame();
  const take = useDraw((s) => s.take);
  const skip = useDraw((s) => s.skip);
  const slot = useRef<HTMLDivElement>(null);
  const fly = useFlyDelta(d.stage === 'fly', slot);
  const style = { '--flip': `${flipMs('centro')}ms`, '--fly': `${flyMs('centro')}ms`, ...flyVars(fly) } as CSSProperties;
  return (
    <div className={`draw-layer dl-centro is-${d.stage}`} style={style} onClick={() => (d.stage === 'offer' ? take() : skip())}>
      <div className="dl-veil" />
      <div className="dl-stage">
        <div className="dl-head">
          <p className="dl-eyebrow">Hai conquistato in questo turno</p>
          <h2 className="dl-title">Pesca la tua carta</h2>
        </div>
        <div className="dl-slot" ref={slot}>
          <Deck count={6} className="dl-deck" />
          <BigCard key={d.id} drawing={d} className={`dl-card ${cardStage(d, fly)}`} />
        </div>
        <div className="dl-foot">
          <span>
            Tocca il mazzo <kbd>Invio</kbd>
          </span>
          <AutoBar id={d.id} />
          <span className="dim">{view.deckCount} carte nel mazzo</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- B: ventaglio

/** Posa di ogni carta del ventaglio (i: -2..2). */
function fanPose(i: number) {
  return { x: i * 78, y: Math.abs(i) * Math.abs(i) * 7, r: i * 7 };
}

function Ventaglio({ d }: { d: Drawing }) {
  const take = useDraw((s) => s.take);
  const skip = useDraw((s) => s.skip);
  const slot = useRef<HTMLDivElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState<Delta | null>(null);
  const fly = useFlyDelta(d.stage === 'fly', slot);

  // la carta toccata parte da dov'era nel ventaglio (si misura prima di disegnarla al centro)
  useLayoutEffect(() => {
    if (d.stage !== 'reveal') return;
    const el = fan.current?.querySelector<HTMLElement>(`[data-fan="${d.chosen}"]`);
    if (!el || !slot.current) return setFrom({ x: 0, y: 200, r: 0 });
    const a = centerOf(slot.current.getBoundingClientRect());
    const b = centerOf(el.getBoundingClientRect());
    setFrom({ x: b.x - a.x, y: b.y - a.y, r: fanPose(d.chosen - Math.floor(FAN / 2)).r });
  }, [d.stage, d.chosen, d.id]);

  const style = {
    '--flip': `${flipMs('ventaglio')}ms`,
    '--fly': `${flyMs('ventaglio')}ms`,
    ...(from ? { '--sx': `${from.x}px`, '--sy': `${from.y}px`, '--sr': `${from.r}deg` } : {}),
    ...flyVars(fly),
  } as CSSProperties;
  const showCard = d.stage !== 'offer' && from;
  return (
    <div className={`draw-layer dl-ventaglio is-${d.stage}`} style={style}>
      <div className="dl-shade" />
      <div className="dl-slot" ref={slot} onClick={skip}>
        {showCard && <BigCard key={d.id} drawing={d} className={`dl-card ${cardStage(d, fly)}`} />}
      </div>
      <div className="dl-fan-wrap">
        <div className="dl-head">
          <h2 className="dl-title">Pesca una carta</h2>
          <p className="dl-eyebrow">Scegline una dal ventaglio</p>
          <AutoBar id={d.id} />
        </div>
        <div className="dl-fan" ref={fan}>
          {Array.from({ length: FAN }, (_, k) => {
            const p = fanPose(k - Math.floor(FAN / 2));
            const picked = d.stage !== 'offer' && k === d.chosen;
            return (
              <button
                key={`${d.id}-${k}`}
                type="button"
                data-fan={k}
                className={`dl-fan-card${picked ? ' picked' : ''}`}
                style={{ transform: `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`, ['--k' as string]: k }}
                disabled={d.stage !== 'offer'}
                onClick={() => take(k)}
                aria-label={`Carta ${k + 1}`}
              >
                <span className="dl-fan-lift">
                  <span className="dc">
                    <span className="dc-inner">
                      <CardBack />
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- C: nell'angolo

function Angolo({ d }: { d: Drawing }) {
  const take = useDraw((s) => s.take);
  const skip = useDraw((s) => s.skip);
  const slot = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState<Delta | null>(null);
  const fly = useFlyDelta(d.stage === 'fly', slot);

  // la carta sale dal mazzetto accanto alle carte
  useLayoutEffect(() => {
    const deck = document.querySelector<HTMLElement>('[data-hand-deck]');
    if (!deck || !slot.current) return setFrom({ x: 0, y: 120, s: 0.15 });
    const a = centerOf(slot.current.getBoundingClientRect());
    const b = centerOf(deck.getBoundingClientRect());
    setFrom({ x: b.x - a.x, y: b.y - a.y, s: deck.offsetHeight / CARD_H });
  }, [d.id]);

  const style = {
    '--flip': `${flipMs('angolo')}ms`,
    '--fly': `${flyMs('angolo')}ms`,
    ...(from ? { '--sx': `${from.x}px`, '--sy': `${from.y}px`, '--ss': from.s } : {}),
    ...flyVars(fly),
  } as CSSProperties;
  return (
    <div className={`draw-layer dl-angolo is-${d.stage}`} style={style}>
      <div className="dl-slot" ref={slot} onClick={() => (d.stage === 'offer' ? take() : skip())}>
        {from && <BigCard key={d.id} drawing={d} className={`dl-card ${cardStage(d, fly)}`} />}
      </div>
      <div className="dl-tag panel">
        <b>Una carta per te</b>
        <span className="dim">Toccala per girarla</span>
        <AutoBar id={d.id} />
      </div>
    </div>
  );
}

/**
 * Modo "angolo": il mazzetto accanto al bottone delle carte, sempre lì. Nel tuo turno, appena
 * conquisti un territorio, si accende: a fine turno peschi.
 */
export function HandDeck() {
  const style = useDraw((s) => s.style);
  const busy = useDraw((s) => s.current !== null);
  const { view, me } = useGame();
  if (style !== 'angolo') return null;
  const earned = view.turn?.player === me && view.turn?.conquered === true && view.phase !== 'over';
  const title = earned ? 'Hai conquistato: a fine turno peschi una carta' : `Mazzo: ${view.deckCount} carte. Conquista un territorio nel tuo turno per pescarne una.`;
  return (
    <span className={`hand-deck${earned ? ' earned' : ''}${busy ? ' busy' : ''}`} data-hand-deck title={title} aria-label={title}>
      <Deck count={3} />
      {earned && <span className="hand-deck-badge">+1</span>}
    </span>
  );
}

// ---------------------------------------------------------------- strato

/** La scena della pesca sopra il tabellone (niente quando non si pesca). */
export function DrawLayer() {
  const current = useDraw((s) => s.current);
  const style = useDraw((s) => s.style);

  // Invio o spazio: pesca, poi manda la carta tra le altre
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
      const s = useDraw.getState();
      if (s.current?.stage === 'offer' && e.key !== 'Escape') s.take();
      else if (s.current?.stage === 'reveal') s.skip();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current]);

  if (!current) return null;
  if (style === 'ventaglio') return <Ventaglio d={current} />;
  if (style === 'angolo') return <Angolo d={current} />;
  return <Centro d={current} />;
}
