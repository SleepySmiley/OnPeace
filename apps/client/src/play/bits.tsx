/** Pezzi grafici piccoli: dadi, simboli delle carte, carte, segnalino del giocatore. */
import type { Card } from '@onpeace/conquista';
import { SYMBOL_NAME } from './describe';

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** Un dado: `side` attacco o difesa (colori diversi), `lost` se ha perso il confronto. */
export function Die({ value, side, lost, size = 30 }: { value: number; side: 'attack' | 'defense'; lost?: boolean; size?: number }) {
  return (
    <svg className={`die ${side}${lost ? ' lost' : ''}`} width={size} height={size} viewBox="-12 -12 24 24" role="img" aria-label={`${value}`}>
      <rect x={-11} y={-11} width={22} height={22} rx={5} className="die-face" />
      {PIPS[value]?.map(([x, y], i) => <circle key={i} cx={x * 5.4} cy={y * 5.4} r={2.1} className="die-pip" />)}
    </svg>
  );
}

/** Simboli delle carte, disegnati da zero: elmetto, ferro di cavallo, cannone, stella. */
export function SymbolIcon({ symbol, size = 22 }: { symbol: Card['symbol']; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, className: 'symbol' } as const;
  switch (symbol) {
    case 'infantry':
      return (
        <svg {...common}>
          <path d="M4 15.5c0-5 3.6-8.5 8-8.5s8 3.5 8 8.5z" fill="currentColor" />
          <rect x="2.5" y="15" width="19" height="2.6" rx="1.3" fill="currentColor" />
          <path d="M8.5 9.5c1-.9 2.2-1.3 3.5-1.3" stroke="var(--card-bg, #fff)" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.6" />
        </svg>
      );
    case 'cavalry':
      return (
        <svg {...common}>
          <path
            d="M6 20V11a6 6 0 0 1 12 0v9h-3.4v-9a2.6 2.6 0 0 0-5.2 0v9z"
            fill="currentColor"
          />
          <circle cx="7.7" cy="17.6" r="0.9" fill="var(--card-bg, #fff)" />
          <circle cx="16.3" cy="17.6" r="0.9" fill="var(--card-bg, #fff)" />
          <circle cx="7.7" cy="13.4" r="0.9" fill="var(--card-bg, #fff)" />
          <circle cx="16.3" cy="13.4" r="0.9" fill="var(--card-bg, #fff)" />
        </svg>
      );
    case 'artillery':
      return (
        <svg {...common}>
          <rect x="7" y="7.2" width="14" height="4.4" rx="2.2" transform="rotate(-18 14 9.4)" fill="currentColor" />
          <circle cx="8.6" cy="16" r="4.6" fill="currentColor" />
          <circle cx="8.6" cy="16" r="1.6" fill="var(--card-bg, #fff)" />
          <rect x="3" y="19.6" width="13" height="1.8" rx="0.9" fill="currentColor" />
        </svg>
      );
    case 'joker':
      return (
        <svg {...common}>
          <path d="M12 2.8l2.6 6 6.5.5-5 4.2 1.6 6.4L12 16.4l-5.7 3.5 1.6-6.4-5-4.2 6.5-.5z" fill="currentColor" />
        </svg>
      );
  }
}

/** Una carta territorio (o jolly). */
export function CardView({
  card,
  territory,
  owned,
  chosen,
  onClick,
}: {
  card: Card;
  territory: string | null;
  /** Mostra un territorio mio: vale armate in più nel tris. */
  owned?: boolean;
  chosen?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <SymbolIcon symbol={card.symbol} size={26} />
      <span className="card-name">{card.symbol === 'joker' ? 'Jolly' : territory}</span>
      <span className="card-kind">{SYMBOL_NAME[card.symbol]}</span>
      {owned && <span className="card-owned" title="Mostra un tuo territorio: armate in più nel tris" />}
    </>
  );
  const cls = `card${card.symbol === 'joker' ? ' joker' : ''}${chosen ? ' chosen' : ''}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-pressed={chosen}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Segnalino colorato di un giocatore. */
export function Chip({ color, title }: { color: string; title?: string }) {
  return <span className="chip" style={{ ['--c' as string]: color }} title={title} />;
}
