/**
 * Nebbia di guerra (ricerca 01 §5, docs/progetto.md §2.7).
 * Il server manda a ogni giocatore solo la sua vista: nessuna informazione nascosta nel client.
 *
 * - Vedono le pile proprie e degli alleati, e le città proprie e alleate.
 * - Dentro il raggio visivo si vede la composizione delle pile nemiche.
 * - Fuori dal raggio si vede solo la posizione delle pile (se showFoggedStacks).
 * - Le pile tutte invisibili si vedono solo entro il raggio di rilevamento
 *   (vista × detectionFactor) o se hanno combattuto (exposed).
 * - Città e proprietari sono sempre visibili; rinforzi ed edifici nemici solo in vista.
 */
import type { GameContext } from './context';
import { areAllies } from './diplomacy';
import { buildingOf, groupView } from './forces';
import { distance, type Point } from './geometry';
import type { TurnEvent } from './turn';
import type { GameState, PlayerId, StackState } from './state';

export interface VisionSource {
  pos: Point;
  /** Raggio in unità mappa. */
  range: number;
}

/** Il giocatore e i suoi alleati: condividono la vista. */
export function viewersOf(state: GameState, player: PlayerId): Set<PlayerId> {
  return new Set(state.players.filter((p) => p.id === player || areAllies(state, player, p.id)).map((p) => p.id));
}

export function visionSources(state: GameState, ctx: GameContext, viewers: ReadonlySet<PlayerId>): VisionSource[] {
  const scale = ctx.map.rangeScale;
  const out: VisionSource[] = [];
  for (const s of state.stacks) {
    if (s.owner === null || !viewers.has(s.owner)) continue;
    const view = groupView(state, ctx, s.owner, s.units);
    if (view > 0) out.push({ pos: s.pos, range: view * scale });
  }
  for (const city of Object.values(state.cities)) {
    if (city.owner === null || !viewers.has(city.owner)) continue;
    const owner = city.owner;
    const view = Math.max(ctx.rules.vision.cityView, ...city.buildings.map((b) => buildingOf(state, ctx, owner, b.type).view));
    out.push({ pos: ctx.cities.get(city.id)!.pos, range: view * scale });
  }
  return out;
}

export const inSight = (p: Point, sources: readonly VisionSource[], factor = 1) =>
  sources.some((s) => distance(s.pos, p) <= s.range * factor);

function allStealth(ctx: GameContext, stack: StackState): boolean {
  return stack.units.length > 0 && stack.units.every((u) => ctx.catalog.unit(u.type).stealth);
}

/** Lo stato come lo vede il giocatore. */
export function viewFor(state: GameState, ctx: GameContext, player: PlayerId): GameState {
  const viewers = viewersOf(state, player);
  const sources = visionSources(state, ctx, viewers);
  const detection = ctx.rules.stealth.detectionFactor;
  const view = structuredClone(state);

  view.seed = 0; // il seme permetterebbe di prevedere i dadi
  view.stacks = [];
  for (const s of state.stacks) {
    if (s.owner !== null && viewers.has(s.owner)) {
      view.stacks.push(structuredClone(s));
      continue;
    }
    if (allStealth(ctx, s) && !s.exposed && !inSight(s.pos, sources, detection)) continue;
    if (inSight(s.pos, sources)) {
      view.stacks.push(structuredClone(s));
    } else if (ctx.rules.vision.showFoggedStacks) {
      view.stacks.push({ ...structuredClone(s), units: [], fog: true });
    }
  }

  for (const p of view.players) {
    if (!viewers.has(p.id)) {
      p.money = 0;
      // i potenziamenti del Generale li conoscono solo il giocatore e i suoi alleati
      if (state.phase !== 'ended') p.generalUpgrades = [];
    }
    // le strategie degli altri restano segrete finché la partita non comincia
    if (state.phase === 'selection' && p.id !== player) {
      p.strategy = null;
      p.generalUpgrades = [];
    }
  }
  for (const city of Object.values(view.cities)) {
    if (city.owner !== null && viewers.has(city.owner)) continue;
    city.reinforcements = 0;
    if (!inSight(ctx.cities.get(city.id)!.pos, sources)) city.buildings = [];
  }
  view.proposals = view.proposals.filter((p) => p.from === player || p.to === player);
  // storico: durante la partita degli avversari si vedono solo città e punti; a fine partita tutto
  if (view.history && state.phase !== 'ended') {
    for (const t of view.history) {
      for (const [id, st] of Object.entries(t.players)) {
        if (!viewers.has(id)) t.players[id] = { ...st, units: 0, money: 0, income: 0 };
      }
    }
  }
  return view;
}

/** Gli eventi del turno che il giocatore può conoscere (vista calcolata sullo stato dopo il turno). */
export function eventsFor(events: readonly TurnEvent[], after: GameState, ctx: GameContext, player: PlayerId): TurnEvent[] {
  const viewers = viewersOf(after, player);
  const sources = visionSources(after, ctx, viewers);
  const mine = (id: PlayerId | null) => id !== null && viewers.has(id);
  return events.filter((e) => {
    switch (e.kind) {
      case 'economy':
        return e.player === player;
      case 'action_failed':
        return e.player === player;
      case 'purchase':
      case 'move':
      case 'load':
      case 'unload':
        return mine(e.player);
      case 'intercept':
        return mine(e.player) || mine(e.targetOwner);
      case 'battle':
        return mine(e.attacker) || mine(e.defender) || inSight(e.at, sources);
      case 'diplomacy':
      case 'money':
        return e.from === player || e.to === player;
      case 'war_started':
        return e.players.includes(player);
      case 'capture':
      case 'city_given':
      case 'eliminated':
      case 'game_over':
        return true;
    }
  });
}
