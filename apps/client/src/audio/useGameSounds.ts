/** Suoni legati a quello che succede nella partita (non ai clic): turni, battaglie, tempo, chat. */
import { useEffect, useRef } from 'react';
import type { ChatLine, LoggedEvent } from '@onpeace/protocol';
import { sfx } from './sfx';

/** Avviso singolo quando mancano questi secondi. */
const WARN_AT = 30;
/** Negli ultimi secondi un tic al secondo. */
const TICKS_FROM = 5;

interface Args {
  me: string | null;
  /** Eventi appena arrivati (non al rientro). */
  fresh: { events: LoggedEvent[]; at: number } | null;
  /** Scadenza del tempo in corso (orologio locale). */
  deadline: number | null;
  paused: boolean;
  /** Tocca a me muovermi (il conto alla rovescia mi riguarda). */
  myMove: boolean;
  chat: ChatLine[];
}

export function useGameSounds({ me, fresh, deadline, paused, myMove, chat }: Args) {
  // ---------------------------------------------------------------- eventi della partita
  useEffect(() => {
    if (!fresh) return;
    const events = fresh.events.map((e) => e.event);
    const victory = events.find((e) => e.type === 'victory');
    if (victory) {
      sfx.play(victory.player === me ? 'victory' : 'defeat');
      return;
    }
    if (events.some((e) => e.type === 'eliminated' && e.player === me)) return sfx.play('defeat');
    if (events.some((e) => e.type === 'turn' && e.player === me)) sfx.play('yourPick');
    else if (events.some((e) => e.type === 'turn' || e.type === 'setup-reveal')) sfx.play('turn', 0.6);
    const battles = events.filter((e) => e.type === 'battle');
    const lost = battles.some((b) => b.conquered && b.defender === me);
    const won = battles.some((b) => b.conquered && b.player === me);
    if (lost) sfx.play('loss');
    else if (won) sfx.play('capture');
    else if (battles.some((b) => b.player === me || b.defender === me)) sfx.play(battles.some((b) => b.attackerLosses === 0) ? 'hit' : 'battle', 0.7);
    else if (battles.length > 0) sfx.play('battle', 0.35);
    if (events.some((e) => e.type === 'card' && e.player === me)) sfx.play('build', 0.5);
  }, [fresh, me]);

  // ---------------------------------------------------------------- tempo che sta per finire
  useEffect(() => {
    if (deadline === null || paused || !myMove) return;
    let warned = false;
    const ticked = new Set<number>();
    const id = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= WARN_AT && left > TICKS_FROM && !warned) {
        warned = true;
        sfx.play('warn');
      }
      if (left <= TICKS_FROM && left > 0 && !ticked.has(left)) {
        ticked.add(left);
        sfx.play('tick');
      }
    }, 250);
    return () => clearInterval(id);
  }, [deadline, paused, myMove]);

  // ---------------------------------------------------------------- chat
  const lastChat = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const last = chat.at(-1);
    const key = last ? `${last.at}:${last.from}` : null;
    const before = lastChat.current;
    lastChat.current = key;
    // all'apertura non suona: solo le righe nuove degli altri
    if (before === undefined || key === before || !last || last.from === me) return;
    sfx.play('chat');
  }, [chat, me]);
}
