/** Creazione della partita e scelta dei paesi (ricerca 01 §1.3). */
import { cityDef, countryDef, type GameContext } from './context';
import { reinforcementsForPopulation } from './economy';
import { RuleError, assertRule } from './errors';
import { statsOf } from './forces';
import {
  getPlayer,
  newId,
  relationKey,
  type GameSettings,
  type GameState,
  type PlayerId,
  type StackState,
  type UnitState,
} from './state';

/** Scelte di un giocatore prima del turno 1: strategia e potenziamenti del Generale. */
export interface Doctrine {
  strategy: string | null;
  general: string[];
}

export interface NewPlayer {
  id: PlayerId;
  name: string;
  color: string;
  team?: number | null;
  doctrine?: Doctrine;
}

export function defaultSettings(ctx: GameContext): GameSettings {
  const g = ctx.rules.game;
  return {
    startingFunds: g.startingFunds,
    initialCountries: g.initialCountries,
    maxTurns: g.maxTurns,
    victory: 'annihilation',
    maxAlliances: ctx.rules.diplomacy.maxAlliances,
    rareUnitChancePct: g.rareUnitChancePct,
    turnSeconds: ctx.rules.turn.defaultSeconds,
    strategies: g.strategies,
    general: g.general,
  };
}

/** Nuova unità con gli HP pieni (secondo la strategia del proprietario, se indicato). */
export function createUnit(
  state: GameState,
  ctx: GameContext,
  type: string,
  origin: string | null,
  owner: PlayerId | null = null,
): UnitState {
  return { id: newId(state, 'u'), type, hp: statsOf(state, ctx, owner, type).hp, origin, cargo: [] };
}

/** Motivi per cui la dottrina non è valida (vuoto = valida). */
export function checkDoctrine(ctx: GameContext, settings: Pick<GameSettings, 'strategies' | 'general'>, d: Doctrine): string[] {
  const errors: string[] = [];
  if (d.strategy !== null) {
    if (!settings.strategies) errors.push('In questa partita le strategie sono disattivate');
    else if (!ctx.catalog.strategies.has(d.strategy)) errors.push(`Strategia sconosciuta: ${d.strategy}`);
  }
  if (d.general.length > 0) {
    const { picks } = ctx.catalog.rules.general;
    if (!settings.general) errors.push('In questa partita il Generale non c’è');
    if (new Set(d.general).size !== d.general.length) errors.push('Potenziamento del Generale ripetuto');
    if (d.general.length > picks) errors.push(`Il Generale ha al massimo ${picks} potenziamenti`);
    for (const id of d.general) {
      if (!ctx.catalog.generalUpgrades.has(id)) errors.push(`Potenziamento sconosciuto: ${id}`);
    }
  }
  return errors;
}

/** Durante la scelta dei paesi il giocatore può cambiare strategia e potenziamenti del Generale. */
export function setDoctrine(state: GameState, ctx: GameContext, playerId: PlayerId, d: Doctrine): void {
  assertRule(state.phase === 'selection', 'Strategia e Generale si scelgono prima del turno 1');
  const errors = checkDoctrine(ctx, state.settings, d);
  if (errors.length > 0) throw new RuleError(errors.join('; '));
  const player = getPlayer(state, playerId);
  player.strategy = d.strategy;
  player.generalUpgrades = [...d.general];
}

/** Completa i potenziamenti mancanti con quelli predefiniti (fino al numero consentito). */
export function completeGeneralUpgrades(ctx: GameContext, chosen: readonly string[]): string[] {
  const { picks, defaultUpgrades } = ctx.catalog.rules.general;
  const out = chosen.filter((id) => ctx.catalog.generalUpgrades.has(id)).slice(0, picks);
  for (const id of defaultUpgrades) {
    if (out.length >= picks) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Nuova partita: tutte le città neutrali e presidiate, giocatori senza paesi. */
export function createGame(
  ctx: GameContext,
  opts: { id: string; seed: number; players: NewPlayer[]; settings?: Partial<GameSettings> },
): GameState {
  assertRule(opts.players.length >= 1, 'Serve almeno un giocatore');
  const settings = { ...defaultSettings(ctx), ...opts.settings };
  const state: GameState = {
    id: opts.id,
    mapId: ctx.map.id,
    phase: 'selection',
    turn: 0,
    seed: opts.seed,
    settings,
    players: opts.players.map((p) => {
      // una dottrina non valida (es. strategie disattivate dopo la scelta) viene ignorata
      const d = p.doctrine;
      const ok = d && checkDoctrine(ctx, settings, d).length === 0;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        team: p.team ?? null,
        money: settings.startingFunds,
        homeCountry: null,
        strategy: ok ? d.strategy : null,
        generalUpgrades: ok ? [...d.general] : [],
        status: 'active',
        score: 0,
      };
    }),
    cities: {},
    stacks: [],
    relations: {},
    proposals: [],
    nextId: 0,
    winners: null,
  };

  const { neutrals } = ctx.rules;
  for (const country of ctx.map.countries) {
    const cities = ctx.citiesByCountry.get(country.id) ?? [];
    const countryIncome = cities.reduce((s, c) => s + c.income, 0);
    for (const def of cities) {
      const reinforcements = reinforcementsForPopulation(def.population, ctx.rules);
      state.cities[def.id] = {
        id: def.id,
        owner: null,
        incomePct: 100,
        population: def.population,
        reinforcements,
        buildings: [],
      };
      const units: UnitState[] = [];
      const militia = Math.round(reinforcements * neutrals.militiaPerReinforcement);
      for (let i = 0; i < militia; i++) units.push(createUnit(state, ctx, ctx.rules.reinforcements.freeMilitiaUnit, null));
      if (countryIncome >= neutrals.infantryMinCountryIncome) {
        for (let i = 0; i < neutrals.infantryPerCity; i++) units.push(createUnit(state, ctx, neutrals.infantryUnit, null));
      }
      if (units.length > 0) {
        state.stacks.push({ id: newId(state, 's'), owner: null, pos: def.pos, city: def.id, units, exposed: false });
      }
    }
  }

  const ids = state.players.map((p) => p.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = getPlayer(state, ids[i]!);
      const b = getPlayer(state, ids[j]!);
      const sameTeam = a.team != null && a.team === b.team;
      state.relations[relationKey(a.id, b.id)] = { relation: sameTeam ? 'alliance' : 'war' };
    }
  }
  return state;
}

