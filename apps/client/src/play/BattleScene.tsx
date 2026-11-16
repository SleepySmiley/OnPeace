/**
 * La scena della battaglia, sopra il tabellone: la camera vola sui due territori, i carri armati
 * (visti dall'alto) sono schierati su ciascuno, i dadi rotolano in primo piano, poi i carri si sparano (un colpo per
 * coppia di dadi: chi vince la coppia spara, il carro colpito esplode) e alla conquista entrano nel
 * territorio preso. I dadi sono cubi 3D che si fermano sulla faccia uscita; se le regole fanno
 * ritirare i pari, i dadi pari si illuminano e si ritirano prima della sparatoria. A colpi i dadi
 * non hanno numeri ma facce con lo scoppio (colpo) o lisce (a vuoto), e stanno su due file, una per
 * parte. A colpi, a turno, tira una parte alla
 * volta (prima chi difende): una fila sola, e spara solo chi ha tirato. Chi guarda una battaglia degli altri la
 * vede in piccolo in alto. Clic sulla scena: salta al risultato, poi chiude. Esc chiude.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { diceAfter, tiedPairs } from '@onpeace/conquista';
import type { BoardView } from '../board/common';
import type { BoardPainter } from '../board/painter';
import { Chip, Die } from './bits';
import { HitGlyph } from './hitface';
import { useSession } from '../store';
import { armiesAfter, shotsOf, shotTimes, useBattle, type Engagement, type Playing } from './battle';
import './battle.css';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

// ---------------------------------------------------------------- dado in 3D

/** Rotazione del cubo che porta la faccia `n` verso chi guarda. */
const FACE: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
/** Puntini di ogni faccia nella griglia 3×3 (0 in alto a sinistra). */
const PIPS: Record<number, number[]> = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** A coppie: vinto, perso, senza coppia, pari (prima di ritirarlo). A colpi: colpo (won) o a vuoto (lost). */
type DieState = 'won' | 'lost' | 'spare' | 'tie' | null;

