/**
 * Le unità come le schiera un giocatore: statistiche modificate dalla sua strategia
 * e bonus di comando (Generale e comandanti rari) dati alle unità della stessa pila.
 */
import type { TypeStats } from './catalog';
import type { GameContext } from './context';
import { matchesTarget, type AuraEffect, type BuildingDef, type GeneralUpgradeDef, type UnitDef } from './schema/rules';
import type { GameState, PlayerId, UnitState } from './state';

/** Strategia in vigore per il proprietario (null per i neutrali o con le strategie spente). */
export function strategyOf(state: GameState, owner: PlayerId | null): string | null {
  if (owner === null || !state.settings.strategies) return null;
  return state.players.find((p) => p.id === owner)?.strategy ?? null;
}

export const unitOf = (state: GameState, ctx: GameContext, owner: PlayerId | null, type: string): UnitDef =>
  ctx.catalog.unitFor(type, strategyOf(state, owner));

export const buildingOf = (state: GameState, ctx: GameContext, owner: PlayerId | null, type: string): BuildingDef =>
  ctx.catalog.buildingFor(type, strategyOf(state, owner));

export const statsOf = (state: GameState, ctx: GameContext, owner: PlayerId | null, type: string): TypeStats =>
  ctx.catalog.statsFor(type, strategyOf(state, owner));

/** Potenziamenti del Generale del giocatore (vuoto se il Generale non è in gioco). */
export function generalUpgradesOf(state: GameState, ctx: GameContext, owner: PlayerId | null): GeneralUpgradeDef[] {
  if (owner === null || !state.settings.general) return [];
  const ids = state.players.find((p) => p.id === owner)?.generalUpgrades ?? [];
  return ids.flatMap((id) => {
    const up = ctx.catalog.generalUpgrades.get(id);
    return up ? [up] : [];
  });
}

/** Somma dei bonus di comando che riceve un'unità. */
export interface Boost {
  attack: number;
  defence: number;
  crit: number;
  hp: number;
  move: number;
  view: number;
  upkeep: number;
}

export const NO_BOOST: Readonly<Boost> = Object.freeze({ attack: 0, defence: 0, crit: 0, hp: 0, move: 0, view: 0, upkeep: 0 });

/** Bonus di comando attivi in un gruppo di unità: ogni tipo di comandante conta una volta sola. */
export function commandAuras(
  state: GameState,
  ctx: GameContext,
  owner: PlayerId | null,
  units: readonly UnitState[],
): AuraEffect[] {
  const out: AuraEffect[] = [];
  for (const type of new Set(units.map((u) => u.type))) {
    const def = ctx.catalog.units.get(type);
    if (!def) continue;
    out.push(...def.aura);
    if (def.role === 'general') for (const up of generalUpgradesOf(state, ctx, owner)) out.push(...up.aura);
  }
  return out;
}

/**
 * Restituisce, per ogni unità del gruppo, i bonus ricevuti dai comandanti del gruppo stesso.
 * Il risultato è calcolato una volta per tipo di unità.
 */
export function boostsFor(
  state: GameState,
  ctx: GameContext,
  owner: PlayerId | null,
  units: readonly UnitState[],
): (unit: UnitState) => Boost {
  const auras = commandAuras(state, ctx, owner, units);
  if (auras.length === 0) return () => NO_BOOST;
  const byType = new Map<string, Boost>();
  return (unit) => {
    let b = byType.get(unit.type);
    if (!b) {
      b = { ...NO_BOOST };
      const def = ctx.catalog.units.get(unit.type);
      if (def) {
        for (const a of auras) {
          if (!matchesTarget(def, a.target)) continue;
          b.attack += a.attack ?? 0;
          b.defence += a.defence ?? 0;
          b.crit += a.crit ?? 0;
          b.hp += a.hp ?? 0;
          b.move += a.move ?? 0;
          b.view += a.view ?? 0;
          b.upkeep += a.upkeep ?? 0;
        }
      }
      byType.set(unit.type, b);
    }
    return b;
  };
}

/** Raggio visivo di un gruppo di unità (il massimo, con i bonus di comando). */
export function groupView(state: GameState, ctx: GameContext, owner: PlayerId | null, units: readonly UnitState[]): number {
  const boost = boostsFor(state, ctx, owner, units);
  return Math.max(0, ...units.map((u) => unitOf(state, ctx, owner, u.type).view + boost(u).view));
}
