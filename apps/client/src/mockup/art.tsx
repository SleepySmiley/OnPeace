/**
 * Pezzi della carta dell'obiettivo: la mappa in piccolo con i continenti da prendere, le pedine
 * da contare, la pedina del giocatore da eliminare e i dati che servono per giocare.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import type { BoardDef } from '@onpeace/engine';
import { shade } from '../board/common';
import { geometryAt, type BoardGeometry } from '../board/geometry';
import { CONTINENT } from '../board/styles/classico';

export type Skin = 'classico' | 'vetro';

/** L'obiettivo come lo serve la carta: il tipo, i numeri e la frase. */
export type ObjectiveInfo =
  | { kind: 'continents'; continents: string[]; plusAny: number; text: string }
  | { kind: 'territories'; count: number; minArmies: number | null; text: string }
  | { kind: 'eliminate'; target: { name: string; color: string }; fallback: number; text: string }
  | { kind: 'conquest'; text: string };

/** Colore di un continente bersaglio nella carta. */
export const targetColor = (skin: Skin, continent: string) => (skin === 'classico' ? (CONTINENT[continent] ?? '#bbbbbb') : '#2f8cff');

// ---------------------------------------------------------------- mappa in piccolo
interface MapProps {
  geo: BoardGeometry;
  skin: Skin;
  /** Continenti da prendere: pieni. */
  targets?: readonly string[];
  /** Continenti tra cui sceglierne altri: tratteggiati. */
  choice?: readonly string[];
  /** Solo questo continente, su fondo trasparente (per gli strati che si accendono uno alla volta). */
  only?: string;
  /** Terre più spente, per metterci sopra le pedine. */
  faded?: boolean;
  className?: string;
  style?: CSSProperties;
}

const VARIANTS = [0, 0.08, -0.06, 0.14, -0.1];

function paintMap(ctx: CanvasRenderingContext2D, p: MapProps, w: number, h: number, dpr: number) {
  const { geo, skin } = p;
  const classic = skin === 'classico';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  // la mappa riempie il riquadro (si perde un po' di oceano ai lati)
  const fit = Math.max(w / geo.width, h / geo.height);
  const ox = (w - geo.width * fit) / 2;
  const oy = (h - geo.height * fit) / 2;
  const g = geometryAt(geo, fit);
  const toMap = () => ctx.setTransform(dpr * fit, 0, 0, dpr * fit, dpr * ox, dpr * oy);
  const px = 1 / fit;

  if (!p.only) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sea = ctx.createLinearGradient(0, 0, 0, h);
    if (classic) {
      sea.addColorStop(0, '#b7d4dc');
      sea.addColorStop(1, '#9cc0cc');
    } else {
      sea.addColorStop(0, '#12161d');
      sea.addColorStop(1, '#0b0e13');
    }
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, w, h);
  }

  toMap();
  const targets = new Set(p.only ? [p.only] : (p.targets ?? []));
  const choice = new Set(p.choice ?? []);
  const counter = new Map<string, number>();
  const land = classic ? (p.faded ? '#e2d7ba' : '#ece2c6') : p.faded ? '#22252c' : '#2b2f37';

  // terre: i bersagli nel loro colore, ognuno un po' diverso dal vicino; le altre neutre
  for (const t of g.board.territories) {
    const k = counter.get(t.continent) ?? 0;
    counter.set(t.continent, k + 1);
    const hit = targets.has(t.continent);
    if (p.only && !hit) continue;
    const path = g.paths.get(t.id)!;
    if (hit) {
      ctx.fillStyle = shade(targetColor(skin, t.continent), VARIANTS[k % VARIANTS.length]! * (classic ? 1 : 0.6));
      if (!classic) {
        ctx.shadowColor = 'rgba(47, 140, 255, 0.75)';
        ctx.shadowBlur = 9 * dpr;
      }
    } else ctx.fillStyle = land;
    ctx.fill(path, 'evenodd');
    ctx.shadowBlur = 0;
  }

  // continenti a scelta: tratteggio
  if (!p.only && choice.size > 0) {
    const area = new Path2D();
    for (const t of g.board.territories) if (choice.has(t.continent)) area.addPath(g.paths.get(t.id)!);
    ctx.save();
    ctx.clip(area, 'evenodd');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = classic ? 'rgba(43, 34, 25, 0.45)' : 'rgba(100, 210, 255, 0.55)';
    ctx.lineWidth = 1;
    for (let x = -h; x < w; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.restore();
    toMap();
  }

  // confini e coste
  for (const b of g.borders) {
    const hit = targets.has(g.continentOf.get(b.a)!) || targets.has(g.continentOf.get(b.b)!);
    if (p.only && !hit) continue;
    ctx.lineWidth = (hit ? 0.8 : 0.5) * px;
    ctx.strokeStyle = classic ? (hit ? 'rgba(43, 34, 25, 0.75)' : 'rgba(43, 34, 25, 0.25)') : hit ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.06)';
    ctx.stroke(b.path);
  }
  if (!p.only) {
    ctx.lineWidth = 0.7 * px;
    ctx.strokeStyle = classic ? 'rgba(43, 34, 25, 0.6)' : 'rgba(255, 255, 255, 0.16)';
    ctx.stroke(g.coast);
  }
}