/** Chi ha chiesto meno movimento al sistema: dadi e camera arrivano subito (le animazioni CSS le accorcia battle.css). */
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Die3D({
  value,
  side,
  size,
  roll,
  ms,
  from,
  state,
  delay = 0,
  hitOn,
}: {
  value: number;
  side: 'attack' | 'defense';
  size: number;
  /** Dado a colpi: le facce da questo numero in su hanno lo scoppio, le altre sono lisce (niente puntini). */
  hitOn?: number;
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
    // anche l'ultimo dado della fila si ferma entro il lancio (il ritardo si mangia un pezzo del volo);
    // chi chiede meno movimento vede subito il dado fermo
    const w = reducedMotion() ? 0 : Math.min(wait, dur * 0.35);
    const timing = { duration: reducedMotion() ? 1 : Math.max(60, dur - w), delay: w, fill: 'both' as const };
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
  const label = hitOn === undefined ? `${value}` : value >= hitOn ? 'colpo' : 'a vuoto';
  return (
    <div ref={box} className={`d3 ${side}${state ? ` ${state}` : ''}`} style={{ '--s': `${size}px` } as Vars} role="img" aria-label={label}>
      <div ref={shadow} className="d3-shadow" />
      <div ref={fly} className="d3-fly">
        <div ref={cube} className="d3-cube">
          <i className="d3-core c1" />
          <i className="d3-core c2" />
          <i className="d3-core c3" />
          {[1, 2, 3, 4, 5, 6].map((n) =>
            hitOn === undefined ? (
              <div key={n} className={`d3-face f${n}`}>
                {PIPS[n]!.map((cell) => (
                  <i key={cell} className="d3-pip" style={{ gridArea: `${Math.floor(cell / 3) + 1} / ${(cell % 3) + 1}` }} />
                ))}
              </div>
            ) : (
              <div key={n} className={`d3-face f${n} d3-bool`}>
                <svg viewBox="-12 -12 24 24" aria-hidden>
                  <HitGlyph hit={n >= hitOn} deep />
                </svg>
              </div>
            ),
          )}
        </div>
      </div>
      <div className="d3-mark" aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------- quello che si vede in ogni momento

interface Moment {
  eng: Engagement;
  p: Playing;
  roll: Engagement['rolls'][number] | null;
  /** Il tiro è già stato confrontato: perdite, vincitori e numeri nuovi si vedono. */
  resolved: boolean;
  /** Dadi mostrati adesso: il primo lancio, poi con i pari ritirati fin qui. */
  dice: { attack: number[]; defense: number[] };
  /** Coppie pari che stanno per essere ritirate (solo mentre si illuminano). */
  ties: number[];
  armies: { a: number; d: number };
  /** Perdite dall'inizio dello scontro. */
  total: { a: number; d: number };
  /** Colpi della sparatoria (true: spara chi attacca). */
  wins: boolean[];
  /** Esito finale, quando c'è. */
  result: { text: string; tone: 'good' | 'bad' | 'neutral'; conquered: boolean } | null;
  rollKey: string;
  me: string | null;
}

function moment(p: Playing, me: string | null): Moment {
  const { eng, shown, stage } = p;
  const roll = shown >= 0 ? (eng.rolls[shown] ?? null) : null;
  const resolved = stage !== 'intro' && stage !== 'throw' && stage !== 'tie' && stage !== 'reroll';
  const dice = roll ? diceAfter(roll, p.rr) : { attack: [], defense: [] };
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
    dice,
    ties: stage === 'tie' ? tiedPairs(dice.attack, dice.defense) : [],
    armies,
    total: { a: eng.a.armies - armies.a, d: eng.d.armies - armies.d },
    wins: roll ? shotsOf(roll) : [],
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
  const roll = m.roll;
  if (!roll) return null;
  if (m.ties.includes(i)) return 'tie';
  if (!m.resolved) return null;
  if (roll.hits) return i < roll.hits[side] ? 'won' : 'lost';
  if (i >= roll.won.length) return 'spare';
  const aWon = roll.won[i]!;
  return side === 'attack' ? (aWon ? 'won' : 'lost') : aWon ? 'lost' : 'won';
}

/** Ultimo lancio rifatto (1, 2…) che ha toccato questo dado fino al passo `rr`; 0 se è ancora quello del primo lancio. */
function rerolledAt(m: Moment, i: number): number {
  const list = m.roll?.rerolls ?? [];
  let at = 0;
  for (let k = 0; k < Math.min(m.p.rr, list.length); k++) if (!list[k]!.pairs || list[k]!.pairs!.includes(i)) at = k + 1;
  return at;
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

// ---------------------------------------------------------------- camera, dadi, barre

const TOPBAR = 52;
const LETTERBOX = 58;
/** Fila dei dadi in primo piano: sopra la barra nera in basso e la barra dei comandi. */
const TRAY_BOTTOM = 132;

interface Spots {
  a: [number, number];
  d: [number, number];
}

/** Vista di prima della prima battaglia di fila: ci si torna quando non ce ne sono altre in coda. */
let home: BoardView | null = null;
/** Vista verso cui la camera sta tornando: se una scena parte prima che arrivi, la vista di prima resta questa. */
let homing: BoardView | null = null;

const near = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;

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
  const id = p.eng.id;
  const from = p.eng.a.territory;
  const to = p.eng.d.territory;
  const { side, top, bottom } = margin;
  useEffect(() => {
    if (!painter) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // la camera del gioco prende il comando: un trascinamento in corso finisce qui
    painter.cancelDrag();
    // a metà di un volo (anche di ritorno) la vista di prima è dove arriva, non dove si trova adesso
    home ??= homing ?? painter.restingView();
    homing = null;
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
    let live = true;
    void painter.flyTo(view, reducedMotion() ? 0 : (useBattle.getState().playing?.ms ?? 700)).then(() => {
      // se il volo non è arrivato fin lì (fermato), la scena si rimette dove la mappa è davvero
      const a2 = painter.territoryOnScreen(from);
      const d2 = painter.territoryOnScreen(to);
      if (live && a2 && d2) setSpots((s) => (s && near(s.a, a2) && near(s.d, d2) ? s : { a: a2, d: d2 }));
    });
    return () => {
      live = false;
    };
  }, [painter, id, from, to, side, top, bottom, maxZoom, spread]);
  const leaving = p.stage === 'outro';
  useEffect(() => {
    // resta lì solo se dopo c'è un'altra scena grande: quelle piccole degli altri non muovono la camera
    const s = useBattle.getState();
    const bigNext = s.queue.some((e) => e.role !== 'spectator' || s.watch !== 'piccola');
    if (!leaving || !painter || !home || bigNext) return;
    // la vista di prima resta in `homing` finché la camera non ci arriva
    const target = home;
    home = null;
    homing = target;
    void painter.flyTo(target, reducedMotion() ? 0 : p.ms + 160).then(() => {
      if (homing === target) homing = null;
    });
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
  if (roll.volley) return <VolleyTray m={m} spots={spots} size={size} />;
  if (roll.hits) return <HitTray m={m} spots={spots} size={size} />;
  const trayY = window.innerHeight - TRAY_BOTTOM - size / 2;
  const pairW = size * 2 + 44;
  const gap = 40;
  const n = Math.max(m.dice.attack.length, m.dice.defense.length);
  const x0 = window.innerWidth / 2 - (n * pairW + (n - 1) * gap) / 2;
  const die = (side: 'attack' | 'defense', v: number, i: number) => {
    const x = x0 + i * (pairW + gap) + (side === 'attack' ? size / 2 : pairW - size / 2);
    const [sx, sy] = side === 'attack' ? spots.a : spots.d;
    // un dado ritirato si rilancia lì dov'è, gli altri restano fermi
    const again = rerolledAt(m, i);
    const from: [number, number] = again ? [0, -size * 2.2] : [sx - x, sy - trayY];
    return (
      <span key={`${side}${i}`} className="mp-die" style={{ left: x - size / 2, top: trayY - size / 2 }}>
        <Die3D
          value={v}
          side={side}
          size={size}
          roll={again ? `${m.rollKey}:${again}` : m.rollKey}
          ms={p.ms}
          from={from}
          delay={again ? (side === 'attack' ? 0 : 40) : (side === 'attack' ? 0 : 50) + i * 50}
          state={dieState(m, side, i)}
        />
      </span>
    );
  };
  const next = roll.rerolls?.[p.rr];
  return (
    <>
      <span className="mp-tray" style={{ left: x0 - 18, width: n * pairW + (n - 1) * gap + 36, top: trayY - size / 2 - 14, height: size + 28 }} />
      {Array.from({ length: n - 1 }, (_, i) => (
        <span key={`sep${i}`} className="mp-sep" style={{ left: x0 + (i + 1) * (pairW + gap) - gap / 2, top: trayY - size / 2 - 2, height: size + 4 }} />
      ))}
      {m.dice.attack.map((v, i) => die('attack', v, i))}
      {m.dice.defense.map((v, i) => die('defense', v, i))}
      {m.ties.map((i) => (
        <span key={`${m.rollKey}-${p.rr}-t${i}`} className="mp-clash tie" style={{ left: x0 + i * (pairW + gap) + pairW / 2, top: trayY }}>
          =
        </span>
      ))}
      {m.ties.length > 0 && next && (
        <span key={`${m.rollKey}-${p.rr}-tl`} className="mp-tie-label" style={{ left: window.innerWidth / 2, top: trayY - size / 2 - 30 }}>
          {next.pairs ? (m.ties.length === 1 ? 'Pari: si ritira' : 'Pari: si ritirano') : 'Pari: si ritira tutto il lancio'}
        </span>
      )}
      {m.resolved &&
        roll.won.map((aWon, i) => (
          <span key={`${m.rollKey}-${i}`} className={`mp-clash ${aWon ? 'a' : 'd'}`} style={{ left: x0 + i * (pairW + gap) + pairW / 2, top: trayY }}>
            {aWon ? '›' : '‹'}
          </span>
        ))}
    </>
  );
}

/** A colpi: da che faccia in su colpisce un dado di chi attacca e di chi difende, dalle regole della partita. */
function useHitOn(): Record<'attack' | 'defense', number> {
  const h = useSession((s) => s.online.lobby?.rules.dice.hits);
  return { attack: h?.attackOn ?? 4, defense: h?.defenseOn ?? 4 };
}

/** A colpi: due file, chi attacca a sinistra e chi difende a destra; i colpi sono i primi verso il centro. */
function HitTray({ m, spots, size }: { m: Moment; spots: Spots; size: number }) {
  const { roll, p } = m;
  const hitOn = useHitOn();
  if (!roll?.hits) return null;
  const nA = m.dice.attack.length;
  const nD = m.dice.defense.length;
  const mid = 70;
  // fino a 18 dadi: si rimpiccioliscono per stare nella larghezza
  const s = Math.min(size, (window.innerWidth * 0.86 - mid) / Math.max(1, nA + nD) / 1.4);
  const step = s * 1.4;
  const trayY = window.innerHeight - TRAY_BOTTOM - s / 2;
  const cx = window.innerWidth / 2;
  const xOf = (side: 'attack' | 'defense', i: number) => (side === 'attack' ? cx - mid / 2 - (i + 0.5) * step : cx + mid / 2 + (i + 0.5) * step);
  const die = (side: 'attack' | 'defense', v: number, i: number) => {
    const x = xOf(side, i);
    const [sx, sy] = side === 'attack' ? spots.a : spots.d;
    return (
      <span key={`${side}${i}`} className="mp-die" style={{ left: x - s / 2, top: trayY - s / 2 }}>
        <Die3D
          value={v}
          side={side}
          size={s}
          roll={m.rollKey}
          ms={p.ms}
          from={[sx - x, sy - trayY]}
          delay={(side === 'attack' ? 0 : 50) + i * 30}
          state={dieState(m, side, i)}
          hitOn={hitOn[side]}
        />
      </span>
    );
  };
  const left = cx - mid / 2 - nA * step;
  const width = (nA + nD) * step + mid;
  const count = (n: number) => (n === 0 ? 'nessun colpo' : n === 1 ? '1 colpo' : `${n} colpi`);
  return (
    <>
      <span className="mp-tray" style={{ left: left - 18, width: width + 36, top: trayY - s / 2 - 14, height: s + 28 }} />
      <span className="mp-sep" style={{ left: cx, top: trayY - s / 2 - 2, height: s + 4 }} />
      {m.dice.attack.map((v, i) => die('attack', v, i))}
      {m.dice.defense.map((v, i) => die('defense', v, i))}
      {m.resolved && (
        <>
          <span key={`${m.rollKey}-ha`} className="mp-hits a" style={{ left: cx - mid / 2 - (nA * step) / 2, top: trayY + s / 2 + 22 }}>
            {count(roll.hits.attack)}
          </span>
          <span key={`${m.rollKey}-hd`} className="mp-hits d" style={{ left: cx + mid / 2 + (nD * step) / 2, top: trayY + s / 2 + 22 }}>
            {count(roll.hits.defense)}
          </span>
        </>
      )}
    </>
  );
}

/**
 * A colpi, a turno: tira una parte sola. Una fila al centro, i dadi partono dal territorio di chi
 * tira; sopra si legge chi tira, sotto quanti colpi ha fatto.
 */
function VolleyTray({ m, spots, size }: { m: Moment; spots: Spots; size: number }) {
  const { roll, p } = m;
  const hitOn = useHitOn();
  if (!roll?.volley || !roll.hits) return null;
  const side = roll.volley;
  const values = side === 'attack' ? m.dice.attack : m.dice.defense;
  const n = values.length;
  const s = Math.min(size, (window.innerWidth * 0.7) / Math.max(1, n) / 1.4);
  const step = s * 1.4;
  const trayY = window.innerHeight - TRAY_BOTTOM - s / 2;
  const cx = window.innerWidth / 2;
  const x0 = cx - (n * step) / 2;
  const [sx, sy] = side === 'attack' ? spots.a : spots.d;
  const who = nameOf(m, side === 'attack' ? 'a' : 'd');
  const label = who === 'Tu' ? `Tiri tu, in ${side === 'attack' ? 'attacco' : 'difesa'}` : `Tira chi ${side === 'attack' ? 'attacca' : 'difende'} · ${who}`;
  const hits = roll.hits[side];
  const tone = side === 'attack' ? 'a' : 'd';
  return (
    <>
      <span className="mp-tray" style={{ left: x0 - 18, width: n * step + 36, top: trayY - s / 2 - 14, height: s + 28 }} />
      <span key={`${m.rollKey}-who`} className={`mp-hits mp-turn ${tone}`} style={{ left: cx, top: trayY - s / 2 - 34 }}>
        {label}
      </span>
      {values.map((v, i) => {
        const x = x0 + (i + 0.5) * step;
        return (
          <span key={`${side}${i}`} className="mp-die" style={{ left: x - s / 2, top: trayY - s / 2 }}>
            <Die3D
              value={v}
              side={side}
              size={s}
              roll={m.rollKey}
              ms={p.ms}
              from={[sx - x, sy - trayY]}
              delay={i * 30}
              state={dieState(m, side, i)}
              hitOn={hitOn[side]}
            />
          </span>
        );
      })}
      {m.resolved && (
        <span key={`${m.rollKey}-h`} className={`mp-hits ${tone}`} style={{ left: cx, top: trayY + s / 2 + 22 }}>
          {hits === 0 ? 'nessun colpo' : hits === 1 ? '1 colpo' : `${hits} colpi`}
        </span>
      )}
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

// ---------------------------------------------------------------- carri armati

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

/** Posti della formazione: file da tre perpendicolari alla direzione del nemico, la prima verso di lui. `u` punta al nemico. */
function slotsFor(center: Pt, u: Pt, n: number): Pt[] {
  const [cx, cy] = center;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / TANK_COLS);
    const inRow = Math.min(TANK_COLS, n - r * TANK_COLS);
    const off = (i % TANK_COLS) - (inRow - 1) / 2;
    out.push([cx - u[0] * r * 58 - u[1] * off * 52, cy - u[1] * r * 58 + u[0] * off * 52]);
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

/** Un carro armato visto dall'alto, disegnato da zero: scafo, cingoli e la torretta che ruota verso il bersaglio. */
function TankShape() {
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
  const slotsA = slotsFor(centerA, uA, fleetA.length);
  const slotsD = slotsFor(centerD, uD, fleetD.length);
  // conquista: i primi carri entrano nel territorio preso
  const taking = m.result?.conquered === true;
  const enter = taking ? slotsFor(spots.d, uA, Math.min(3, fleetA.length)) : [];

  // la sparatoria: un colpo per coppia di dadi, chi vince la coppia spara
  const shots: Shot[] = [];
  if (firing && roll) {
    const times = shotTimes(p.ms, m.wins.length);
    let hitA = 0;
    let hitD = 0;
    let firedA = 0;
    let firedD = 0;
    m.wins.forEach((aWon, i) => {
      const side = aWon ? 'a' : 'd';
      const own = aWon ? slotsA : slotsD;
      const enemy = aWon ? slotsD : slotsA;
      if (own.length === 0 || enemy.length === 0) return;
      // a coppie spara il carro della coppia; a colpi uno dopo l'altro, per parte
      const nth = roll.hits ? (aWon ? firedA++ : firedD++) : i;
      const shooter = Math.min(nth, own.length - 1);
      // a colpi possono cadere più armate dei carri in campo: gli ultimi colpi vanno sull'ultimo carro
      const target = Math.min(aWon ? hitD++ : hitA++, enemy.length - 1);
      shots.push({ from: own[shooter]!, to: enemy[target]!, ...times[i]!, shooter, target, side });
    });
  }

  const tank = (side: 'a' | 'd', id: number, i: number, pos: Pt) => {
    const u = side === 'a' ? uA : uD;
    const mine = shots.filter((s) => s.side === side && s.shooter === i);
    const hitBy = shots.find((s) => s.side !== side && s.target === i);
    const shot = mine[0];
    // il carro guarda il nemico, la torretta punta il bersaglio quando spara
    const hull = deg(u);
    const aim = shot ? deg(unit(shot.from, shot.to)) - hull : 0;
    const target = taking && side === 'a' && i < enter.length ? enter[i]! : pos;
    const style = {
      left: target[0],
      top: target[1],
      zIndex: Math.round(target[1]),
      '--c': side === 'a' ? eng.a.color : eng.d.color,
      '--hull': `${hull}deg`,
      '--aim': `${aim}deg`,
      '--fire': `${shot?.fire ?? 0}ms`,
      '--hit': `${hitBy?.hit ?? 0}ms`,
      '--back': `${-u[0] * 60}px, ${-u[1] * 60}px`,
      // quelli schierati all'inizio arrivano quando la camera è quasi ferma; le riserve subito
      '--enter': `${id < Math.min(side === 'a' ? eng.a.armies : eng.d.armies, TANKS_MAX) ? (eng.again ? 150 : 700) : 0}ms`,
    } as Vars;
    const cls = ['tk', side === 'a' ? 'att' : 'def', shot ? 'firing' : '', hitBy ? 'hit' : '', taking && side === 'a' && i < enter.length ? 'moving' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <span key={`${side}${id}`} className={cls} style={style}>
        <span className="tk-body" key={shot || hitBy ? m.rollKey : 'calm'}>
          <TankShape />
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
    // a turno la targa di chi tira si accende
    const turn = !took && !m.result && roll?.volley === (side === 'a' ? 'attack' : 'defense');
    return (
      <span className={`tk-plate ${side === 'a' ? 'att' : 'def'}${turn ? ' turn' : ''}`} style={{ left: x, top: y, '--c': color } as Vars}>
        <Chip color={color} />
        <span className="mp-tag-name">{f.place}</span>
        {took ? <span className="tk-plate-new">preso</span> : <Count value={side === 'a' ? m.armies.a : m.armies.d} loss={loss} k={m.rollKey} />}
      </span>
    );
  };

  return (
    <div className="mp-wrap tk-wrap" style={spotlight(spots, 60)}>
      <div className="mp-light" />
      {fleetA.map((id, i) => tank('a', id, i, slotsA[i]!))}
      {fleetD.map((id, i) => tank('d', id, i, slotsD[i]!))}
      {shots.map((s, i) => {
        const dx = s.to[0] - s.from[0];
        const dy = s.to[1] - s.from[1];
        return (
          <span key={`${m.rollKey}-s${i}`}>
            <span
              className="tk-shell"
              style={{ left: s.from[0], top: s.from[1], '--dx': `${dx}px`, '--dy': `${dy}px`, '--fire': `${s.fire}ms`, '--flight': `${s.hit - s.fire}ms`, '--rot': `${deg([dx, dy])}deg` } as Vars}
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

// ---------------------------------------------------------------- chi guarda, in piccolo

function Small({ m }: { m: Moment }) {
  const { eng, roll } = m;
  const hitOn = useHitOn();
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
              {m.dice.attack.map((v, i) => (
                <Die key={i} value={v} side="attack" size={roll.hits ? 18 : 24} lost={dieState(m, 'attack', i) === 'lost'} hitOn={roll.hits ? hitOn.attack : undefined} />
              ))}
            </span>
            <span className="dim">·</span>
            <span className="dice">
              {m.dice.defense.map((v, i) => (
                <Die key={i} value={v} side="defense" size={roll.hits ? 18 : 24} lost={dieState(m, 'defense', i) === 'lost'} hitOn={roll.hits ? hitOn.defense : undefined} />
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
  const playing = useBattle((st) => st.playing);
  const me = useSession((st) => st.online.me);
  const m = useMemo(() => (playing ? moment(playing, me) : null), [playing, me]);

  // Esc chiude la scena grande e basta: in cattura, prima di GameScreen, che toglierebbe anche la scelta
  // dell'attacco e le armate non confermate (le scene piccole degli altri e l'uscita non lo prendono)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement;
      if (el.closest?.('textarea, select, input:not([type=range]):not([type=checkbox]):not([type=radio])')) return;
      // un pannello aperto sopra la scena (guida, carte, Aspetto, Suoni) si prende lui l'Esc
      if (document.querySelector('.modal-backdrop, .hand-table-veil, .menu-pop, .sound-pop')) return;
      const p = useBattle.getState().playing;
      if (!p || p.small || p.stage === 'outro') return;
      useBattle.getState().close();
      // "fino in fondo": si ferma (altrimenti il tiro dopo riaprirebbe la scena); la scelta resta, Invio riattacca
      const session = useSession.getState();
      if (p.eng.role === 'attacker' && session.draft.blitz) session.stopBlitz();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // lasciando la partita a metà di una scena la camera non torna: la vista di prima non vale più
  useEffect(
    () => () => {
      home = null;
      homing = null;
    },
    [],
  );

  if (!m) return null;
  const small = m.p.small;
  const style = { '--ms': `${m.p.ms}ms` } as Vars;
  return (
    <div
      className={`bt-layer bt-${small ? 'small' : 'carri'} st-${m.p.stage}${m.p.pace === 'quick' ? ' quick' : ''} role-${m.eng.role}`}
      style={style}
      onClick={small ? undefined : () => useBattle.getState().skip()}
      aria-live="polite"
    >
      {/* ogni scontro ha la sua scena: la camera vola, i carri e le barre entrano da capo */}
      {small ? <Small m={m} /> : <TankStage key={m.eng.id} m={m} painter={painter} />}
    </div>
  );
}
