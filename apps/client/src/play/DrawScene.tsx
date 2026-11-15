/**
 * Scena della pesca (i tempi e le fasi sono in draw.ts): sopra un velo il mazzo cade al centro,
 * la prima carta (quella vera, coperta) sale, si gira grande e vola nelle carte in mano, in basso
 * a sinistra (data-hand-pill). Qui anche il collegamento col gioco: le carte pescate arrivano
 * dalla partita, e la scena aspetta le battaglie proprie.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { Card } from '@onpeace/conquista';
import { shade } from '../board/common';
import { geometryAt, type BoardGeometry } from '../board/geometry';
import { CONTINENT } from '../board/styles/classico';
import { useLook } from '../look';
import { useSession } from '../store';
import { useBattle } from './battle';
import { Chip, SymbolIcon } from './bits';
import { SYMBOL_NAME } from './describe';
import { AUTO_MS, FLIP_MS, FLY_MS, setDrawGate, useDraw, type Drawing } from './draw';
import { skinOf, type Skin } from './objective';
import { useGame } from './useGame';
import './draw.css';

/** Altezza della carta grande (px, larga 220): il mazzo e il volo sono questa in scala. */
const CARD_H = 308;
/** Carte nel mazzo disegnato (sotto quella vera). */
const DECK = 6;

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
function BigCard({ drawing, className }: { drawing: Drawing; className: string }) {
  const { board } = useGame();
  const skin = useLook((s) => skinOf(s.style.id));
  const info = useFaceInfo(drawing.card);
  return (
    <div className={`dc ${className}`}>
      <div className="dc-inner">
        <CardBack />
        <CardFront card={drawing.card} info={info} geo={board.geo} skin={skin} />
      </div>
    </div>
  );
}

/** Pila di retri (il mazzo). */
function Deck({ count }: { count: number }) {
  return (
    <div className="dc-deck">
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

type Delta = { x: number; y: number; s: number };

const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Da dove a dove vola la carta: dal centro di `slot` alle carte in mano. */
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

/** Quante carte restano nel mazzo, a parole. */
function deckLeft(n: number): string {
  if (n === 0) return 'Era l’ultima carta del mazzo';
  return n === 1 ? 'Resta una carta nel mazzo' : `${n} carte nel mazzo`;
}

// ---------------------------------------------------------------- la scena

function Scene({ d }: { d: Drawing }) {
  const { view } = useGame();
  const take = useDraw((s) => s.take);
  const skip = useDraw((s) => s.skip);
  const slot = useRef<HTMLDivElement>(null);
  const fly = useFlyDelta(d.stage === 'fly', slot);
  // la carta comincia il volo solo quando si sa dove andare (fino ad allora resta ferma, girata)
  const cardStage = d.stage === 'fly' && !fly ? 'is-reveal' : `is-${d.stage}`;
  const style = {
    '--flip': `${FLIP_MS}ms`,
    '--fly': `${FLY_MS}ms`,
    ...(fly ? { '--fx': `${fly.x}px`, '--fy': `${fly.y}px`, '--fs': fly.s } : {}),
  } as CSSProperties;
  return (
    <div className={`draw-layer is-${d.stage}`} style={style} onClick={() => (d.stage === 'offer' ? take() : skip())}>
      <div className="dl-veil" />
      <div className="dl-stage">
        <div className="dl-head">
          <p className="dl-eyebrow">Hai conquistato in questo turno</p>
          <h2 className="dl-title">Pesca la tua carta</h2>
        </div>
        <div className="dl-slot" ref={slot}>
          <div className="dl-deck">
            <Deck count={DECK} />
          </div>
          <BigCard key={d.id} drawing={d} className={`dl-card ${cardStage}`} />
        </div>
        <div className="dl-foot">
          <span>
            Tocca il mazzo <kbd>Invio</kbd>
          </span>
          <span className="dl-auto" aria-hidden>
            <i key={d.id} style={{ animationDuration: `${AUTO_MS}ms` }} />
          </span>
          <span className="dim">{deckLeft(view.deckCount)}</span>
        </div>
      </div>
    </div>
  );
}

/** La scena della pesca sopra il tabellone (niente quando non si pesca). */
export function DrawLayer() {
  const current = useDraw((s) => s.current);

  // Invio o spazio: pesca, poi manda la carta tra le altre (anche Esc, a carta girata)
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      // solo dove si scrive: con lo slider o una casella in mano Invio resta alla scena
      if ((e.target as HTMLElement).closest('textarea, select, input:not([type=range]):not([type=checkbox]):not([type=radio])')) return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
      const s = useDraw.getState();
      if (s.current?.stage === 'offer' && e.key !== 'Escape') {
        // un tasto tenuto premuto non pesca e non manda via la carta: si ferma qui e basta
        if (!e.repeat) s.take();
      } else if (s.current?.stage === 'reveal') {
        if (!e.repeat) s.skip();
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current]);

  return current ? <Scene d={current} /> : null;
}

// ---------------------------------------------------------------- collegamento col gioco

/** Dopo una battaglia propria la carta aspetta un attimo: spesso ne arriva subito un'altra. */
const BATTLE_GAP_MS = 700;

/** Una battaglia propria è in scena (o in arrivo): la pesca aspetta che finisca. */
function battleBusy(): boolean {
  const b = useBattle.getState();
  const p = b.playing;
  return (p !== null && !p.small && p.eng.role !== 'spectator') || b.queue.some((e) => e.role !== 'spectator');
}

/**
 * Le carte pescate dal giocatore, appena arrivano dalla partita, vanno in scena. Se intanto
 * comincia una battaglia propria la carta aspetta, e torna quando la battaglia è finita.
 */
export function connectDrawFeed(): () => void {
  setDrawGate(battleBusy);
  let idle: ReturnType<typeof setTimeout> | null = null;
  const offBattle = useBattle.subscribe(() => {
    if (battleBusy()) {
      if (idle) clearTimeout(idle);
      idle = null;
      useDraw.getState().yieldToBattle();
    } else if (!idle) {
      idle = setTimeout(() => {
        idle = null;
        useDraw.getState().kick();
      }, BATTLE_GAP_MS);
    }
  });
  let seen: unknown = useSession.getState().fresh;
  const off = useSession.subscribe((s) => {
    if (s.fresh === seen) return;
    seen = s.fresh;
    if (!s.fresh) return;
    const me = s.online.me;
    for (const { event: e } of s.fresh.events) if (e.type === 'card' && e.player === me && e.card) useDraw.getState().push(e.card satisfies Card);
  });
  return () => {
    off();
    offBattle();
    if (idle) clearTimeout(idle);
    setDrawGate(() => false);
    useDraw.getState().clear();
  };
}
