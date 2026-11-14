/** Suoni legati a quello che succede nella partita (non ai clic): turni, battaglie, tempo, chat. */
import { useEffect, useRef } from 'react';
import type { GameState, PlayerId, TurnEvent } from '@onpeace/engine';
import type { ChatLine } from '@onpeace/protocol/atwar';
import { sfx } from './sfx';

/** Avviso singolo quando mancano questi secondi. */
const WARN_AT = 30;
/** Negli ultimi secondi un tic al secondo. */
const TICKS_FROM = 5;

interface Args {
  game: GameState | null;
  /** Chi gioca su questo schermo (online); in locale null: si sente l'esito generale. */
  me: PlayerId | null;
  events: TurnEvent[];
  /** Online: chi deve scegliere il paese ora. */
  picker: PlayerId | null;
  /** Scadenza del turno (orologio locale), solo online. */
  deadline: number | null;
  paused: boolean;
  /** Sto ancora dando ordini (non ho premuto Fine turno). */
  planning: boolean;
  chat: ChatLine[];
  lobbyPlayers: number;
}

export function useGameSounds({ game, me, events, picker, deadline, paused, planning, chat, lobbyPlayers }: Args) {
  // ---------------------------------------------------------------- turni e fine partita
  const prev = useRef<{ id: string; turn: number; phase: string } | null>(null);
  useEffect(() => {
    if (!game) {
      prev.current = null;
      return;
    }
    const before = prev.current;
    prev.current = { id: game.id, turn: game.turn, phase: game.phase };
    // all'apertura della pagina (o di un'altra partita) nessun suono: solo i cambiamenti
    if (!before || before.id !== game.id) return;
    if (game.phase === 'ended' && before.phase !== 'ended') {
      sfx.play(me === null || game.winners?.includes(me) ? 'victory' : 'defeat');
      return;
    }
    if (game.phase !== 'playing' || (before.phase === 'playing' && game.turn <= before.turn)) return;
    sfx.play('turn');
    const mine = (p: PlayerId | null) => me === null || p === me;
    const lost = me !== null && events.some((e) => e.kind === 'capture' && e.from === me && e.player !== me);
    const won = events.some((e) => e.kind === 'capture' && mine(e.player));
    const fought = events.some((e) => e.kind === 'battle' && (mine(e.attacker) || mine(e.defender)));
    if (lost) sfx.play('loss', 0.55);
    else if (won) sfx.play('capture', 0.55);
    else if (fought) sfx.play('battle', 0.45);
  }, [game, me, events]);

  // ---------------------------------------------------------------- tempo che sta per finire
  useEffect(() => {
    if (deadline === null || paused || !planning) return;
    let warned = false;
    const ticked = new Set<number>();
    const id = setInterval(() => {
      const left = (deadline - Date.now()) / 1000;
      if (left <= 0) return;
      if (!warned && left <= WARN_AT && left > TICKS_FROM) {
        warned = true;
        sfx.play('warn');
      }
      const sec = Math.ceil(left);
      if (sec <= TICKS_FROM && !ticked.has(sec)) {
        ticked.add(sec);
        sfx.play('tick');
      }
    }, 200);
    return () => clearInterval(id);
  }, [deadline, paused, planning]);

  // ---------------------------------------------------------------- tocca a te scegliere il paese
  const prevPicker = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (picker && me && picker === me && prevPicker.current !== picker) sfx.play('yourPick');
    prevPicker.current = picker;
  }, [picker, me]);

  // ---------------------------------------------------------------- chat e sala d'attesa
  // si ricorda l'ultima riga vista, non quante erano: la chat tiene solo le ultime 200 righe, e oltre
  // quel numero la lunghezza non cresce più (il suono non sarebbe più partito)
  const seenChat = useRef<ChatLine | null | undefined>(undefined);
  useEffect(() => {
    const before = seenChat.current;
    seenChat.current = chat.at(-1) ?? null;
    if (before === undefined) return; // primo giro: la chat che c'era già non suona
    const fresh = before === null ? chat : chat.slice(chat.indexOf(before) + 1);
    if (fresh.some((l) => l.from !== me)) sfx.play('chat');
  }, [chat, me]);

  const seenPlayers = useRef<number | null>(null);
  useEffect(() => {
    const before = seenPlayers.current;
    seenPlayers.current = lobbyPlayers;
    if (before !== null && lobbyPlayers > before) sfx.play('join');
  }, [lobbyPlayers]);
}
