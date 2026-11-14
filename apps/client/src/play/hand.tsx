/**
 * Carte e obiettivo "in mano": nell'angolo in basso a sinistra le carte a ventaglio, l'obiettivo per
 * primo (coperto); passandoci sopra si aprono, con un clic si vedono grandi al centro, con i tris
 * da giocare. Le carte pescate volano lì (data-hand-pill) e compaiono quando arrivano.
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { SymbolIcon } from './bits';
import { cardsInScene, useDraw } from './draw';
import { HandPanel } from './panels';
import { useGame } from './useGame';

/** Le carte da mostrare: quelle in mano, tranne quelle ancora nella scena della pesca. */
function useHandCards() {
  const { view, me } = useGame();
  const inScene = useDraw((s) => [...cardsInScene(s)].join('|'));
  const mine = view.players.find((p) => p.id === me);
  return useMemo(() => (mine?.cards ?? []).filter((c) => !inScene.split('|').includes(c.id)), [mine, inScene]);
}

export function HandFan({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const { territory } = useGame();
  const cards = useHandCards();
  const landed = useDraw((s) => s.landed);
  const n = cards.length + 1;
  // ventaglio: più carte, angoli e passi più stretti (resta dentro l'angolo)
  const place = (i: number) =>
    ({
      ['--r' as string]: `${n === 1 ? 0 : (i - (n - 1) / 2) * Math.min(7, 28 / (n - 1))}deg`,
      ['--x' as string]: `${(i - (n - 1) / 2) * Math.min(22, 100 / n)}px`,
      zIndex: i,
    }) as CSSProperties;
  const label = cards.length === 0 ? 'Il tuo obiettivo' : `Obiettivo e ${cards.length} ${cards.length === 1 ? 'carta' : 'carte'}`;
  return (
    <button type="button" className={`hand-fan${open ? ' open' : ''}`} aria-expanded={open} aria-label={label} onClick={onOpen}>
      <span className="hf-cards">
        <span className="hf-card hf-objective" style={place(0)}>
          <b>Obiettivo</b>
          <small>segreto</small>
        </span>
        {cards.map((c, i) => (
          <span key={c.id} className={`hf-card${c.symbol === 'joker' ? ' joker' : ''}${landed && i === cards.length - 1 ? ' fresh' : ''}`} style={place(i + 1)}>
            <SymbolIcon symbol={c.symbol} size={20} />
            <small>{c.symbol === 'joker' ? 'Jolly' : c.territory ? territory(c.territory) : ''}</small>
          </span>
        ))}
      </span>
      {/* dove atterrano le carte pescate */}
      <span className="hf-target" data-hand-pill aria-hidden />
      <span className="hf-label">{label}</span>
    </button>
  );
}

/** La mano aperta: obiettivo e carte grandi al centro, sopra la mappa scurita. Esc o clic fuori chiude. */
export function HandTable({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // prima di GameScreen, che con Esc toglierebbe anche le armate non confermate
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="hand-table-veil" onClick={onClose}>
      <section className="hand-table panel" aria-label="Le tue carte e il tuo obiettivo" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sc-close" aria-label="Chiudi" onClick={onClose}>
          ×
        </button>
        <HandPanel />
      </section>
    </div>
  );
}