/** Prezzo di un paese nella scelta iniziale: reddito e rinforzi. */
export function countryValue(ctx: GameContext, countryId: string): number {
  const { incomeFactor, reinforcementValue } = ctx.rules.selection;
  return Math.round(
    (ctx.citiesByCountry.get(countryId) ?? []).reduce(
      (s, c) => s + c.income * incomeFactor + reinforcementsForPopulation(c.population, ctx.rules) * reinforcementValue,
      0,
    ),
  );
}

export function countryOwner(state: GameState, ctx: GameContext, countryId: string): PlayerId | null {
  return state.cities[countryDef(ctx, countryId).capital]?.owner ?? null;
}

export function ownedCountries(state: GameState, ctx: GameContext, player: PlayerId): string[] {
  return ctx.map.countries.filter((c) => countryOwner(state, ctx, c.id) === player).map((c) => c.id);
}

/** Il giocatore compra un paese libero: città e presidi passano a lui. */
export function selectCountry(state: GameState, ctx: GameContext, playerId: PlayerId, countryId: string): void {
  assertRule(state.phase === 'selection', 'La scelta dei paesi è chiusa');
  const player = getPlayer(state, playerId);
  const country = countryDef(ctx, countryId);
  assertRule(countryOwner(state, ctx, country.id) === null, `${country.name} è già stato scelto`);
  const picked = ownedCountries(state, ctx, playerId).length;
  assertRule(picked < state.settings.initialCountries, 'Hai già scelto tutti i paesi consentiti');
  const value = countryValue(ctx, country.id);
  assertRule(player.money >= value, `Fondi insufficienti per ${country.name} (servono ${value})`);

  player.money -= value;
  if (!player.homeCountry) player.homeCountry = country.id;
  for (const city of ctx.citiesByCountry.get(country.id) ?? []) {
    const cs = state.cities[city.id]!;
    cs.owner = playerId;
    cs.incomePct = 100;
  }
  for (const stack of state.stacks) {
    if (stack.owner === null && stack.city && cityDef(ctx, stack.city).country === country.id) {
      stack.owner = playerId;
    }
  }
}

/**
 * Chi sceglie il prossimo paese: a rotazione, il primo che ne ha meno degli altri.
 * `skipped` = giocatori che hanno rinunciato (es. nessun paese alla loro portata).
 * null = scelta finita.
 */
export function nextPicker(
  state: GameState,
  ctx: GameContext,
  skipped: ReadonlySet<PlayerId> = new Set(),
): PlayerId | null {
  const owned = (id: PlayerId) => ownedCountries(state, ctx, id).length;
  const pending = state.players.filter((p) => !skipped.has(p.id) && owned(p.id) < state.settings.initialCountries);
  if (pending.length === 0) return null;
  const min = Math.min(...pending.map((p) => owned(p.id)));
  return pending.find((p) => owned(p.id) === min)!.id;
}

/** Paesi ancora liberi che il giocatore può permettersi. */
export function affordableCountries(state: GameState, ctx: GameContext, player: PlayerId): string[] {
  const money = getPlayer(state, player).money;
  return ctx.map.countries
    .filter((c) => countryOwner(state, ctx, c.id) === null && countryValue(ctx, c.id) <= money)
    .map((c) => c.id);
}

/**
 * Fine della scelta: comincia il turno 1. Le dottrine si bloccano e, se il Generale
 * è in gioco, ognuno lo riceve nella capitale del paese natale.
 */
export function finishSelection(state: GameState, ctx: GameContext): void {
  assertRule(state.phase === 'selection', 'La partita è già iniziata');
  for (const p of state.players) {
    if (!p.homeCountry) p.status = 'left';
  }
  state.phase = 'playing';
  state.turn = 1;
  for (const p of state.players) {
    if (!state.settings.strategies) p.strategy = null;
    if (!state.settings.general) {
      p.generalUpgrades = [];
      continue;
    }
    p.generalUpgrades = completeGeneralUpgrades(ctx, p.generalUpgrades ?? []);
    if (p.status !== 'active' || !p.homeCountry) continue;
    const capital = countryDef(ctx, p.homeCountry).capital;
    if (state.cities[capital]?.owner !== p.id) continue;
    let stack = stackInCity(state, p.id, capital);
    if (!stack) {
      stack = { id: newId(state, 's'), owner: p.id, pos: cityDef(ctx, capital).pos, city: capital, units: [], exposed: false };
      state.stacks.push(stack);
    }
    stack.units.push(createUnit(state, ctx, ctx.catalog.generalUnit, null, p.id));
  }
}

/** Pila del giocatore dentro una città, se c'è. */
export function stackInCity(state: GameState, owner: PlayerId | null, cityId: string): StackState | undefined {
  return state.stacks.find((s) => s.owner === owner && s.city === cityId);
}
