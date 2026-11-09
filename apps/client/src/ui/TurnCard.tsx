import { useEffect } from 'react';
import type { GameState, PlayerId, TurnEvent } from '@onpeace/engine';
import { cityName } from '../game/describe';
import { productionOf, refilledThisTurn } from '../game/production';
import { ctx } from '../game/store';

const fmt = new Intl.NumberFormat('it-IT');
/** Quanto resta a schermo (poi sfuma; un clic la chiude subito). */
const VISIBLE_MS = 6500;

interface Props {
  game: GameState;
  player: PlayerId;
  /** Eventi del turno appena risolto (vuoti al turno 1). */
  events: TurnEvent[];
  onClose: () => void;
}

/** Breve annuncio all'inizio di ogni turno: cosa è cambiato per te e se puoi arruolare di nuovo. */
export function TurnCard({ game, player, events, onClose }: Props) {
  useEffect(() => {
    const id = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [onClose]);

  const facts: string[] = [];
  const economy = events.find((e) => e.kind === 'economy' && e.player === player);
  if (economy?.kind === 'economy') facts.push(`${economy.net >= 0 ? '+' : '−'}${fmt.format(Math.abs(economy.net))} fondi`);
  const battles = events.filter((e) => e.kind === 'battle' && (e.attacker === player || e.defender === player)).length;
  if (battles > 0) facts.push(battles === 1 ? '1 battaglia' : `${battles} battaglie`);
  const won = events.flatMap((e) => (e.kind === 'capture' && e.player === player ? [cityName(e.city)] : []));
  const lost = events.flatMap((e) => (e.kind === 'capture' && e.from === player && e.player !== player ? [cityName(e.city)] : []));
  if (won.length > 0) facts.push(`conquistat${won.length === 1 ? 'a' : 'e'} ${won.join(', ')}`);
  if (lost.length > 0) facts.push(`pers${lost.length === 1 ? 'a' : 'e'} ${lost.join(', ')}`);

  const refilled = refilledThisTurn(game.turn);
  const production = productionOf(game, player);
  const peace = game.turn <= ctx.rules.turn.peaceTurns;

  return (
    <div className="turn-card" role="status" onClick={onClose} style={{ animationDuration: `${VISIBLE_MS}ms` }}>
      <div className="turn-card-kicker">Nuovo turno</div>
      <div className="turn-card-title">
        Turno <b>{game.turn}</b>
        <span className="dim"> di {game.settings.maxTurns}</span>
      </div>
      {facts.length > 0 && <div className="turn-card-facts">{facts.join(' · ')}</div>}
      {refilled && production.quota > 0 && (
        <div className="turn-card-line ok">Rinforzi ricaricati: puoi arruolare di nuovo ({production.available} unità).</div>
      )}
      {peace && <div className="turn-card-line">Pace iniziale: in questo turno non si attaccano gli altri giocatori.</div>}
    </div>
  );
}
