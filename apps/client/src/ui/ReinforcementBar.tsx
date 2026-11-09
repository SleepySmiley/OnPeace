/** Rinforzi disponibili su quota piena: una tacca per unità (barra continua se sono tante). */
export function ReinforcementBar({ available, quota }: { available: number; quota: number }) {
  const label = `${available} rinforzi disponibili su ${quota}`;
  if (quota <= 0) return null;
  if (quota > 14) {
    return (
      <span className="rf-bar continuous" role="img" aria-label={label}>
        <span style={{ width: `${Math.min(100, (available / quota) * 100)}%` }} />
      </span>
    );
  }
  return (
    <span className="rf-bar" role="img" aria-label={label}>
      {Array.from({ length: quota }, (_, i) => (
        <span key={i} className={i < available ? 'on' : ''} />
      ))}
    </span>
  );
}
