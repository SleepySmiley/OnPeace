/**
 * Andamento della partita turno per turno (grafico a linee, un asse, linee da 2px).
 * Regole dalla skill dataviz: legenda sempre presente con ≥2 serie, etichette dirette
 * fino a 4 serie, mirino che aggancia il turno con un'unica scheda per tutte le serie,
 * griglia discreta, testi nei colori del testo (mai in quello della serie), tabella dei valori.
 */
import { useMemo, useState } from 'react';
import type { GameState, PlayerStats } from '@onpeace/engine';

export type Metric = keyof PlayerStats;

export const METRIC_LABEL: Record<Metric, string> = {
  cities: 'Città',
  score: 'Punti',
  income: 'Reddito',
  units: 'Unità',
  money: 'Fondi',
};

const fmt = new Intl.NumberFormat('it-IT');

/** Scala "tonda" da 0 a un massimo leggibile. */
function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 4, step: 1 };
  const raw = v / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return { max: Math.ceil(v / step) * step, step };
}

interface Props {
  game: GameState;
  metrics: Metric[];
  width: number;
  height?: number;
}

export function StatsChart({ game, metrics, width, height = 220 }: Props) {
  const [metric, setMetric] = useState<Metric>(metrics[0]!);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const history = game.history ?? [];
  const players = game.players;

  const pad = { top: 10, right: players.length <= 4 ? 78 : 14, bottom: 26, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const series = useMemo(
    () =>
      players.map((p) => ({
        player: p,
        values: history.map((h) => h.players[p.id]?.[metric] ?? null),
      })),
    [players, history, metric],
  );

  if (history.length < 2) {
    return <p className="placeholder">Il grafico compare dopo il secondo turno.</p>;
  }

  const maxV = Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const { max, step } = niceMax(maxV);
  const x = (i: number) => pad.left + (plotW * i) / (history.length - 1);
  const y = (v: number) => pad.top + plotH - (plotH * v) / max;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const xEvery = Math.max(1, Math.ceil(history.length / 8));

  // etichette dirette a fine linea, spostate per non sovrapporsi
  const ends = series
    .map((s) => {
      const last = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null);
      const v = s.values[last];
      return v === null || v === undefined ? null : { s, yPos: y(v), i: last };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.yPos - b.yPos);
  for (let k = 1; k < ends.length; k++) {
    if (ends[k]!.yPos - ends[k - 1]!.yPos < 13) ends[k]!.yPos = ends[k - 1]!.yPos + 13;
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * plotW;
    setHoverIdx(Math.max(0, Math.min(history.length - 1, Math.round((px / plotW) * (history.length - 1)))));
  };

  const hoverTurn = hoverIdx !== null ? history[hoverIdx] : null;

  return (
    <div className="chart">
      {metrics.length > 1 && (
        <div className="segmented" role="group" aria-label="Misura">
          {metrics.map((m) => (
            <button key={m} type="button" className={m === metric ? 'active' : ''} onClick={() => setMetric(m)}>
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      )}
      <ul className="chart-legend" aria-label="Legenda">
        {players.map((p) => (
          <li key={p.id}>
            <span className="legend-line" style={{ background: p.color }} />
            {p.name}
          </li>
        ))}
      </ul>
      <div className="chart-plot" style={{ width, height }}>
        <svg width={width} height={height} role="img" aria-label={`${METRIC_LABEL[metric]} per turno`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + plotW} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.left - 6} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">
                {fmt.format(t)}
              </text>
            </g>
          ))}
          {history.map((h, i) =>
            i % xEvery === 0 || i === history.length - 1 ? (
              <text key={h.turn} x={x(i)} y={height - 8} className="axis" textAnchor="middle">
                {h.turn}
              </text>
            ) : null,
          )}
          {series.map(({ player, values }) => {
            const pts = values
              .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
              .filter((p): p is string => p !== null);
            return (
              <polyline
                key={player.id}
                points={pts.join(' ')}
                fill="none"
                stroke={player.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
          {players.length <= 4 &&
            ends.map(({ s, yPos, i }) => (
              <g key={s.player.id}>
                <circle cx={x(i)} cy={y(s.values[i]!)} r={3} fill={s.player.color} />
                <text x={x(i) + 8} y={yPos} className="end-label" dominantBaseline="middle">
                  {s.player.name}
                </text>
              </g>
            ))}
          {hoverIdx !== null && (
            <g>
              <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={pad.top} y2={pad.top + plotH} className="crosshair" />
              {series.map(({ player, values }) =>
                values[hoverIdx] === null || values[hoverIdx] === undefined ? null : (
                  <circle
                    key={player.id}
                    cx={x(hoverIdx)}
                    cy={y(values[hoverIdx]!)}
                    r={4}
                    fill={player.color}
                    stroke="var(--panel-solid)"
                    strokeWidth={2}
                  />
                ),
              )}
            </g>
          )}
          <rect
            x={pad.left}
            y={pad.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIdx(null)}
          />
        </svg>
        {hoverTurn && hoverIdx !== null && (
          <div
            className="chart-tip"
            style={{ left: Math.min(x(hoverIdx) + 12, width - 150), top: pad.top }}
            role="status"
          >
            <div className="dim">Turno {hoverTurn.turn}</div>
            {series
              .map(({ player, values }) => ({ player, v: values[hoverIdx] }))
              .filter((r) => r.v !== null && r.v !== undefined)
              .sort((a, b) => b.v! - a.v!)
              .map(({ player, v }) => (
                <div key={player.id} className="tip-row">
                  <span className="legend-line" style={{ background: player.color }} />
                  <b className="num">{fmt.format(v!)}</b>
                  <span className="dim">{player.name}</span>
                </div>
              ))}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Tabella dei valori</summary>
        <table>
          <thead>
            <tr>
              <th>Turno</th>
              {players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.turn}>
                <td className="num">{h.turn}</td>
                {players.map((p) => (
                  <td key={p.id} className="num">
                    {h.players[p.id] ? fmt.format(h.players[p.id]![metric]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
