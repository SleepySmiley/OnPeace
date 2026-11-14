/** Il tabellone dentro React: un canvas a tutto schermo guidato da BoardPainter. */
import { useEffect, useRef } from 'react';
import type { BoardState, BoardStyle } from './common';
import type { BoardGeometry } from './geometry';
import { BoardPainter, type Insets } from './painter';

interface Props {
  geo: BoardGeometry;
  style: BoardStyle;
  state: BoardState;
  insets: Insets;
  onHover?: (id: string | null) => void;
  onClick?: (id: string | null, how: { shift: boolean; right: boolean }) => void;
  onView?: () => void;
  /** Per chi deve chiedere al tabellone dove si trova un territorio sullo schermo. */
  painterRef?: (p: BoardPainter | null) => void;
}

export function BoardCanvas({ geo, style, state, insets, onHover, onClick, onView, painterRef }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<BoardPainter | null>(null);
  // i gestori cambiano a ogni disegno di React: il pittore chiama sempre gli ultimi
  const handlers = useRef({ onHover, onClick, onView });
  handlers.current = { onHover, onClick, onView };
  const first = useRef({ style, state, insets, painterRef });
  first.current = { style, state, insets, painterRef };

  useEffect(() => {
    const { style: s0, state: st0, insets: in0, painterRef: ref } = first.current;
    const p = new BoardPainter(canvas.current!, geo, s0, st0, {
      onHover: (id) => handlers.current.onHover?.(id),
      onClick: (id, how) => handlers.current.onClick?.(id, how),
      onView: () => handlers.current.onView?.(),
    });
    p.setInsets(in0);
    void p.setStyle(s0);
    painter.current = p;
    ref?.(p);
    return () => {
      p.destroy();
      painter.current = null;
      ref?.(null);
    };
  }, [geo]);

  useEffect(() => {
    painter.current?.setState(state);
  }, [state]);
  useEffect(() => {
    void painter.current?.setStyle(style);
  }, [style]);
  const { top, right, bottom, left } = insets;
  useEffect(() => {
    painter.current?.setInsets({ top, right, bottom, left });
  }, [top, right, bottom, left]);

  return <canvas ref={canvas} className="board-canvas" aria-label="Tabellone" />;
}
