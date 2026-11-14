/**
 * La scena della battaglia nelle cinque proposte (pagina di prova): stessa sequenza del regista
 * (ingresso, lancio, confronto, attesa, esito, uscita), cinque modi di metterla in scena.
 * I dadi sono cubi veri in 3D che rotolano e si fermano sulla faccia uscita.
 * Clic sulla scena: salta al risultato, poi chiude. Esc chiude.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { BoardView } from '../board/common';
import type { BoardPainter } from '../board/painter';
import { Chip, Die } from '../play/bits';
import { useSession } from '../store';
import { armiesAfter, pairs, shotTimes, useBattle, type Engagement, type Playing, type TankLook } from './battaglia-feed';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

// ---------------------------------------------------------------- dado in 3D

/** Rotazione del cubo che porta la faccia `n` verso chi guarda. */
const FACE: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
/** Puntini di ogni faccia nella griglia 3×3 (0 in alto a sinistra). */
const PIPS: Record<number, number[]> = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

type DieState = 'won' | 'lost' | 'spare' | null;

export function Die3D({
  value,
  side,
  size,
  roll,
  ms,
  from,
  state,
  delay = 0,
}: {
  value: number;
  side: 'attack' | 'defense';
  size: number;
  /** Cambia a ogni lancio: il dado rifà il lancio. */
  roll: string;
  /** Durata del lancio. */
  ms: number;
  /** Da dove arriva, in pixel rispetto al punto dove si ferma. */
  from: [number, number];
  state: DieState;
  delay?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const fly = useRef<HTMLDivElement>(null);
  const cube = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  // si lancia solo quando cambia il tiro: le altre cose (stato, durata) non lo rifanno
  const args = useRef({ value, ms, from, delay, size });
  args.current = { value, ms, from, delay, size };
  useLayoutEffect(() => {
    const { value: v, ms: dur, from: [x, y], delay: wait, size: s } = args.current;
    const [fx, fy] = FACE[v]!;
    const sign = () => (Math.random() < 0.5 ? -1 : 1);
    const tilt = { x: -16 + Math.random() * 6, y: (10 + Math.random() * 8) * sign(), z: (Math.random() - 0.5) * 34 };
    const spinX = 360 * (2 + Math.floor(Math.random() * 2)) * sign();
    const spinY = 360 * (1 + Math.floor(Math.random() * 2)) * sign();
    const rot = (ax: number, ay: number, az: number) =>
      `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotateZ(${az}deg) rotateX(${ax}deg) rotateY(${ay}deg)`;
    const timing = { duration: Math.max(60, dur), delay: wait, fill: 'both' as const };
    const anims = [
      cube.current!.animate([{ transform: rot(fx + spinX, fy + spinY, tilt.z + 220 * sign()) }, { transform: rot(fx, fy, tilt.z) }], {
        ...timing,
        easing: 'cubic-bezier(.1,.6,.22,1)',
      }),
      // in volo verso il tavolo, tocca, un rimbalzo e si ferma
      fly.current!.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0) scale(1.5)` },
          { transform: `translate3d(${x * 0.42}px, ${y * 0.42 - s * 0.7}px, 0) scale(1.28)`, offset: 0.32 },
          { transform: 'translate3d(0, 0, 0) scale(1)', offset: 0.6, easing: 'ease-out' },
          { transform: `translate3d(0, ${-s * 0.2}px, 0) scale(1.05)`, offset: 0.74, easing: 'ease-in' },
          { transform: 'translate3d(0, 0, 0) scale(1)', offset: 0.87 },
          { transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        { ...timing, easing: 'cubic-bezier(.3,.1,.4,1)' },
      ),
      shadow.current!.animate(
        [
          { transform: `translate(${x}px, ${y + s * 0.5}px) scale(0.5)`, opacity: 0 },
          { transform: `translate(${x * 0.42}px, ${y * 0.42}px) scale(0.7)`, opacity: 0.35, offset: 0.32 },
          { transform: 'translate(0, 0) scale(1)', opacity: 0.85, offset: 0.6 },
          { transform: 'translate(0, 0) scale(0.85)', opacity: 0.6, offset: 0.74 },
          { transform: 'translate(0, 0) scale(1)', opacity: 0.85 },
        ],
        { ...timing, easing: 'linear' },
      ),
      box.current!.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1 }], timing),
    ];
    return () => anims.forEach((a) => a.cancel());
  }, [roll]);
  return (
    <div ref={box} className={`d3 ${side}${state ? ` ${state}` : ''}`} style={{ '--s': `${size}px` } as Vars} role="img" aria-label={`${value}`}>
      <div ref={shadow} className="d3-shadow" />
      <div ref={fly} className="d3-fly">
        <div ref={cube} className="d3-cube">
          <i className="d3-core c1" />
          <i className="d3-core c2" />
          <i className="d3-core c3" />
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className={`d3-face f${n}`}>
              {PIPS[n]!.map((cell) => (
                <i key={cell} className="d3-pip" style={{ gridArea: `${Math.floor(cell / 3) + 1} / ${(cell % 3) + 1}` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="d3-mark" aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------- sagoma di un territorio

/** La forma vera del territorio, grande quanto il suo riquadro; colori da --sil-fill e --sil-line. */
function Silhouette({ id, className }: { id: string; className: string }) {
  const board = useSession((s) => s.board);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const path = board?.geo.paths.get(id);
    const b = board?.geo.boxes.get(id);
    if (!canvas || !path || !b) return;
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d')!;
      const css = getComputedStyle(canvas);
      const k = Math.min((w * 0.9) / (b[2] - b[0]), (h * 0.9) / (b[3] - b[1]));
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 - ((b[0] + b[2]) / 2) * k), dpr * (h / 2 - ((b[1] + b[3]) / 2) * k));
      ctx.fillStyle = css.getPropertyValue('--sil-fill') || 'rgba(0,0,0,.2)';
      ctx.fill(path, 'evenodd');
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5 / k;
      ctx.strokeStyle = css.getPropertyValue('--sil-line') || 'rgba(0,0,0,.5)';
      ctx.stroke(path);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [id, board]);
  return <canvas ref={ref} className={className} aria-hidden />;
}

// ---------------------------------------------------------------- quello che si vede in ogni momento

interface Moment {
  eng: Engagement;
  p: Playing;
  roll: Engagement['rolls'][number] | null;
  /** Il tiro è già stato confrontato: perdite, vincitori e numeri nuovi si vedono. */
  resolved: boolean;
  armies: { a: number; d: number };
  /** Perdite dall'inizio dello scontro. */
  total: { a: number; d: number };
  wins: boolean[];
  /** Esito finale, quando c'è. */
  result: { text: string; tone: 'good' | 'bad' | 'neutral'; conquered: boolean } | null;
  rollKey: string;
  me: string | null;
}

function moment(p: Playing, me: string | null): Moment {
  const { eng, shown, stage } = p;
  const roll = shown >= 0 ? (eng.rolls[shown] ?? null) : null;
  const resolved = stage !== 'intro' && stage !== 'throw';
  const armies = armiesAfter(eng, resolved ? shown : shown - 1);
  const last = eng.rolls.at(-1);
  let result: Moment['result'] = null;
  if ((stage === 'end' || stage === 'outro') && eng.over && last) {
    const won = last.conquered;
    if (eng.role === 'attacker') result = won ? { text: 'Conquistato', tone: 'good', conquered: true } : { text: 'Ti hanno respinto', tone: 'bad', conquered: false };
    else if (eng.role === 'defender') result = won ? { text: `Hai perso ${eng.d.place}`, tone: 'bad', conquered: true } : { text: 'Respinto', tone: 'good', conquered: false };
    else result = won ? { text: `${eng.a.name} prende ${eng.d.place}`, tone: 'neutral', conquered: true } : { text: `${eng.d.name} resiste`, tone: 'neutral', conquered: false };
  }
  return {
    eng,
    p,
    roll,
    resolved,
    armies,
    total: { a: eng.a.armies - armies.a, d: eng.d.armies - armies.d },
    wins: roll ? pairs(roll) : [],
    result,
    rollKey: `${eng.id}:${shown}`,
    me,
  };
}

const nameOf = (m: Moment, side: 'a' | 'd') => (m.eng[side].player === m.me ? 'Tu' : m.eng[side].name);

function headline(m: Moment): string {
  const { eng } = m;
  if (eng.role === 'attacker') return `Attacchi ${eng.d.place}`;
  if (eng.role === 'defender') return `${eng.a.name} attacca ${eng.d.place}`;
  return `${eng.a.name} attacca ${eng.d.name}`;
}

function dieState(m: Moment, side: 'attack' | 'defense', i: number): DieState {
  if (!m.resolved) return null;
  if (i >= m.wins.length) return 'spare';
  const aWon = m.wins[i]!;
  return side === 'attack' ? (aWon ? 'won' : 'lost') : aWon ? 'lost' : 'won';
}

/** Numero di armate che scatta quando cambia, con la perdita che sale accanto (a destra, o a sinistra con `side`). */
function Count({ value, loss, k, className = '', side = 'right' }: { value: number; loss: number; k: string; className?: string; side?: 'left' | 'right' }) {
  return (
    <span className={`bt-count num loss-${side} ${className}`}>
      <span key={value} className="bt-count-n">
        {value}
      </span>
      {loss > 0 && (
        <span key={k} className="bt-loss">
          −{loss}
        </span>
      )}
    </span>
  );
}

function Tally({ m }: { m: Moment }) {
  const n = m.p.shown + 1;
  if (n < 1) return null;
  return (
    <span className="bt-tally num">
      <span>{n === 1 ? '1 tiro' : `${n} tiri`}</span>
      <span>
        {nameOf(m, 'a')} <b className={m.total.a ? 'neg' : ''}>−{m.total.a}</b>
      </span>
      <span>
        {nameOf(m, 'd')} <b className={m.total.d ? 'neg' : ''}>−{m.total.d}</b>
      </span>
    </span>
  );
}

function SkipHint({ m }: { m: Moment }) {
  const open = m.p.stage === 'hold' && m.eng.role === 'attacker' && !m.eng.over;
  return <span className="bt-skip">{open ? 'Invio tira ancora · clic chiude' : 'Clic per saltare · Esc chiude'}</span>;
}

// ---------------------------------------------------------------- A · tavolo

function Table({ m }: { m: Moment }) {
  const { eng, roll, p } = m;
  const size = 74;
  const gap = 22;
  const lossA = m.resolved && roll ? roll.aLoss : 0;
  const lossD = m.resolved && roll ? roll.dLoss : 0;
  return (
    <div className="tv-wrap">
      <div className="tv-table">
        <div className="tv-felt" />
        <header className="tv-head">
          <span className="tv-kicker">{eng.role === 'defender' ? 'Ti attaccano' : eng.role === 'attacker' ? 'Attacco' : 'Battaglia'}</span>
          <h2>{headline(m)}</h2>
        </header>
        <aside className="tv-side att" style={{ '--c': eng.a.color } as Vars}>
          <span className="tv-who">
            <Chip color={eng.a.color} /> {nameOf(m, 'a')}
          </span>
          <span className="tv-place">{eng.a.place}</span>
          <Count value={m.armies.a} loss={lossA} k={m.rollKey} className="tv-armies" />
          <span className="tv-role">attacca</span>
        </aside>
        <aside className="tv-side def" style={{ '--c': eng.d.color } as Vars}>
          <span className="tv-who">
            <Chip color={eng.d.color} /> {nameOf(m, 'd')}
          </span>
          <span className="tv-place">{eng.d.place}</span>
          <Count value={m.armies.d} loss={lossD} k={m.rollKey} className="tv-armies" side="left" />
          <span className="tv-role">difende</span>
        </aside>
        <div className="tv-line" />
        {roll && (
          <div className="tv-dice" style={{ '--size': `${size}px`, '--gap': `${gap}px` } as Vars}>
            {[0, 1, 2].map((i) => {
              const a = roll.attack[i];
              const d = roll.defense[i];
              if (a === undefined && d === undefined) return null;
              const paired = i < m.wins.length;
              return (
                <div key={i} className={`tv-row${paired && m.resolved ? (m.wins[i] ? ' a-won' : ' d-won') : ''}`}>
                  <span className="tv-slot">
                    {a !== undefined && (
                      <Die3D value={a} side="attack" size={size} roll={m.rollKey} ms={p.ms} from={[-360 - i * 40, 120 - i * 90]} delay={i * 40} state={dieState(m, 'attack', i)} />
                    )}
                  </span>
                  <span className="tv-clash" aria-hidden>
                    {paired && m.resolved && <span key={m.rollKey}>{m.wins[i] ? '›' : '‹'}</span>}
                  </span>
                  <span className="tv-slot">
                    {d !== undefined && (
                      <Die3D value={d} side="defense" size={size} roll={m.rollKey} ms={p.ms} from={[360 + i * 40, 120 - i * 90]} delay={60 + i * 40} state={dieState(m, 'defense', i)} />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <footer className="tv-foot">
          <Tally m={m} />
        </footer>
        {m.result && (
          <div className={`bt-stamp tv-stamp ${m.result.tone}`} key={m.eng.id}>
            {m.result.text}
          </div>
        )}
      </div>
      <SkipHint m={m} />
    </div>
  );
}

// ---------------------------------------------------------------- B · duello

function Token({ color, value, loss, k, hit }: { color: string; value: number; loss: number; k: string; hit: boolean }) {
  return (
    <span className={`du-token${hit ? ' hit' : ''}`} style={{ '--c': color } as Vars} key={hit ? k : 'calm'}>
      <Count value={value} loss={loss} k={k} />
    </span>
  );
}

function Duel({ m }: { m: Moment }) {
  const { eng, roll, p } = m;
  const lossA = m.resolved && roll ? roll.aLoss : 0;
  const lossD = m.resolved && roll ? roll.dLoss : 0;
  const size = 60;
  return (
    <div className={`du-wrap${m.result?.conquered ? ' taken' : ''}${m.result && !m.result.conquered ? ' held' : ''}`}>
      <section className="du-panel att" style={{ '--c': eng.a.color } as Vars}>
        <Silhouette id={eng.a.territory} className="du-shape" />
        <div className="du-inner">
          <span className="du-kicker">{nameOf(m, 'a')} · attacca</span>
          <h2 className="du-place">{eng.a.place}</h2>
          <Token color={eng.a.color} value={m.armies.a} loss={lossA} k={m.rollKey} hit={lossA > 0} />
        </div>
      </section>
      <section className="du-panel def" style={{ '--c': eng.d.color, '--ca': eng.a.color } as Vars}>
        <Silhouette id={eng.d.territory} className="du-shape" />
        <div className="du-inner">
          <span className="du-kicker">{nameOf(m, 'd')} · difende</span>
          <h2 className="du-place">{eng.d.place}</h2>
          <Token color={eng.d.color} value={m.armies.d} loss={lossD} k={m.rollKey} hit={lossD > 0} />
        </div>
      </section>
      <div className="du-seam" />
      <div className="du-center">
        <span className="du-vs">contro</span>
        {roll && (
          <div className="du-dice">
            {[0, 1, 2].map((i) => {
              const a = roll.attack[i];
              const d = roll.defense[i];
              if (a === undefined && d === undefined) return null;
              const paired = i < m.wins.length;
              return (
                <div key={i} className={`du-row${paired && m.resolved ? (m.wins[i] ? ' a-won' : ' d-won') : ''}`} style={{ '--i': i } as Vars}>
                  <span className="du-slot">
                    {a !== undefined && <Die3D value={a} side="attack" size={size} roll={m.rollKey} ms={p.ms} from={[-220, -260 - i * 40]} delay={i * 70} state={dieState(m, 'attack', i)} />}
                  </span>
                  <span className="du-hit" aria-hidden />
                  <span className="du-slot">
                    {d !== undefined && <Die3D value={d} side="defense" size={size} roll={m.rollKey} ms={p.ms} from={[220, -260 - i * 40]} delay={40 + i * 70} state={dieState(m, 'defense', i)} />}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <Tally m={m} />
      </div>
      {m.result && (
        <div className={`bt-stamp du-stamp ${m.result.tone}`} key={m.eng.id}>
          {m.result.text}
        </div>
      )}
      <SkipHint m={m} />
    </div>
  );
}

// ---------------------------------------------------------------- C · mappa

const TOPBAR = 52;
const LETTERBOX = 58;
/** Fila dei dadi in primo piano: sopra la barra nera in basso e la barra dei comandi. */
const TRAY_BOTTOM = 132;

interface Spots {
  a: [number, number];
  d: [number, number];
}

/** Da che parte del suo territorio sta l'etichetta: dal lato opposto all'altro territorio, così non si toccano. */
function tagSide(s: Spots, who: 'a' | 'd'): 'n' | 's' | 'e' | 'w' {
  const [x, y] = s[who];
  const [ox, oy] = s[who === 'a' ? 'd' : 'a'];
  if (Math.abs(x - ox) >= Math.abs(y - oy) * 0.6) return x <= ox ? 'w' : 'e';
  return y <= oy ? 'n' : 's';
}

/** Vista di prima della prima battaglia di fila: ci si torna quando non ce ne sono altre in coda. */
let home: BoardView | null = null;

/**
 * Camera: all'ingresso vola sui due territori (lasciando i margini chiesti), all'uscita torna dov'era
 * se non c'è un'altra battaglia subito dopo. Dà la posizione sullo schermo dei due territori.
 */
function useCamera(
  painter: BoardPainter | null,
  p: Playing,
  margin: { side: number; top: number; bottom: number },
  maxZoom: number,
  /** Distanza voluta tra i due territori sullo schermo; senza, si inquadrano i territori interi. */
  spread?: number,
): Spots | null {
  const [spots, setSpots] = useState<Spots | null>(null);
  const from = p.eng.a.territory;
  const to = p.eng.d.territory;
  const { side, top, bottom } = margin;
  useEffect(() => {
    if (!painter) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    home ??= painter.currentView();
    const box = { left: side, top, right: w - side, bottom: h - bottom };
    let far = spread ?? 0;
    if (spread) {
      // la distanza voluta deve starci nel riquadro anche quando i territori sono uno sopra l'altro
      // (resta spazio per le formazioni e le targhe intorno)
      const one = { scale: 1, x: 0, y: 0 };
      const pa = painter.territoryOnScreen(from, one);
      const pd = painter.territoryOnScreen(to, one);
      if (pa && pd) {
        const len = Math.hypot(pd[0] - pa[0], pd[1] - pa[1]) || 1;
        const cos = Math.abs(pd[0] - pa[0]) / len;
        const sin = Math.abs(pd[1] - pa[1]) / len;
        far = Math.min(spread, (box.right - box.left - 360) / Math.max(cos, 0.01), (box.bottom - box.top - 260) / Math.max(sin, 0.01));
      }
    }
    const view = spread ? painter.viewAround([from, to], box, Math.max(160, far), maxZoom) : painter.viewFor([from, to], box, maxZoom);
    const a = painter.territoryOnScreen(from, view);
    const d = painter.territoryOnScreen(to, view);
    if (a && d) setSpots({ a, d });
    void painter.flyTo(view, useBattle.getState().playing?.ms ?? 700);
  }, [painter, from, to, side, top, bottom, maxZoom, spread]);
  const leaving = p.stage === 'outro';
  useEffect(() => {
    if (!leaving || !painter || !home || useBattle.getState().queue.length > 0) return;
    void painter.flyTo(home, p.ms + 160);
    home = null;
  }, [leaving, painter, p.ms]);
  return spots;
}

/** Luce sui due territori, il resto della mappa in ombra. */
function spotlight(spots: Spots | null, extra = 0): Vars {
  if (!spots) return {};
  const [ax, ay] = spots.a;
  const [dx, dy] = spots.d;
  return {
    '--mx': `${(ax + dx) / 2}px`,
    '--my': `${(ay + dy) / 2}px`,
    '--rx': `${Math.max(260, Math.abs(ax - dx) / 2 + 230 + extra)}px`,
    '--ry': `${Math.max(200, Math.abs(ay - dy) / 2 + 190 + extra)}px`,
  };
}

/** I dadi in primo piano: una fila in basso al centro, a coppie (attacco a sinistra, difesa a destra); ognuno parte dal suo territorio. */
function DiceTray({ m, spots, size }: { m: Moment; spots: Spots; size: number }) {
  const { roll, p } = m;
  if (!roll) return null;
  const trayY = window.innerHeight - TRAY_BOTTOM - size / 2;
  const pairW = size * 2 + 44;
  const gap = 40;
  const n = Math.max(roll.attack.length, roll.defense.length);
  const x0 = window.innerWidth / 2 - (n * pairW + (n - 1) * gap) / 2;
  const die = (side: 'attack' | 'defense', v: number, i: number) => {
    const x = x0 + i * (pairW + gap) + (side === 'attack' ? size / 2 : pairW - size / 2);
    const [sx, sy] = side === 'attack' ? spots.a : spots.d;
    return (
      <span key={`${side}${i}`} className="mp-die" style={{ left: x - size / 2, top: trayY - size / 2 }}>
        <Die3D value={v} side={side} size={size} roll={m.rollKey} ms={p.ms} from={[sx - x, sy - trayY]} delay={(side === 'attack' ? 0 : 50) + i * 50} state={dieState(m, side, i)} />
      </span>
    );
  };
  return (
    <>
      <span className="mp-tray" style={{ left: x0 - 18, width: n * pairW + (n - 1) * gap + 36, top: trayY - size / 2 - 14, height: size + 28 }} />
      {Array.from({ length: n - 1 }, (_, i) => (
        <span key={`sep${i}`} className="mp-sep" style={{ left: x0 + (i + 1) * (pairW + gap) - gap / 2, top: trayY - size / 2 - 2, height: size + 4 }} />
      ))}
      {roll.attack.map((v, i) => die('attack', v, i))}
      {roll.defense.map((v, i) => die('defense', v, i))}
      {m.resolved &&
        m.wins.map((aWon, i) => (
          <span key={`${m.rollKey}-${i}`} className={`mp-clash ${aWon ? 'a' : 'd'}`} style={{ left: x0 + i * (pairW + gap) + pairW / 2, top: trayY }}>
            {aWon ? '›' : '‹'}
          </span>
        ))}
    </>
  );
}

const trayTop = (size: number) => window.innerHeight - TRAY_BOTTOM - size / 2;

function CinemaBars({ m }: { m: Moment }) {
  const { eng } = m;
  return (
    <>
      <div className="mp-bar top">
        <span className="mp-kicker">{eng.role === 'defender' ? 'Ti attaccano' : eng.role === 'attacker' ? 'Attacco' : 'Battaglia'}</span>
        <b>{headline(m)}</b>
        <Tally m={m} />
      </div>
      <div className="mp-bar bottom" />
    </>
  );
}

function MapStage({ m, painter }: { m: Moment; painter: BoardPainter | null }) {
  const { eng, roll, p } = m;
  const spots = useCamera(painter, p, { side: 120, top: TOPBAR + LETTERBOX + 80, bottom: TRAY_BOTTOM + 110 }, 4.2);
  const lossA = m.resolved && roll ? roll.aLoss : 0;
  const lossD = m.resolved && roll ? roll.dLoss : 0;
  const size = 56;
  return (
    <div className="mp-wrap" style={spotlight(spots)}>
      <div className="mp-light" />
      <CinemaBars m={m} />
      {spots && (
        <>
          <span className={`mp-tag att at-${tagSide(spots, 'a')}`} style={{ left: spots.a[0], top: spots.a[1], '--c': eng.a.color } as Vars}>
            <Chip color={eng.a.color} />
            <span className="mp-tag-name">{eng.a.place}</span>
            <Count value={m.armies.a} loss={lossA} k={m.rollKey} />
          </span>
          <span className={`mp-tag def at-${tagSide(spots, 'd')}`} style={{ left: spots.d[0], top: spots.d[1], '--c': eng.d.color } as Vars}>
            <Chip color={eng.d.color} />
            <span className="mp-tag-name">{eng.d.place}</span>
            <Count value={m.armies.d} loss={lossD} k={m.rollKey} />
          </span>
          <DiceTray m={m} spots={spots} size={size} />
        </>
      )}
      {m.result && (
        <div className={`bt-stamp mp-stamp ${m.result.tone}`} key={m.eng.id} style={{ top: trayTop(size) }}>
          {m.result.text}
        </div>
      )}
      <SkipHint m={m} />
    </div>
  );
}

// ---------------------------------------------------------------- E · carri armati

/** Carri visibili per parte al massimo: con più armate, chi cade viene rimpiazzato dalle retrovie. */
const TANKS_MAX = 8;
const TANK_COLS = 3;

/**
 * Carri di una parte dopo una serie di perdite, dal primo in prima fila: i colpiti escono (sempre
 * quelli davanti) e dalle retrovie ne entrano di nuovi finché le armate bastano. Ogni carro ha un numero
 * suo, così chi resta scivola avanti invece di sparire e ricomparire.
 */
function fleet(start: number, losses: number[]): number[] {
  let alive = Array.from({ length: Math.min(start, TANKS_MAX) }, (_, i) => i);
  let next = alive.length;
  let armies = start;
  for (const loss of losses) {
    alive = alive.slice(loss);
    armies -= loss;
    while (alive.length < Math.min(armies, TANKS_MAX)) alive.push(next++);
  }
  return alive;
}

type Pt = [number, number];

/** Posti della formazione: file da tre, la prima verso il nemico. `u` punta al nemico. */
function slotsFor(look: TankLook, center: Pt, u: Pt, n: number): Pt[] {
  const [cx, cy] = center;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / TANK_COLS);
    const inRow = Math.min(TANK_COLS, n - r * TANK_COLS);
    const off = (i % TANK_COLS) - (inRow - 1) / 2;
    if (look === 'alto') {
      // visti dall'alto: file perpendicolari alla direzione del nemico
      out.push([cx - u[0] * r * 58 - u[1] * off * 52, cy - u[1] * r * 58 + u[0] * off * 52]);
    } else {
      // di lato: rivolti a destra o a sinistra, a ventaglio
      const f = u[0] >= 0 ? 1 : -1;
      out.push([cx - f * (r * 82 + Math.abs(off) * 12), cy + off * 44 + r * 5]);
    }
  }
  return out;
}

const unit = (from: Pt, to: Pt): Pt => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
};
const deg = (v: Pt) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

/** Un carro armato disegnato da zero: visto dall'alto (torretta che ruota) o di lato. */
function TankShape({ look }: { look: TankLook }) {
  if (look === 'alto') {
    return (
      <svg className="tk-svg" viewBox="-22 -16 44 32" aria-hidden>
        <rect className="tk-track" x="-19" y="-15" width="36" height="8" rx="2.5" />
        <rect className="tk-track" x="-19" y="7" width="36" height="8" rx="2.5" />
        <path className="tk-tread" d="M-16 -11h30M-16 11h30" />
        <rect className="tk-hull" x="-17" y="-10" width="32" height="20" rx="4" />
        <rect className="tk-deck" x="-14" y="-7" width="10" height="14" rx="2" />
        <g className="tk-turret">
          <rect className="tk-barrel" x="3" y="-2" width="20" height="4" rx="1.4" />
          <rect className="tk-brake" x="20" y="-2.8" width="4" height="5.6" rx="1" />
          <circle className="tk-dome" r="7.5" />
          <circle className="tk-hatch" cx="-2" cy="-1.5" r="2.6" />
          <circle className="tk-flash" cx="27" cy="0" r="6" />
        </g>
      </svg>
    );
  }
  return (
    <svg className="tk-svg" viewBox="-28 -20 56 36" aria-hidden>
      <path className="tk-track" d="M-22 4h40a6 6 0 0 1 0 12h-40a6 6 0 0 1 0-12z" />
      {[-18, -9, 0, 9, 17].map((x) => (
        <circle key={x} className="tk-wheel" cx={x} cy="10" r="3.6" />
      ))}
      <path className="tk-hull" d="M-24 4l4-9h38l6 9z" />
      <g className="tk-turret">
        <rect className="tk-barrel" x="4" y="-13.5" width="22" height="3.6" rx="1.2" />
        <rect className="tk-brake" x="23" y="-14.3" width="4" height="5.2" rx="1" />
        <path className="tk-dome" d="M-12 -5c1-6 4-10 11-10h6c5 0 8 4 9 10z" />
        <circle className="tk-flash" cx="31" cy="-11.7" r="6.5" />
      </g>
    </svg>
  );
}

interface Shot {
  from: Pt;
  to: Pt;
  fire: number;
  hit: number;
  shooter: number;
  target: number;
  side: 'a' | 'd';
}

function TankStage({ m, painter }: { m: Moment; painter: BoardPainter | null }) {
  const { eng, roll, p } = m;
  const look = useBattle((s) => s.tankLook);
  const spots = useCamera(painter, p, { side: 200, top: TOPBAR + LETTERBOX + 40, bottom: TRAY_BOTTOM + 70 }, 7, Math.min(620, window.innerWidth * 0.4));
  const size = 52;
  if (!spots) {
    return (
      <div className="mp-wrap">
        <CinemaBars m={m} />
      </div>
    );
  }

  // chi c'è adesso: durante il confronto la flotta di prima del tiro (i colpiti esplodono), poi quella dopo
  const k = m.resolved ? p.shown : p.shown - 1;
  const before = Math.max(-1, p.shown - 1);
  const lossesA = eng.rolls.map((r) => r.aLoss);
  const lossesD = eng.rolls.map((r) => r.dLoss);
  const firing = p.stage === 'resolve' && roll !== null;
  const shownK = firing ? before : k;
  const fleetA = fleet(eng.a.armies, lossesA.slice(0, shownK + 1));
  const fleetD = fleet(eng.d.armies, lossesD.slice(0, shownK + 1));

  const uA = unit(spots.a, spots.d);
  const uD = unit(spots.d, spots.a);
  const dist = Math.hypot(spots.d[0] - spots.a[0], spots.d[1] - spots.a[1]);
  const push = Math.min(40, dist * 0.1);
  const centerA: Pt = [spots.a[0] + uA[0] * push, spots.a[1] + uA[1] * push];
  const centerD: Pt = [spots.d[0] + uD[0] * push, spots.d[1] + uD[1] * push];
  const slotsA = slotsFor(look, centerA, uA, fleetA.length);
  const slotsD = slotsFor(look, centerD, uD, fleetD.length);
  // conquista: i primi carri entrano nel territorio preso
  const taking = m.result?.conquered === true;
  const enter = taking ? slotsFor(look, spots.d, uA, Math.min(3, fleetA.length)) : [];

  // la sparatoria: un colpo per coppia di dadi, chi vince la coppia spara
  const shots: Shot[] = [];
  if (firing && roll) {
    const times = shotTimes(p.ms, m.wins.length);
    let hitA = 0;
    let hitD = 0;
    m.wins.forEach((aWon, i) => {
      const side = aWon ? 'a' : 'd';
      const shooter = Math.min(i, (aWon ? fleetA : fleetD).length - 1);
      const target = aWon ? hitD++ : hitA++;
      const from = (aWon ? slotsA : slotsD)[shooter]!;
      const to = (aWon ? slotsD : slotsA)[target]!;
      shots.push({ from, to, ...times[i]!, shooter, target, side });
    });
  }

  const tank = (side: 'a' | 'd', id: number, i: number, pos: Pt) => {
    const u = side === 'a' ? uA : uD;
    const mine = shots.filter((s) => s.side === side && s.shooter === i);
    const hitBy = shots.find((s) => s.side !== side && s.target === i);
    const shot = mine[0];
    const f = u[0] >= 0 ? 1 : -1;
    // dall'alto il carro guarda il nemico e la torretta punta il bersaglio; di lato guarda a destra o a sinistra
    const hull = look === 'alto' ? deg(u) : 0;
    const aim = look === 'alto' && shot ? deg(unit(shot.from, shot.to)) - hull : 0;
    const target = taking && side === 'a' && i < enter.length ? enter[i]! : pos;
    const style = {
      left: target[0],
      top: target[1],
      zIndex: Math.round(target[1]),
      '--c': side === 'a' ? eng.a.color : eng.d.color,
      '--hull': `${hull}deg`,
      '--aim': `${aim}deg`,
      '--flip': look === 'lato' ? f : 1,
      '--fire': `${shot?.fire ?? 0}ms`,
      '--hit': `${hitBy?.hit ?? 0}ms`,
      '--back': `${-u[0] * 60}px, ${-u[1] * 60}px`,
      // quelli schierati all'inizio arrivano quando la camera è quasi ferma; le riserve subito
      '--enter': `${id < Math.min(side === 'a' ? eng.a.armies : eng.d.armies, TANKS_MAX) ? (eng.again ? 150 : 700) : 0}ms`,
    } as Vars;
    const cls = ['tk', `tk-${look}`, side === 'a' ? 'att' : 'def', shot ? 'firing' : '', hitBy ? 'hit' : '', taking && side === 'a' && i < enter.length ? 'moving' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <span key={`${side}${id}`} className={cls} style={style}>
        <span className="tk-body" key={shot || hitBy ? m.rollKey : 'calm'}>
          <TankShape look={look} />
        </span>
      </span>
    );
  };

  // targa sotto la formazione, o sopra se il nemico sta sotto: così non tocca né i carri né l'altra targa
  // conquista: la targa del territorio preso passa a chi l'ha preso e va sotto i carri entrati
  const plate = (side: 'a' | 'd') => {
    const took = taking && side === 'd';
    const f = side === 'a' ? eng.a : eng.d;
    const color = took ? eng.a.color : f.color;
    const slots = took ? enter : side === 'a' ? slotsA.filter((_, i) => !(taking && i < enter.length)) : slotsD;
    const center = side === 'a' ? centerA : centerD;
    const enemy = side === 'a' ? centerD : centerA;
    const xs = slots.length > 0 ? slots.map((s) => s[0]) : [center[0]];
    const ys = slots.length > 0 ? slots.map((s) => s[1]) : [center[1]];
    const above = enemy[1] - center[1] > 40;
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const y = above ? Math.min(...ys) - 52 : Math.max(...ys) + 52;
    const loss = m.resolved && roll ? (side === 'a' ? roll.aLoss : roll.dLoss) : 0;
    return (
      <span className={`tk-plate ${side === 'a' ? 'att' : 'def'}`} style={{ left: x, top: y, '--c': color } as Vars}>
        <Chip color={color} />
        <span className="mp-tag-name">{f.place}</span>
        {took ? <span className="tk-plate-new">preso</span> : <Count value={side === 'a' ? m.armies.a : m.armies.d} loss={loss} k={m.rollKey} />}
      </span>
    );
  };

  return (
    <div className={`mp-wrap tk-wrap tk-look-${look}`} style={spotlight(spots, 60)}>
      <div className="mp-light" />
      {fleetA.map((id, i) => tank('a', id, i, slotsA[i]!))}
      {fleetD.map((id, i) => tank('d', id, i, slotsD[i]!))}
      {shots.map((s, i) => {
        const dx = s.to[0] - s.from[0];
        const dy = s.to[1] - s.from[1];
        const arc = look === 'lato' ? Math.min(150, Math.hypot(dx, dy) * 0.32) : 0;
        return (
          <span key={`${m.rollKey}-s${i}`}>
            <span
              className={`tk-shell${look === 'lato' ? ' arc' : ''}`}
              style={{ left: s.from[0], top: s.from[1], '--dx': `${dx}px`, '--dy': `${dy}px`, '--arc': `${-arc}px`, '--fire': `${s.fire}ms`, '--flight': `${s.hit - s.fire}ms`, '--rot': `${deg([dx, dy])}deg` } as Vars}
            >
              <i />
            </span>
            <span className="tk-boom" style={{ left: s.to[0], top: s.to[1], '--hit': `${s.hit}ms` } as Vars}>
              <i className="tk-fire" />
              <i className="tk-ring" />
              <i className="tk-smoke s1" />
              <i className="tk-smoke s2" />
              <i className="tk-smoke s3" />
            </span>
          </span>
        );
      })}
      {plate('a')}
      {plate('d')}
      <CinemaBars m={m} />
      <DiceTray m={m} spots={spots} size={size} />
      {m.result && (
        <div className={`bt-stamp mp-stamp ${m.result.tone}`} key={m.eng.id} style={{ top: trayTop(size) }}>
          {m.result.text}
        </div>
      )}
      <SkipHint m={m} />
    </div>
  );
}

// ---------------------------------------------------------------- D · riquadro

function Box({ m }: { m: Moment }) {
  const { eng, roll, p } = m;
  const lossA = m.resolved && roll ? roll.aLoss : 0;
  const lossD = m.resolved && roll ? roll.dLoss : 0;
  const size = 46;
  const shownRolls = eng.rolls.slice(0, m.resolved ? p.shown + 1 : p.shown);
  return (
    <div className="rq-wrap">
      <section className="rq-card panel">
        <header className="rq-head">
          <span className="rq-kicker">{eng.role === 'defender' ? 'Ti attaccano' : eng.role === 'attacker' ? 'Attacco' : 'Battaglia'}</span>
          <Tally m={m} />
        </header>
        <div className="rq-grid">
          <div className="rq-side att" style={{ '--c': eng.a.color } as Vars}>
            <span className="rq-who">
              <Chip color={eng.a.color} /> {nameOf(m, 'a')}
            </span>
            <span className="rq-place">{eng.a.place}</span>
            <Count value={m.armies.a} loss={lossA} k={m.rollKey} className="rq-armies" />
          </div>
          <div className="rq-dice">
            {roll &&
              [0, 1, 2].map((i) => {
                const a = roll.attack[i];
                const d = roll.defense[i];
                if (a === undefined && d === undefined) return null;
                const paired = i < m.wins.length;
                return (
                  <div key={i} className={`rq-row${paired && m.resolved ? (m.wins[i] ? ' a-won' : ' d-won') : ''}`}>
                    <span className="rq-slot">
                      {a !== undefined && <Die3D value={a} side="attack" size={size} roll={m.rollKey} ms={p.ms} from={[-90, -30]} delay={i * 30} state={dieState(m, 'attack', i)} />}
                    </span>
                    <span className="rq-vs" aria-hidden>
                      {paired && m.resolved ? (m.wins[i] ? '›' : '‹') : '·'}
                    </span>
                    <span className="rq-slot">
                      {d !== undefined && <Die3D value={d} side="defense" size={size} roll={m.rollKey} ms={p.ms} from={[90, -30]} delay={30 + i * 30} state={dieState(m, 'defense', i)} />}
                    </span>
                  </div>
                );
              })}
          </div>
          <div className="rq-side def" style={{ '--c': eng.d.color } as Vars}>
            <span className="rq-who">
              <Chip color={eng.d.color} /> {nameOf(m, 'd')}
            </span>
            <span className="rq-place">{eng.d.place}</span>
            <Count value={m.armies.d} loss={lossD} k={m.rollKey} className="rq-armies" side="left" />
          </div>
        </div>
        <footer className="rq-foot">
          <ol className="rq-history" aria-label="Tiri">
            {shownRolls.map((r, i) => (
              <li key={i} className={r.dLoss > r.aLoss ? 'good' : r.aLoss > r.dLoss ? 'bad' : 'even'} title={`−${r.aLoss} / −${r.dLoss}`} />
            ))}
          </ol>
          {m.result ? <b className={`rq-result ${m.result.tone}`}>{m.result.text}</b> : <span className="bt-skip inline">{m.p.stage === 'hold' && eng.role === 'attacker' ? 'Invio tira ancora' : 'Clic per saltare'}</span>}
        </footer>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- chi guarda, in piccolo

function Small({ m }: { m: Moment }) {
  const { eng, roll } = m;
  return (
    <div className="sm-card panel">
      <span className="sm-side">
        <Chip color={eng.a.color} />
        <b>{eng.a.name}</b>
        <span className="dim">{eng.a.place}</span>
        <Count value={m.armies.a} loss={m.resolved && roll ? roll.aLoss : 0} k={m.rollKey} />
      </span>
      <span className={`sm-dice${m.p.stage === 'throw' ? ' rolling' : ''}`} key={m.rollKey}>
        {roll && (
          <>
            <span className="dice">
              {roll.attack.map((v, i) => (
                <Die key={i} value={v} side="attack" size={24} lost={m.resolved && i < m.wins.length && !m.wins[i]} />
              ))}
            </span>
            <span className="dim">·</span>
            <span className="dice">
              {roll.defense.map((v, i) => (
                <Die key={i} value={v} side="defense" size={24} lost={m.resolved && Boolean(m.wins[i])} />
              ))}
            </span>
          </>
        )}
      </span>
      <span className="sm-side">
        <Count value={m.armies.d} loss={m.resolved && roll ? roll.dLoss : 0} k={m.rollKey} />
        <span className="dim">{eng.d.place}</span>
        <b>{eng.d.name}</b>
        <Chip color={eng.d.color} />
      </span>
      {m.result && <b className="sm-result">{m.result.text}</b>}
    </div>
  );
}

// ---------------------------------------------------------------- lo strato sopra il tabellone

export function BattleLayer({ painter }: { painter: BoardPainter | null }) {
  const playing = useBattle((s) => s.playing);
  const proposal = useBattle((s) => s.proposal);
  const me = useSession((s) => s.online.me);
  const m = useMemo(() => (playing ? moment(playing, me) : null), [playing, me]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useBattle.getState().close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!m) return null;
  const small = m.p.small;
  const kind = small ? 'small' : proposal;
  const style = { '--ms': `${m.p.ms}ms` } as Vars;
  return (
    <div
      className={`bt-layer bt-${kind} st-${m.p.stage}${m.p.quick ? ' quick' : ''} role-${m.eng.role}`}
      style={style}
      onClick={small ? undefined : () => useBattle.getState().skip()}
      aria-live="polite"
    >
      {small ? (
        <Small m={m} />
      ) : proposal === 'tavolo' ? (
        <>
          <div className="bt-veil" />
          <Table m={m} />
        </>
      ) : proposal === 'duello' ? (
        <Duel m={m} />
      ) : proposal === 'mappa' ? (
        <MapStage m={m} painter={painter} />
      ) : proposal === 'carri' ? (
        <TankStage m={m} painter={painter} />
      ) : (
        <>
          <div className="bt-veil light" />
          <Box m={m} />
        </>
      )}
    </div>
  );
}
