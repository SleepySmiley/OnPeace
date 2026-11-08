/** Testi in italiano per azioni ed eventi. */
import {
  pointInMultiPolygon,
  type Action,
  type GameState,
  type MultiPolygon,
  type PlannedStep,
  type TurnEvent,
  type UnitSelection,
} from '@onpeace/engine';
import { ctx } from './store';

export const unitName = (type: string) =>
  ctx.catalog.units.get(type)?.name ?? ctx.catalog.buildings.get(type)?.name ?? type;

export const cityName = (id: string) => ctx.cities.get(id)?.name ?? id;
export const countryName = (id: string) => ctx.countries.get(id)?.name ?? id;

export function playerName(game: GameState, id: string | null): string {
  if (id === null) return 'Neutrali';
  return game.players.find((p) => p.id === id)?.name ?? id;
}

export function describeUnits(sel: UnitSelection): string {
  return sel.map((s) => `${s.count} ${unitName(s.type)}`).join(', ');
}

/** "a Norpolis" se la destinazione è una città, altrimenti "in Vargard" (paese) o "in mare". */
function placeName(pos: readonly [number, number]): string {
  const snap = ctx.rules.movement.citySnapDistance * ctx.map.rangeScale;
  const city = ctx.map.cities.find((c) => Math.hypot(c.pos[0] - pos[0], c.pos[1] - pos[1]) <= snap);
  if (city) return `a ${city.name}`;
  const country = ctx.map.countries.find((c) => pointInMultiPolygon(pos, c.shape as MultiPolygon));
  return country ? `in ${country.name}` : 'in mare';
}

export function describeAction(game: GameState, action: Action, step?: PlannedStep): string {
  switch (action.kind) {
    case 'buy': {
      const parts = [describeUnits(action.order.units), ...action.order.buildings.map(unitName)].filter(Boolean);
      return `Compra ${parts.join(', ')} a ${cityName(action.order.city)}`;
    }
    case 'move': {
      const end = step?.path?.[step.path.length - 1] ?? action.path[action.path.length - 1]!;
      const where = placeName(end);
      if (step?.arrival === 'attack_city' || step?.arrival === 'attack_stack' || action.target) {
        return `Attacca ${where} con ${describeUnits(action.units)}`;
      }
      return `Muovi ${describeUnits(action.units)} ${where}`;
    }
    case 'load':
      return `Carica ${describeUnits(action.units)}`;
    case 'unload':
      return `Sbarca ${describeUnits(action.units)}`;
    case 'diplomacy': {
      const who = playerName(game, action.to);
      if (action.proposal === 'war') return `Dichiara guerra a ${who}`;
      return action.proposal === 'peace' ? `Proponi la pace a ${who}` : `Proponi l'alleanza a ${who}`;
    }
    case 'respond': {
      const p = game.proposals.find((x) => x.id === action.proposal);
      const who = p ? playerName(game, p.from) : '?';
      return `${action.accept ? 'Accetta' : 'Rifiuta'} la proposta di ${who}`;
    }
    case 'send_money':
      return `Invia ${action.amount} a ${playerName(game, action.to)}`;
    case 'give_city':
      return `Cedi ${cityName(action.city)} a ${playerName(game, action.to)}`;
  }
}

/** Una riga di resoconto per evento (null = non mostrarlo nel registro). */
export function describeEvent(game: GameState, e: TurnEvent): string | null {
  const who = (id: string | null) => playerName(game, id);
  switch (e.kind) {
    case 'purchase':
      return `${who(e.player)} compra ${[describeUnits(e.units), ...e.buildings.map(unitName)].filter(Boolean).join(', ')} a ${cityName(e.city)}`;
    case 'move':
      return e.stoppedByWall ? `${who(e.player)} è fermato da una linea difensiva` : null;
    case 'intercept':
      return e.blocked
        ? `${who(e.player)} blocca una pila di ${who(e.targetOwner)}`
        : `Una pila di ${who(e.targetOwner)} sfugge a ${who(e.player)}`;
    case 'battle': {
      const where = e.city ? ` a ${cityName(e.city)}` : '';
      const winner = e.winner === 'attacker' ? who(e.attacker) : who(e.defender);
      return `Battaglia${where}: ${who(e.attacker)} (${e.attackers.length}) contro ${who(e.defender)} (${e.defenders.length}) — vince ${winner}`;
    }
    case 'capture':
      return `${who(e.player)} conquista ${cityName(e.city)}${e.freeMilitia ? ` (+${e.freeMilitia} Milizie)` : ''}`;
    case 'diplomacy': {
      const map = {
        propose_peace: 'propone la pace a',
        propose_alliance: "propone l'alleanza a",
        declare_war: 'dichiara guerra a',
        break_alliance: "rompe l'alleanza con",
        accepted: 'accetta la proposta di',
        rejected: 'rifiuta la proposta di',
      } as const;
      return `${who(e.from)} ${map[e.what]} ${who(e.to)}`;
    }
    case 'war_started':
      return `Guerra tra ${who(e.players[0])} e ${who(e.players[1])}`;
    case 'money':
      return `${who(e.from)} invia ${e.amount} a ${who(e.to)}`;
    case 'city_given':
      return `${who(e.from)} cede ${cityName(e.city)} a ${who(e.to)}`;
    case 'action_failed':
      return `${who(e.player)}: ordine annullato — ${e.reason}`;
    case 'eliminated':
      return `${who(e.player)} è eliminato`;
    case 'game_over':
      return `Partita finita: vince ${e.winners.map(who).join(' e ')}`;
    case 'economy':
      return `${who(e.player)}: reddito ${e.income + e.bonus}, mantenimento ${e.upkeep} → ${e.net >= 0 ? '+' : ''}${e.net}`;
    case 'load':
    case 'unload':
      return null;
  }
}
