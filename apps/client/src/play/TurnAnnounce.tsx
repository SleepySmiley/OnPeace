/**
 * Quando tocca a te: una fascia attraversa lo schermo a inizio turno e a ogni cambio di fase
 * ("Tocca a te", "Attacco"…; in piccolo, in alto, quando tocca agli altri), e finché la mossa è tua
 * il bordo dello schermo resta acceso nel tuo colore.
 */
import { useEffect, useRef, useState } from 'react';
import { isMyMove } from './logic';
import { useGame } from './useGame';

interface Shout {
  key: number;
  kind: 'big' | 'mid' | 'small';
  title: string;
  sub?: string;
  color: string;
}

/** Quanto resta la fascia (ms), come le animazioni in styles.css. */
const SHOUT_MS = { big: 2300, mid: 1700, small: 1500 } as const;

export function TurnAnnounce() {
  const { view, me, move, colorOf, playerName } = useGame();
  const [shout, setShout] = useState<Shout | null>(null);
  const prev = useRef<{ phase: string; turn: number | null } | null>(null);

  useEffect(() => {
    const cur = { phase: view.phase, turn: view.turn?.number ?? null };
    const was = prev.current;
    prev.current = cur;
    // al primo disegno (anche rientrando in una partita già avviata) non si annuncia niente
    if (!was) return;
    const turn = view.turn;
    const mineTurn = turn?.player === me;
    let next: Omit<Shout, 'key'> | null = null;
    if (turn && cur.turn !== was.turn) {
      next = mineTurn
        ? { kind: 'big', title: 'Tocca a te', sub: `Rinforzi · ${turn.reinforcements} ${turn.reinforcements === 1 ? 'armata' : 'armate'} da mettere`, color: colorOf(turn.player) }
        : { kind: 'small', title: `Tocca a ${playerName(turn.player)}`, color: colorOf(turn.player) };
    } else if (cur.phase !== was.phase) {
      const color = me ? colorOf(me) : '#888888';
      if (mineTurn && cur.phase === 'attack') next = { kind: 'mid', title: 'Attacco', sub: 'Scegli da dove attaccare, o passa', color };
      else if (mineTurn && cur.phase === 'fortify') next = { kind: 'mid', title: 'Spostamento', sub: 'Sposta armate, se vuoi, poi chiudi il turno', color };
      else if (cur.phase === 'draft') next = { kind: 'mid', title: 'Scelta dei territori', sub: 'A turno, un territorio libero a testa', color };
      else if (cur.phase === 'setup') next = { kind: 'mid', title: 'Piazzamento', sub: 'Metti le armate iniziali sui tuoi territori', color };
    }
    if (next) setShout({ ...next, key: performance.now() });
  }, [view.phase, view.turn, me, colorOf, playerName]);

  useEffect(() => {
    if (!shout) return;
    const id = setTimeout(() => setShout(null), SHOUT_MS[shout.kind]);
    return () => clearTimeout(id);
  }, [shout]);

  const framed = isMyMove(move) && move.kind !== 'briefing';
  return (
    <>
      {framed && <div className="my-frame" style={{ ['--pc' as string]: me ? colorOf(me) : '#888888' }} aria-hidden />}
      {shout && (
        <div key={shout.key} className={`announce announce-${shout.kind}`} style={{ ['--pc' as string]: shout.color }} role="status">
          <b>{shout.title}</b>
          {shout.sub && <span>{shout.sub}</span>}
        </div>
      )}
    </>
  );
}
