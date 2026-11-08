import { useEffect, useState } from 'react';

/** Tempo rimasto fino a `deadline` (ms, orologio locale), aggiornato ogni secondo. */
export function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (deadline === null) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <span className={`countdown num ${left <= 15 ? 'urgent' : ''}`} title="Tempo rimasto">
      {mm}:{ss}
    </span>
  );
}
