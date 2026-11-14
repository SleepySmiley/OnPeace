/**
 * Aspetto scelto da chi gioca: lo stile del tabellone, che dà il tono a tutta l'interfaccia.
 * Resta nel browser; si cambia dal menu "Aspetto".
 */
import { create } from 'zustand';
import { PLAYER_COLORS } from '@onpeace/protocol';
import type { BoardStyle } from './board/common';
import { classico } from './board/styles/classico';
import { vetro } from './board/styles/vetro';

export const STYLES: BoardStyle[] = [classico, vetro];

const KEY = 'onpeace.aspetto';

interface Look {
  style: BoardStyle;
  setStyle(id: string): void;
}

function load(): { style?: string } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as { style?: string };
  } catch {
    return {};
  }
}

function save(style: BoardStyle) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ style: style.id }));
  } catch {
    // archiviazione non disponibile: l'aspetto vale solo per questa visita
  }
}

function apply(style: BoardStyle) {
  document.body.dataset.stile = style.id;
}

const saved = load();
const params = new URLSearchParams(location.search);
const initialStyle = STYLES.find((s) => s.id === (params.get('stile') ?? saved.style)) ?? STYLES[0]!;
apply(initialStyle);

export const useLook = create<Look>((set) => ({
  style: initialStyle,
  setStyle(id) {
    const style = STYLES.find((s) => s.id === id) ?? STYLES[0]!;
    apply(style);
    save(style);
    set({ style });
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
