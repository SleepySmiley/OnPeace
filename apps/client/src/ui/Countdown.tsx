import { useEffect, useState } from 'react';
import type { PauseInfo } from '../game/store';

const clock = (ms: number) => {
  const left = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
};

/** Tempo rimasto fino a `deadline` (ms, orologio locale), aggiornato ogni secondo; o il tempo fermo. */
export function Countdown({ deadline, paused = null }: { deadline: number | null; paused?: PauseInfo | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (paused) {
    return (
      <span
        className="countdown num paused"
        title={paused.reason === 'host' ? 'Tempo fermato dall’host' : 'Partita ferma per un errore del server'}
      >
        ❚❚ {clock(paused.remainingMs)}
      </span>
    );
  }
  if (deadline === null) return null;
  const left = deadline - now;
  return (
    <span className={`countdown num ${left <= 15_000 ? 'urgent' : ''}`} title="Tempo rimasto">
      {clock(left)}
    </span>
  );
}
