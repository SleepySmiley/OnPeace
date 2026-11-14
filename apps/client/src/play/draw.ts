/**
 * Regista della pesca: la carta che arriva a fine turno la decide il server, come sempre; qui
 * passa da una piccola scena. Il mazzo compare, il giocatore lo tocca (o la carta parte da sola
 * dopo qualche secondo), la carta si gira, il suo territorio lampeggia sulla mappa e lei vola
 * tra le carte del giocatore. Le regole non cambiano: è solo scena.
 *
 * Tre modi di farla vedere, da confrontare nella pagina di prova pesca.html:
 * - centro: il mazzo al centro sopra un velo, la carta si gira grande;
 * - ventaglio: cinque carte coperte a ventaglio in basso, se ne tocca una;
 * - angolo: il mazzo sta sempre accanto alle carte, la carta si gira lì.
 */
import { create } from 'zustand';
import type { Card } from '@onpeace/conquista';
import { sfx } from '../audio/sfx';
import { useSession } from '../store';
import { useBattle } from './battle';

export type DrawStyle = 'centro' | 'ventaglio' | 'angolo';
export const DRAW_STYLES: readonly DrawStyle[] = ['centro', 'ventaglio', 'angolo'];

/** offer: il mazzo aspetta il clic; reveal: la carta si gira e resta lì; fly: vola tra le carte. */
export type DrawStage = 'offer' | 'reveal' | 'fly';

export interface Drawing {
  card: Card;
  stage: DrawStage;
  /** Numero della pesca: le animazioni ripartono quando cambia. */
  id: number;
  /** Ventaglio: la carta toccata (0-4). */
  chosen: number;
  /** Quando la carta parte da sola (ms, performance.now); null fuori dall'offerta. */
  autoAt: number | null;
}

/** Quanto aspetta il mazzo prima di far partire la carta da solo. */
export const AUTO_MS = 6000;
/** La carta si gira (ventaglio: prima sale al centro). */
const FLIP_MS: Record<DrawStyle, number> = { centro: 700, ventaglio: 1050, angolo: 650 };
/** Poi resta ferma: il tempo di leggerla (un clic la manda via prima). */
const HOLD_MS = 1700;
const FLY_MS: Record<DrawStyle, number> = { centro: 720, ventaglio: 720, angolo: 520 };
/** Dopo una battaglia propria la carta aspetta un attimo: spesso ne arriva subito un'altra. */
const BATTLE_GAP_MS = 700;
/** Carte nel ventaglio. */
export const FAN = 5;

export const flipMs = (s: DrawStyle) => FLIP_MS[s];
export const flyMs = (s: DrawStyle) => FLY_MS[s];

interface DrawStore {
  style: DrawStyle;
  queue: Card[];
  current: Drawing | null;
  /** Territorio della carta appena girata: lampeggia sulla mappa. */
  spot: { territory: string; at: number } | null;
  /** Ultima carta arrivata tra le carte (ms): il bottone delle carte fa un sobbalzo. */
  landed: number;
  setStyle(style: DrawStyle): void;
  /** Una carta pescata da far vedere (si mette in coda se ce n'è già una). */
  push(card: Card): void;
  /** Clic sul mazzo (nel ventaglio: sulla carta `chosen`). */
  take(chosen?: number): void;
  /** Clic sulla carta girata: vola subito tra le carte. */
  skip(): void;
  /** Fa partire la carta in coda, se la scena è libera. */
  kick(): void;
  /**
   * Comincia una battaglia propria (ti attaccano): il mazzo che aspetta il clic si toglie di
   * mezzo e torna dopo; la carta già girata vola subito tra le carte.
   */
  yieldToBattle(): void;
  /** Via tutto (uscita dalla partita). */
  clear(): void;
}

/** Una battaglia propria è ancora in scena (o in arrivo): la pesca aspetta che finisca. */
function battleBusy(): boolean {
  const b = useBattle.getState();
  const p = b.playing;
  return (p !== null && !p.small && p.eng.role !== 'spectator') || b.queue.some((e) => e.role !== 'spectator');
}

