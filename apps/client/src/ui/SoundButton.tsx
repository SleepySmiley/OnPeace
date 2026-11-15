import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sfx } from '../audio/sfx';

/** Altoparlante: barrato se muto, con un'onda o due secondo il volume. */
function SpeakerIcon({ muted, volume }: { muted: boolean; volume: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" stroke="none" />
      {muted || volume === 0 ? (
        <path d="M10.5 6l3.5 4M14 6l-3.5 4" strokeLinecap="round" />
      ) : (
        <>
          <path d="M10.3 6.2a2.6 2.6 0 0 1 0 3.6" strokeLinecap="round" />
          {volume > 0.45 && <path d="M12 4.6a5 5 0 0 1 0 6.8" strokeLinecap="round" />}
        </>
      )}
    </svg>
  );
}

/** Suoni: clic per aprire volume e muto (restano nel browser). */
export function SoundButton() {
  const settings = useSyncExternalStore(sfx.subscribe, sfx.getSettings);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const off = settings.muted || settings.volume === 0;

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    // in cattura, prima di GameScreen: l'Esc che chiude il menu non deve togliere anche le armate non confermate
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  return (
    <div className="sound" ref={box}>
      <button
        type="button"
        className={`ghost tiny sound-button ${off ? 'off' : ''}`}
        aria-label={off ? 'Suoni disattivati: impostazioni' : 'Suoni: impostazioni'}
        aria-expanded={open}
        title="Suoni"
        onClick={() => setOpen((o) => !o)}
      >
        <SpeakerIcon muted={settings.muted} volume={settings.volume} />
      </button>
      {open && (
        <div className="sound-pop panel" role="dialog" aria-label="Suoni">
          <label className="sound-row">
            <input
              type="checkbox"
              checked={!settings.muted}
              onChange={(e) => {
                sfx.set({ muted: !e.target.checked });
                if (e.target.checked) sfx.play('select');
              }}
            />
            Suoni attivi
          </label>
          <label className="sound-row">
            <span className="dim">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.volume * 100)}
              disabled={settings.muted}
              onChange={(e) => sfx.set({ volume: Number(e.target.value) / 100 })}
              // si sente il nuovo volume quando si rilascia il cursore
              onPointerUp={() => sfx.play('select')}
              onKeyUp={() => sfx.play('select')}
              aria-label="Volume"
            />
            <span className="num sound-value">{Math.round(settings.volume * 100)}</span>
          </label>
        </div>
      )}
    </div>
  );
}
