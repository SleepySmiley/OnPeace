/**
 * Prove di leggibilità della mappa (pagina di prova mappa.html): come si vede di chi è un
 * territorio, dove si può agire adesso e dove finisce un continente. Gli stili leggono queste
 * scelte mentre disegnano; quando se ne sceglie una, resta solo quella e questo file sparisce.
 */

/** Di chi è un territorio: colore pieno, bordo del padrone, righe del padrone, o com'era (solo i carri nel classico). */
export type OwnerLook = 'fill' | 'rim' | 'hatch' | 'now';
/** Dove si può agire: velo scuro (com'era), sbiaditi, contorno che pulsa, sbiaditi col contorno. */
export type ActiveLook = 'veil' | 'fade' | 'pulse' | 'both';
/** Dove finisce un continente: linea (com'era), nastro del suo colore, canale che lo stacca dagli altri. */
export type ContinentLook = 'line' | 'ribbon' | 'gap';

export interface MapLook {
  owner: OwnerLook;
  active: ActiveLook;
  continent: ContinentLook;
}

export const mapLook: MapLook = { owner: 'now', active: 'veil', continent: 'line' };

const listeners = new Set<() => void>();

/** Cambia le scelte e fa ridisegnare i tabelloni aperti. */
export function setMapLook(patch: Partial<MapLook>): void {
  Object.assign(mapLook, patch);
  for (const f of listeners) f();
}

export function onMapLook(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Lo strato fisso dipende dai padroni (va rifatto a ogni conquista). */
export const ownersInStatic = () => mapLook.owner !== 'now';

/** Il contorno dei territori attivi pulsa: il tabellone va ridisegnato di continuo. */
export const pulsing = () => mapLook.active === 'pulse';
