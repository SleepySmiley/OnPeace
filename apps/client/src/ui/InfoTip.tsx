import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Ritardo prima di aprire la scheda: passando veloci sulla lista non si apre nulla. */
const OPEN_DELAY = 140;

/**
 * Riga di elenco con una piccola scheda che si apre accanto al pannello passandoci sopra
 * (o arrivandoci con la tastiera). La scheda si costruisce solo quando serve.
 */
export function TipRow({ tip, children }: { tip: (() => ReactNode) | null; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const row = ref.current?.getBoundingClientRect();
      if (!row) return;
      // accanto al pannello (non sopra la riga), all'altezza della riga
      const panel = ref.current?.closest('.panel')?.getBoundingClientRect();
      setAt({ x: (panel?.right ?? row.right) + 10, y: row.top - 6 });
    }, OPEN_DELAY);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setAt(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <li ref={ref} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {at && tip && createPortal(<TipCard x={at.x} y={at.y}>{tip()}</TipCard>, document.body)}
    </li>
  );
}

/** La scheda, tenuta dentro la finestra. */
function TipCard({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(y);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(8, Math.min(y, window.innerHeight - h - 12)));
  }, [y]);
  return (
    <div ref={ref} className="tip-card" role="tooltip" style={{ left: x, top }}>
      {children}
    </div>
  );
}