export function MiniMap(props: MapProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { geo, skin, only, faded } = props;
  const targets = (props.targets ?? []).join();
  const choice = (props.choice ?? []).join();
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      paintMap(canvas.getContext('2d')!, latest.current, w, h, dpr);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [geo, skin, only, faded, targets, choice]);
  return <canvas ref={ref} className={`mini-map ${props.className ?? ''}`} style={props.style} aria-hidden />;
}

// ---------------------------------------------------------------- pedine
/** Tante pedine quante i territori da tenere (a pile di `stack` se ci vogliono più armate). */
export function TokenField({ count, stack = 1, color, delay = 0 }: { count: number; stack?: number; color: string; delay?: number }) {
  return (
    <div className="token-field" style={{ ['--tok' as string]: color }} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`tok${stack > 1 ? ' tok-stack' : ''}`} style={{ animationDelay: `${delay + i * 28}ms` }} />
      ))}
    </div>
  );
}

/** La pedina del giocatore da eliminare, nel mirino. */
export function TargetToken({ name, color }: { name: string; color: string }) {
  return (
    <div className="target-token" aria-hidden>
      <span className="target-sight">
        <span className="tok tok-big" style={{ ['--tok' as string]: color }} />
      </span>
      <span className="target-name">{name}</span>
    </div>
  );
}

// ---------------------------------------------------------------- dati
interface FactsProps {
  info: ObjectiveInfo;
  board: BoardDef;
  skin: Skin;
  /** In fila (fascia sotto la mappa) invece che in tabella. */
  inline?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** I numeri che servono per giocare l'obiettivo: territori e bonus dei continenti, armate, bersaglio. */
export function Facts({ info, board, skin, inline = false }: FactsProps) {
  const total = board.territories.length;
  const count = (c: string) => board.territories.filter((t) => t.continent === c).length;
  type Row = { key: string; swatch?: string; hatch?: boolean; chip?: string; label: string; value: string; extra?: string };
  let rows: Row[];
  if (info.kind === 'continents') {
    rows = info.continents.map((id) => {
      const c = board.continents.find((x) => x.id === id)!;
      return { key: id, swatch: targetColor(skin, id), label: c.name, value: plural(count(id), 'territorio', 'territori'), extra: `+${c.bonus} a turno` };
    });
    if (info.plusAny > 0) {
      rows.push({ key: 'any', hatch: true, label: info.plusAny === 1 ? 'Un altro a scelta' : `Altri ${info.plusAny} a scelta`, value: 'quello che ti conviene' });
    }
  } else if (info.kind === 'territories') {
    rows = [{ key: 'n', label: 'Territori', value: `${info.count} su ${total}` }];
    if (info.minArmies) rows.push({ key: 'a', label: 'In ciascuno', value: `almeno ${plural(info.minArmies, 'armata', 'armate')}` });
  } else if (info.kind === 'eliminate') {
    rows = [
      { key: 't', chip: info.target.color, label: 'Bersaglio', value: info.target.name },
      { key: 'f', label: 'Se lo batte un altro', value: `${info.fallback} territori` },
    ];
  } else {
    rows = [
      { key: 'n', label: 'Territori', value: `tutti i ${total}` },
      { key: 'p', label: 'Avversari', value: 'tutti eliminati' },
    ];
  }

  const mark = (r: Row) =>
    r.swatch ? (
      <span className="fact-swatch" style={{ background: r.swatch }} />
    ) : r.hatch ? (
      <span className="fact-swatch hatch" />
    ) : r.chip ? (
      <span className="fact-swatch round" style={{ background: r.chip }} />
    ) : null;

  if (inline) {
    return (
      <ul className="facts-inline">
        {rows.map((r) => (
          <li key={r.key}>
            {mark(r)}
            <b>{r.label}</b> {r.value}
            {r.extra && <span className="fact-extra">, {r.extra}</span>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <table className="facts">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row">
              {mark(r)}
              {r.label}
            </th>
            <td>{r.value}</td>
            <td className="fact-extra">{r.extra ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** L'illustrazione dell'obiettivo: mappa con i bersagli, pedine da contare o pedina da eliminare. */
export function ObjectiveArt({ info, geo, skin, me, layered = false }: { info: ObjectiveInfo; geo: BoardGeometry; skin: Skin; me: string; layered?: boolean }) {
  const all = geo.board.continents.map((c) => c.id);
  if (info.kind === 'territories') {
    return (
      <>
        <MiniMap geo={geo} skin={skin} faded />
        <TokenField count={info.count} stack={info.minArmies ?? 1} color={me} delay={layered ? 700 : 1300} />
      </>
    );
  }
  if (info.kind === 'eliminate') {
    return (
      <>
        <MiniMap geo={geo} skin={skin} faded />
        <TargetToken name={info.target.name} color={info.target.color} />
      </>
    );
  }
  const targets = info.kind === 'conquest' ? all : info.continents;
  const choice = info.kind === 'continents' && info.plusAny > 0 ? all.filter((c) => !info.continents.includes(c)) : [];
  if (!layered) return <MiniMap geo={geo} skin={skin} targets={targets} choice={choice} />;
  // i bersagli si accendono uno alla volta sopra la mappa spenta
  return (
    <>
      <MiniMap geo={geo} skin={skin} choice={choice} />
      {targets.map((c, i) => (
        <MiniMap key={c} geo={geo} skin={skin} only={c} className="map-layer" style={{ animationDelay: `${500 + i * (info.kind === 'conquest' ? 140 : 320)}ms` }} />
      ))}
    </>
  );
}
