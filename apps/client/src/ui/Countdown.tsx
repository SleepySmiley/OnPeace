import { useEffect, useState } from 'react';
import type { PauseInfo } from '../store';

const clock = (ms: number) => {
  const left = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
};

/** Sotto questi secondi il tempo è agli sgoccioli (rosso). */
const URGENT_MS = 15_000;
/** Sotto questi secondi la barra avvisa che il turno sta per finire (ambra). */
const SOON_MS = 45_000;

interface Props {
  /** Scadenza (ms, orologio locale). */
  deadline: number | null;
  paused?: PauseInfo | null;
  /** Durata intera del turno in ms: se c'è, sotto la barra in alto scorre il tempo rimasto. */
  total?: number;
}

/** Tempo rimasto fino a `deadline`, aggiornato ogni mezzo secondo; o il tempo fermo. */
export function Countdown({ deadline, paused = null, total }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = paused ? paused.remainingMs : deadline === null ? null : deadline - now;
  const bar =
    total && left !== null ? (
      <span
        className={`turn-bar ${paused ? 'paused' : left <= URGENT_MS ? 'urgent' : left <= SOON_MS ? 'soon' : ''}`}
        style={{ width: `${Math.max(0, Math.min(1, left / total)) * 100}%` }}
        aria-hidden
      />
    ) : null;
  if (paused) {
    return (
      <>
        <span
          className="countdown num paused"
          title={paused.reason === 'host' ? 'Tempo fermato dall’host' : 'Partita ferma per un errore del server'}
        >
          ❚❚ {clock(paused.remainingMs)}
        </span>
        {bar}
      </>
    );
  }
  if (left === null) return null;
  return (
    <>
      <span className={`countdown num ${left <= URGENT_MS ? 'urgent' : ''}`} title="Tempo rimasto per la mossa">
        {clock(left)}
      </span>
      {bar}
    </>
  );
}
