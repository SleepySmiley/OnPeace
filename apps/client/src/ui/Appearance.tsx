/** Menu "Aspetto": stile del tabellone e disposizione dei comandi, da provare durante la partita. */
import { useEffect, useRef, useState } from 'react';
import { LAYOUTS, STYLES, useLook } from '../look';

export function AppearanceMenu() {
  const { style, layout, setStyle, setLayout } = useLook();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="menu" ref={box}>
      <button type="button" className="ghost tiny" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Aspetto
      </button>
      {open && (
        <div className="menu-pop panel" role="dialog" aria-label="Aspetto">
          <h2 className="section-title">Stile</h2>
          <div className="choice-list">
            {STYLES.map((s) => (
              <button key={s.id} type="button" aria-pressed={s.id === style.id} onClick={() => setStyle(s.id)}>
                <span>{s.name}</span>
                <small>{s.tagline}</small>
              </button>
            ))}
          </div>
          <h2 className="section-title">Disposizione dei comandi</h2>
          <div className="choice-list">
            {LAYOUTS.map((l) => (
              <button key={l.id} type="button" aria-pressed={l.id === layout} onClick={() => setLayout(l.id)}>
                <span>{l.name}</span>
                <small>{l.tagline}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