let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

function later(ms: number, fn: () => void) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fn();
  }, ms);
}

export const useDraw = create<DrawStore>((set, get) => {
  /** La prossima carta della coda, se c'è (e se nessuna battaglia propria è in scena). */
  const next = () => {
    const [card, ...rest] = get().queue;
    if (!card || battleBusy()) {
      set({ current: null });
      return;
    }
    seq++;
    set({ queue: rest, current: { card, stage: 'offer', id: seq, chosen: Math.floor(FAN / 2), autoAt: performance.now() + AUTO_MS } });
    sfx.play('deal');
    later(AUTO_MS, () => get().take());
  };

  const fly = () => {
    const cur = get().current;
    if (!cur || cur.stage === 'fly') return;
    set({ current: { ...cur, stage: 'fly' } });
    sfx.play('whoosh', 0, 0.35);
    later(flyMs(get().style), () => {
      set({ landed: performance.now() });
      sfx.play('build', 0, 0.5);
      next();
    });
  };

  return {
    style: 'centro',
    queue: [],
    current: null,
    spot: null,
    landed: 0,
    setStyle(style) {
      set({ style });
    },
    push(card) {
      set((s) => ({ queue: [...s.queue, card] }));
      get().kick();
    },
    kick() {
      if (!get().current && get().queue.length > 0 && !battleBusy()) next();
    },
    take(chosen) {
      const cur = get().current;
      if (!cur || cur.stage !== 'offer') return;
      const style = get().style;
      set({ current: { ...cur, stage: 'reveal', chosen: chosen ?? cur.chosen, autoAt: null } });
      const flip = flipMs(style);
      // la carta si gira a metà del suo movimento: lì si sente lo schiocco e la mappa accende il territorio
      const turnAt = style === 'ventaglio' ? flip * 0.65 : flip * 0.5;
      sfx.play('flip', turnAt / 1000);
      setTimeout(() => {
        const now = get().current;
        if (now?.id === cur.id && cur.card.territory) set({ spot: { territory: cur.card.territory, at: performance.now() } });
      }, turnAt);
      later(flip + HOLD_MS, fly);
    },
    skip() {
      if (get().current?.stage === 'reveal') fly();
    },
    yieldToBattle() {
      const cur = get().current;
      if (cur?.stage === 'offer') {
        if (timer) clearTimeout(timer);
        timer = null;
        set((s) => ({ current: null, queue: [cur.card, ...s.queue] }));
      } else if (cur?.stage === 'reveal') fly();
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      set({ queue: [], current: null, spot: null });
    },
  };
});

/** Le carte ancora in scena (in coda o in volo): tra le carte del giocatore arrivano dopo. */
export function cardsInScene(s: Pick<DrawStore, 'queue' | 'current'>): Set<string> {
  const ids = new Set(s.queue.map((c) => c.id));
  if (s.current) ids.add(s.current.card.id);
  return ids;
}

/** Le carte pescate dal giocatore, appena arrivano dalla partita, vanno in scena. */
export function connectDrawFeed(): () => void {
  let seen: unknown = useSession.getState().fresh;
  // battaglia propria in scena: la carta aspetta; finita (e niente subito dopo), tocca alla carta
  let idle: ReturnType<typeof setTimeout> | null = null;
  const offBattle = useBattle.subscribe(() => {
    if (battleBusy()) {
      if (idle) clearTimeout(idle);
      idle = null;
      useDraw.getState().yieldToBattle();
    } else if (!idle) {
      idle = setTimeout(() => {
        idle = null;
        useDraw.getState().kick();
      }, BATTLE_GAP_MS);
    }
  });
  const off = useSession.subscribe((s) => {
    if (s.fresh === seen) return;
    seen = s.fresh;
    if (!s.fresh) return;
    const me = s.online.me;
    for (const { event: e } of s.fresh.events) if (e.type === 'card' && e.player === me && e.card) useDraw.getState().push(e.card);
  });
  return () => {
    off();
    offBattle();
    if (idle) clearTimeout(idle);
    useDraw.getState().clear();
  };
}
