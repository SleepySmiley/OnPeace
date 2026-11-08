/** Acquisti nelle città (ricerca 01 §3): denaro + rinforzi, navi solo nei porti. */
import { cityDef, type GameContext } from './context';
import { controlsCapital } from './economy';
import { RuleError } from './errors';
import { createUnit, stackInCity } from './setup';
import { getPlayer, newId, type GameState, type PlayerId, type StackState } from './state';

export interface PurchaseOrder {
  city: string;
  units: { type: string; count: number }[];
  buildings: string[];
}

export function purchaseCost(ctx: GameContext, order: PurchaseOrder): number {
  const units = order.units.reduce((s, u) => s + ctx.catalog.unit(u.type).cost * u.count, 0);
  const buildings = order.buildings.reduce((s, b) => s + ctx.catalog.building(b).cost, 0);
  return units + buildings;
}

/** Elenco dei motivi per cui l'acquisto non è valido (vuoto = valido). */
export function validatePurchase(
  state: GameState,
  ctx: GameContext,
  playerId: PlayerId,
  order: PurchaseOrder,
): string[] {
  const errors: string[] = [];
  if (state.phase !== 'playing') return ['La partita non è in corso'];
  const player = getPlayer(state, playerId);
  if (player.status !== 'active') return ['Non sei più in gioco'];
  const city = state.cities[order.city];
  if (!city) return [`Città sconosciuta: ${order.city}`];
  const def = cityDef(ctx, order.city);
  if (city.owner !== playerId) errors.push(`${def.name} non è tua`);
  else if (!controlsCapital(state, ctx, playerId, def.country)) {
    errors.push(`Per comprare a ${def.name} devi controllare la capitale del paese`);
  }

  let count = 0;
  for (const item of order.units) {
    const unit = ctx.catalog.units.get(item.type);
    if (!unit) {
      errors.push(`Unità sconosciuta: ${item.type}`);
      continue;
    }
    if (!Number.isInteger(item.count) || item.count < 1) errors.push(`Quantità non valida per ${unit.name}`);
    if (unit.role === 'rare') errors.push(`${unit.name} non si può comprare`);
    if (unit.domain === 'naval' && !def.port) errors.push(`${unit.name}: le navi si comprano solo nei porti`);
    count += item.count;
  }
  if (count > city.reinforcements) {
    errors.push(`Rinforzi insufficienti a ${def.name}: ${city.reinforcements} disponibili, ${count} richiesti`);
  }

  const seen = new Set(city.buildings.map((b) => b.type));
  for (const id of order.buildings) {
    const b = ctx.catalog.buildings.get(id);
    if (!b) {
      errors.push(`Edificio sconosciuto: ${id}`);
      continue;
    }
    if (seen.has(id)) errors.push(`${b.name} c'è già a ${def.name}`);
    seen.add(id);
    if (b.portOnly && !def.port) errors.push(`${b.name} si costruisce solo nei porti`);
  }

  if (errors.length === 0) {
    const cost = purchaseCost(ctx, order);
    const blocked = ctx.rules.economy.blockPurchasesWhenNegative && player.money < 0;
    if (blocked) errors.push('Con il saldo negativo non puoi comprare');
    else if (cost > player.money) errors.push(`Fondi insufficienti: servono ${cost}, hai ${Math.floor(player.money)}`);
  }
  if (order.units.length === 0 && order.buildings.length === 0) errors.push('Ordine vuoto');
  return errors;
}

/** Esegue l'acquisto: le unità compaiono subito nella pila del giocatore in città. */
export function applyPurchase(
  state: GameState,
  ctx: GameContext,
  playerId: PlayerId,
  order: PurchaseOrder,
): StackState | null {
  const errors = validatePurchase(state, ctx, playerId, order);
  if (errors.length > 0) throw new RuleError(errors.join('; '));
  const player = getPlayer(state, playerId);
  const city = state.cities[order.city]!;
  const def = cityDef(ctx, order.city);
  player.money -= purchaseCost(ctx, order);

  for (const id of order.buildings) city.buildings.push(createUnit(state, ctx, id, order.city));

  const count = order.units.reduce((s, u) => s + u.count, 0);
  if (count === 0) return null;
  city.reinforcements -= count;
  let stack = stackInCity(state, playerId, order.city);
  if (!stack) {
    stack = { id: newId(state, 's'), owner: playerId, pos: def.pos, city: order.city, units: [], exposed: false };
    state.stacks.push(stack);
  }
  for (const item of order.units) {
    for (let i = 0; i < item.count; i++) stack.units.push(createUnit(state, ctx, item.type, order.city));
  }
  return stack;
}
