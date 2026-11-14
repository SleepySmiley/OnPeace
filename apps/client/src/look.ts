/**
 * Aspetto scelto da chi gioca: stile del tabellone (che dà il tono a tutta l'interfaccia) e
 * disposizione dei comandi durante la partita. Resta nel browser; si cambia dal menu "Aspetto".
 */
import { create } from 'zustand';
import { PLAYER_COLORS } from '@onpeace/protocol';
import type { BoardStyle } from './board/common';
import { classico } from './board/styles/classico';
import { vetro } from './board/styles/vetro';

export const STYLES: BoardStyle[] = [classico, vetro];

export type Layout = 'plancia' | 'comandi' | 'essenziale';
export const LAYOUTS: { id: Layout; name: string; tagline: string }[] = [
  { id: 'plancia', name: 'Plancia laterale', tagline: 'Tutto in una colonna a destra' },
  { id: 'comandi', name: 'Comandi in basso', tagline: 'Giocatori in alto, mosse e carte in basso' },
  { id: 'essenziale', name: 'Essenziale', tagline: 'Solo il tabellone, i comandi in una barra in basso' },
];

const KEY = 'onpeace.aspetto';

interface Look {
  style: BoardStyle;
  layout: Layout;
  setStyle(id: string): void;
  setLayout(id: Layout): void;
}

function load(): { style?: string; layout?: Layout } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as { style?: string; layout?: Layout };
  } catch {
    return {};
  }
}

function save(style: BoardStyle, layout: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ style: style.id, layout }));
  } catch {
    // archiviazione non disponibile: l'aspetto vale solo per questa visita
  }
}

function apply(style: BoardStyle, layout: Layout) {
  document.body.dataset.stile = style.id;
  document.body.dataset.disposizione = layout;
}

const saved = load();
const params = new URLSearchParams(location.search);
const initialStyle = STYLES.find((s) => s.id === (params.get('stile') ?? saved.style)) ?? STYLES[0]!;
const initialLayout = LAYOUTS.find((l) => l.id === (params.get('disposizione') ?? saved.layout))?.id ?? 'plancia';
apply(initialStyle, initialLayout);

export const useLook = create<Look>((set, get) => ({
  style: initialStyle,
  layout: initialLayout,
  setStyle(id) {
    const style = STYLES.find((s) => s.id === id) ?? STYLES[0]!;
    apply(style, get().layout);
    save(style, get().layout);
    set({ style });
  },
  setLayout(layout) {
    apply(get().style, layout);
    save(get().style, layout);
    set({ layout });
  },
}));

/**
 * Colore di un giocatore nello stile in uso: la tavolozza comune è l'identità (scelta in sala
 * d'attesa), ogni stile la ridisegna nei suoi toni nello stesso ordine.
 */
export function styleColor(style: BoardStyle, color: string): string {
  const i = PLAYER_COLORS.indexOf(color);
  return i >= 0 ? (style.playerColors[i] ?? color) : color;
}
