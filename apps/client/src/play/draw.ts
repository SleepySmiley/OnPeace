/**
 * Regista della pesca: la carta che arriva a fine turno la decide il server, come sempre; qui
 * passa da una piccola scena. Il mazzo cade al centro, il giocatore lo tocca (o la carta parte
 * da sola dopo qualche secondo), la carta sale, si gira, il suo territorio lampeggia sulla mappa
 * e lei vola tra le carte del giocatore. Le regole non cambiano: è solo scena.
 *
 * Il regista non sa niente di partite e battaglie: chi lo collega al gioco gli passa le carte
 * (`push`) e gli dice quando la scena è occupata da altro (`setDrawGate`, `yieldToBattle`).
 */
import { create } from 'zustand';
import type { Card } from '@onpeace/conquista';
import { sfx } from '../audio/sfx';

/** offer: il mazzo aspetta il clic; reveal: la carta si gira e resta lì; fly: vola tra le carte. */
export type DrawStage = 'offer' | 'reveal' | 'fly';

export interface Drawing {
  card: Card;
  stage: DrawStage;
  /** Numero della pesca: le animazioni ripartono quando cambia. */
  id: number;
}

/** Quanto aspetta il mazzo prima di far partire la carta da solo. */
export const AUTO_MS = 6000;
/** La carta sale e si gira; a metà si vede il fronte (lì lo schiocco e il lampo sulla mappa). */
export const FLIP_MS = 700;
/** Poi resta ferma: il tempo di leggerla (un clic la manda via prima). */
export const HOLD_MS = 1700;
/** Il volo fino al bottone delle carte. */
export const FLY_MS = 720;

interface DrawStore {
  queue: Card[];
  current: Drawing | null;
  /** Territorio della carta appena girata: lampeggia sulla mappa. */
  spot: { territory: string; at: number } | null;
  /** Ultima carta arrivata tra le carte (ms): il bottone delle carte fa un sobbalzo. */
  landed: number;
  /** Quale carta è arrivata per ultima: solo lei fa il sobbalzo nel ventaglio. */
  landedId: string | null;
  /** Una carta pescata da far vedere (si mette in coda se ce n'è già una). */
  push(card: Card): void;
  /** Clic sul mazzo: la carta sale e si gira. */
  take(): void;
  /** Clic sulla carta girata: vola tra le carte appena finito il giro (accorcia solo la pausa). */
  skip(): void;
  /** Fa partire la carta in coda, se la scena è libera. */
  kick(): void;
  /**
   * Comincia una battaglia propria (ti attaccano): il mazzo che aspetta il clic si toglie di
   * mezzo e torna dopo; la carta già girata vola tra le carte appena finito il giro.
   */
  yieldToBattle(): void;
  /** Via tutto (uscita dalla partita). */
  clear(): void;
}

/** La scena è occupata da altro (una battaglia propria): la carta aspetta. */
let gate: () => boolean = () => false;
export function setDrawGate(busy: () => boolean): void {
  gate = busy;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
/** Quando la carta ha cominciato a girarsi (ms). */
let revealAt = 0;

function later(ms: number, fn: () => void) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fn();
  }, ms);
}

export const useDraw = create<DrawStore>((set, get) => {
  /** La prossima carta della coda, se c'è e se la scena è libera. */
  const next = () => {
    const [card, ...rest] = get().queue;
    if (!card || gate()) {
      set({ current: null });
      return;
    }
    seq++;
    set({ queue: rest, current: { card, stage: 'offer', id: seq } });
    sfx.play('deal');
    later(AUTO_MS, () => get().take());
  };

  const fly = () => {
    const cur = get().current;
    if (!cur || cur.stage === 'fly') return;
    set({ current: { ...cur, stage: 'fly' } });
    sfx.play('whoosh', 0, 0.35);
    later(FLY_MS, () => {
      set({ landed: performance.now(), landedId: cur.card.id });
      sfx.play('build', 0, 0.5);
      next();
    });
  };

  /** Il volo prima del tempo: la pausa si accorcia, il giro no (sennò la carta scatta grande e girata). */
  const flyAfterFlip = () => {
    const wait = FLIP_MS - (performance.now() - revealAt);
    if (wait > 0) later(wait, fly);
    else fly();
  };

  return {
    queue: [],
    current: null,
    spot: null,
    landed: 0,
    landedId: null,
    push(card) {
      set((s) => ({ queue: [...s.queue, card] }));
      get().kick();
    },
    take() {
      const cur = get().current;
      if (!cur || cur.stage !== 'offer') return;
      set({ current: { ...cur, stage: 'reveal' } });
      revealAt = performance.now();
      const turnAt = FLIP_MS / 2;
      sfx.play('flip', turnAt / 1000);
      setTimeout(() => {
        if (get().current?.id === cur.id && cur.card.territory) set({ spot: { territory: cur.card.territory, at: performance.now() } });
      }, turnAt);
      later(FLIP_MS + HOLD_MS, fly);
    },
    skip() {
      if (get().current?.stage === 'reveal') flyAfterFlip();
    },
    kick() {
      if (!get().current && get().queue.length > 0 && !gate()) next();
    },
    yieldToBattle() {
      const cur = get().current;
      if (cur?.stage === 'offer') {
        if (timer) clearTimeout(timer);
        timer = null;
        set((s) => ({ current: null, queue: [cur.card, ...s.queue] }));
      } else if (cur?.stage === 'reveal') flyAfterFlip();
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      set({ queue: [], current: null, spot: null, landedId: null });
    },
  };
});

/** Le carte ancora in scena (in coda o in volo): tra le carte del giocatore arrivano dopo. */
export function cardsInScene(s: Pick<DrawStore, 'queue' | 'current'>): Set<string> {
  const ids = new Set(s.queue.map((c) => c.id));
  if (s.current) ids.add(s.current.card.id);
  return ids;
}
