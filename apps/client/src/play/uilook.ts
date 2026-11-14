/**
 * Prove dell'interfaccia della partita (pagina di prova interfaccia.html): come si vedono le fasi
 * del turno, come si annuncia che tocca a te, gli avvisi di quello che succede, i cassetti di
 * carte e registro, le frecce del vetro. La partita vera usa "ora" (com'è adesso); quando si
 * sceglie, resta solo la scelta e questo file sparisce.
 */
import { create } from 'zustand';

/** Fasi del turno: nella barra in alto (ora), percorso numerato al centro, giocatori nella barra, nella barra dei comandi. */
export type Fasi = 'ora' | 'percorso' | 'giro' | 'sotto';
/** Quando tocca a te: solo l'avviso (ora), fascia al centro, cornice dello schermo, entrambe. */
export type Annuncio = 'ora' | 'fascia' | 'cornice' | 'entrambi';
/** Quello che succede: righe di testo (ora), notizie con il segno, scritte sulla mappa. */
export type Avvisi = 'ora' | 'notizie' | 'mappa';
/** Carte, obiettivo, registro e chat: due cassetti (ora), colonna a destra, pannello dal basso, carte in mano. */
export type Cassetti = 'ora' | 'colonna' | 'basso' | 'mano';
/** Frecce del vetro: colore di chi attacca (ora), chiare col bordo scuro, colore di chi attacca col bordo bianco e scuro. */
export type Frecce = 'ora' | 'chiare' | 'bordate';

export interface UiLook {
  fasi: Fasi;
  annuncio: Annuncio;
  avvisi: Avvisi;
  cassetti: Cassetti;
  frecce: Frecce;
}

export const UI_NOW: UiLook = { fasi: 'ora', annuncio: 'ora', avvisi: 'ora', cassetti: 'ora', frecce: 'ora' };

export const useUiLook = create<UiLook & { set(patch: Partial<UiLook>): void; /** Prova l'annuncio senza aspettare il turno. */ demo: number }>((set) => ({
  ...UI_NOW,
  demo: 0,
  set: (patch) => set(patch),
}));

/** Per chi disegna fuori da React (il tabellone): le scelte di adesso. */
export const uiLook = (): UiLook => useUiLook.getState();
