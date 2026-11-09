/**
 * Movimento (ricerca 01 §4.2): libero entro un raggio, senza griglia.
 * - Il raggio di un gruppo è la media (o il minimo) dei raggi delle sue unità.
 * - Terra, mare e aria si muovono come gruppi separati.
 * - Terra solo su terra (o scorciatoie), mare solo in mare (o nei porti), aria ovunque
 *   ma senza fermarsi nelle zone invalicabili.
 * - Un tratto che non si può fare dritto passa da solo per uno stretto, un tunnel o un canale
 *   (scorciatoia della mappa), se c'è: la deviazione conta nella lunghezza del percorso.
 * - I trasporti portano con sé il carico.
 */
import { SAME_POINT, resolveStackRef, type Action, type UnitSelection } from './actions';
import { cityDef, type GameContext } from './context';
import { canAttack } from './diplomacy';
import { boostsFor, unitOf } from './forces';
import { distance, distanceToSegment, type Point } from './geometry';
import type { NavGrid } from './navigation';
import type { CityDef } from './schema/map';
import type { Domain, UnitDef } from './schema/rules';
import { newId, type GameState, type PlayerId, type StackState, type UnitState } from './state';

export type MoveAction = Extract<Action, { kind: 'move' }>;
export type LoadAction = Extract<Action, { kind: 'load' }>;
export type UnloadAction = Extract<Action, { kind: 'unload' }>;

export type Arrival = 'move' | 'join' | 'attack_city' | 'attack_stack';

export interface MovePlan {
  source: StackState;
  units: UnitState[];
  domain: Domain;
  range: number;
  length: number;
  end: Point;
  endCity: CityDef | null;
  arrival: Arrival;
  /** Pila bersaglio (attacco a una pila). */
  target: StackState | null;
  /** Percorso effettivo dopo la partenza (tappe, passaggi attraversati, arrivo). */
  path: Point[];
}

export type Checked<T> = { ok: true; plan: T } | { ok: false; errors: string[] };

const EPS = 0.5;

export function selectionCount(sel: UnitSelection): number {
  return sel.reduce((s, x) => s + x.count, 0);
}

/** Sceglie dalla pila le unità richieste che non si sono ancora mosse in questo turno. */
export function pickUnits(
  stack: StackState,
  sel: UnitSelection,
  moved: ReadonlySet<string>,
): UnitState[] | string {
  const out: UnitState[] = [];
  for (const { type, count } of sel) {
    if (!Number.isInteger(count) || count < 1) return `Quantità non valida (${type})`;
    const free = stack.units.filter((u) => u.type === type && !moved.has(u.id) && !out.includes(u));
    if (free.length < count) return `Unità ${type} insufficienti: ${free.length} disponibili, ${count} richieste`;
    out.push(...free.slice(0, count));
  }
  return out;
}

/** Raggio di un gruppo che si muove insieme (media o minimo), con strategia e bonus di comando. */
export function groupRange(state: GameState, ctx: GameContext, owner: PlayerId, units: readonly UnitState[]): number {
  const boost = boostsFor(state, ctx, owner, units);
  const moves = units.map((u) => Math.max(0, unitOf(state, ctx, owner, u.type).move + boost(u).move));
  if (moves.length === 0) return 0;
  if (ctx.rules.movement.stackRange === 'minimum') return Math.min(...moves);
  return moves.reduce((s, m) => s + m, 0) / moves.length;
}

export function pathLength(start: Point, path: readonly Point[]): number {
  let len = 0;
  let prev = start;
  for (const p of path) {
    len += distance(prev, p);
    prev = p;
  }
  return len;
}

/** Città entro la distanza di aggancio dal punto (la più vicina). */
export function snapToCity(ctx: GameContext, p: Point): CityDef | null {
  const max = ctx.rules.movement.citySnapDistance * ctx.map.rangeScale;
  let best: CityDef | null = null;
  let bestD = Infinity;
  for (const c of ctx.map.cities) {
    const d = distance(c.pos, p);
    if (d <= max && d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function nearPort(ctx: GameContext, p: Point): boolean {
  const r = ctx.rules.movement.portMaxSeaDistance * ctx.map.rangeScale;
  return ctx.map.cities.some((c) => c.port && distance(c.pos, p) <= r);
}

function nearShortcut(ctx: GameContext, nav: NavGrid, p: Point, kind: 'land' | 'naval'): boolean {
  return ctx.map.shortcuts.some((s) => s.for === kind && distanceToSegment(p, s.from, s.to) <= nav.cell);
}

export function pointPassable(ctx: GameContext, nav: NavGrid, domain: Domain, p: Point): boolean {
  const t = nav.terrainFast(p);
  if (t === 'out') return false;
  if (domain === 'air') return true;
  if (domain === 'land') return t === 'land' || nearShortcut(ctx, nav, p, 'land');
  return t === 'sea' || nearPort(ctx, p) || nearShortcut(ctx, nav, p, 'naval');
}

export function segmentPassable(ctx: GameContext, nav: NavGrid, domain: Domain, a: Point, b: Point): boolean {
  const steps = Math.max(1, Math.ceil(distance(a, b) / (nav.cell / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!pointPassable(ctx, nav, domain, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
  }
  return true;
}

/**
 * Tratto da `a` a `b`: dritto se si può; altrimenti attraverso la scorciatoia della mappa
 * (stretto, tunnel, ponte, canale) che allunga meno il tragitto. Restituisce i punti da inserire
 * tra `a` e `b` (vuoto se il tratto è dritto), o null se non c'è modo di passare.
 */
export function routeLeg(ctx: GameContext, nav: NavGrid, domain: Domain, a: Point, b: Point): Point[] | null {
  if (segmentPassable(ctx, nav, domain, a, b)) return [];
  if (domain === 'air') return null;
  const options: { via: Point[]; length: number }[] = [];
  for (const s of ctx.map.shortcuts) {
    if (s.for !== domain) continue;
    for (const [p, q] of [
      [s.from, s.to],
      [s.to, s.from],
    ] as [Point, Point][]) {
      options.push({ via: [p, q], length: distance(a, p) + distance(p, q) + distance(q, b) });
    }
  }
  options.sort((x, y) => x.length - y.length);
  for (const { via } of options) {
    const [p, q] = via as [Point, Point];
    if (segmentPassable(ctx, nav, domain, a, p) && segmentPassable(ctx, nav, domain, q, b)) return via;
  }
  return null;
}

/** Il percorso effettivo da `start` attraverso i punti dati (con i passaggi), o null se un tratto è impossibile. */
export function routePath(
  ctx: GameContext,
  nav: NavGrid,
  domain: Domain,
  start: Point,
  points: readonly Point[],
): Point[] | null {
  const route: Point[] = [];
  let prev = start;
  for (const p of points) {
    const via = routeLeg(ctx, nav, domain, prev, p);
    if (!via) return null;
    route.push(...via, p);
    prev = p;
  }
  return route;
}

function unitDefs(ctx: GameContext, units: readonly UnitState[]): UnitDef[] {
  return units.map((u) => ctx.catalog.unit(u.type));
}

/** Cosa succede all'arrivo in un punto (o città) per il giocatore. */
function classifyArrival(
  state: GameState,
  ctx: GameContext,
  player: PlayerId,
  domain: Domain,
  end: Point,
  endCity: CityDef | null,
  errors: string[],
): Arrival {
  if (endCity) {
    const owner = state.cities[endCity.id]!.owner;
    if (domain === 'naval' && !endCity.port) errors.push(`${endCity.name} non è un porto`);
    if (owner === player) return 'join';
    if (!canAttack(state, ctx, player, owner)) {
      errors.push(`Non puoi entrare a ${endCity.name}: non sei in guerra con il proprietario`);
      return 'move';
    }
    return 'attack_city';
  }
  const own = state.stacks.some((s) => s.owner === player && distance(s.pos, end) <= SAME_POINT);
  return own ? 'join' : 'move';
}

/** Controlla un ordine di movimento contro lo stato attuale. */
export function checkMove(
  state: GameState,
  ctx: GameContext,
  nav: NavGrid,
  player: PlayerId,
  action: MoveAction,
  moved: ReadonlySet<string>,
): Checked<MovePlan> {
  const errors: string[] = [];
  const source = resolveStackRef(state, player, action.from);
  if (!source) return { ok: false, errors: ['Pila di partenza non trovata'] };
  if (action.path.length === 0) return { ok: false, errors: ['Percorso vuoto'] };
  const picked = pickUnits(source, action.units, moved);
  if (typeof picked === 'string') return { ok: false, errors: [picked] };
  if (picked.length === 0) return { ok: false, errors: ['Nessuna unità selezionata'] };
  const defs = unitDefs(ctx, picked);
  const domain = defs[0]!.domain;
  if (defs.some((d) => d.domain !== domain)) {
    return { ok: false, errors: ['Terra, mare e aria si muovono separatamente'] };
  }
  if (picked.some((u) => unitOf(state, ctx, player, u.type).move <= 0)) {
    return { ok: false, errors: ['Alcune unità non possono muoversi'] };
  }

  // destinazione: pila bersaglio, città vicina o punto libero
  let target: StackState | null = null;
  let end = action.path[action.path.length - 1]!;
  let endCity: CityDef | null;
  const snap = ctx.rules.movement.citySnapDistance * ctx.map.rangeScale;
  if (action.target) {
    target = state.stacks.find((s) => s.id === action.target) ?? null;
    if (!target) return { ok: false, errors: ['Pila bersaglio non trovata'] };
    if (!canAttack(state, ctx, player, target.owner)) {
      return { ok: false, errors: ['Non puoi attaccare questa pila: non siete in guerra'] };
    }
    if (distance(end, target.pos) > snap) return { ok: false, errors: ['Il percorso non arriva al bersaglio'] };
    end = target.pos;
    endCity = target.city ? cityDef(ctx, target.city) : null;
  } else {
    endCity = snapToCity(ctx, end);
    if (endCity) end = endCity.pos;
  }
  const path = [...action.path.slice(0, -1), end];

  const range = groupRange(state, ctx, player, picked);
  const route = routePath(ctx, nav, domain, source.pos, path);
  const length = pathLength(source.pos, route ?? path);
  if (length > range * ctx.map.rangeScale + EPS) {
    errors.push(`Percorso troppo lungo: ${(length / ctx.map.rangeScale).toFixed(1)} su ${range.toFixed(1)}`);
  }
  if (!route) {
    errors.push(
      domain === 'land'
        ? 'Le truppe di terra non attraversano il mare né le montagne'
        : domain === 'naval'
          ? 'Le navi restano in mare (o nei porti)'
          : 'Percorso fuori dalla mappa',
    );
  }
  if (domain === 'air' && !endCity && nav.terrainAt(end) === 'nogo') {
    errors.push('Gli aerei non possono fermarsi sulle montagne');
  }

  const arrival = target ? 'attack_stack' : classifyArrival(state, ctx, player, domain, end, endCity, errors);
  if (errors.length > 0 || !route) return { ok: false, errors };
  return { ok: true, plan: { source, units: picked, domain, range, length, end, endCity, arrival, target, path: route } };
}

/**
 * Sposta le unità (senza combattere): escono dalla pila di partenza e si uniscono
 * alla pila propria nel punto d'arrivo, o ne formano una nuova.
 */
export function relocate(
  state: GameState,
  player: PlayerId,
  source: StackState,
  units: readonly UnitState[],
  end: Point,
  endCity: string | null,
): StackState {
  const ids = new Set(units.map((u) => u.id));
  source.units = source.units.filter((u) => !ids.has(u.id));
  if (source.units.length === 0) state.stacks = state.stacks.filter((s) => s !== source);
  return placeUnits(state, player, units, end, endCity, source.exposed);
}

/** Aggiunge unità alla pila propria nel punto (o città), o ne crea una nuova. */
export function placeUnits(
  state: GameState,
  player: PlayerId,
  units: readonly UnitState[],
  end: Point,
  endCity: string | null,
  exposed = false,
): StackState {
  let dest = state.stacks.find(
    (s) => s.owner === player && (endCity ? s.city === endCity : !s.city && distance(s.pos, end) <= SAME_POINT),
  );
  if (!dest) {
    dest = { id: newId(state, 's'), owner: player, pos: end, city: endCity, units: [], exposed };
    state.stacks.push(dest);
  }
  dest.units.push(...units);
  return dest;
}

// ------------------------------------------------------------------ trasporti

function cargoSpace(state: GameState, ctx: GameContext, owner: PlayerId, transport: UnitState, unit: UnitState): boolean {
  const cargo = unitOf(state, ctx, owner, transport.type).cargo;
  if (!cargo || transport.cargo.length >= cargo.capacity) return false;
  const def = ctx.catalog.unit(unit.type);
  if (cargo.carries === 'any_land') return def.domain === 'land' && def.transportable;
  return cargo.carries.includes(unit.type);
}

export interface LoadPlan {
  source: StackState;
  /** Coppie unità → trasporto. */
  assignments: { unit: UnitState; transport: UnitState }[];
}

/** Carico: unità di terra della pila salgono sui trasporti della stessa pila. */
export function checkLoad(state: GameState, ctx: GameContext, player: PlayerId, action: LoadAction): Checked<LoadPlan> {
  const source = resolveStackRef(state, player, action.from);
  if (!source) return { ok: false, errors: ['Pila non trovata'] };
  const picked = pickUnits(source, action.units, new Set());
  if (typeof picked === 'string') return { ok: false, errors: [picked] };
  const transports = source.units.filter((u) => ctx.catalog.unit(u.type).cargo);
  const used = new Map(transports.map((t) => [t.id, t.cargo.length]));
  const assignments: LoadPlan['assignments'] = [];
  for (const unit of picked) {
    const t = transports.find((tr) => {
      const virtual = { ...tr, cargo: new Array(used.get(tr.id)).fill(null) as UnitState[] };
      return tr !== unit && cargoSpace(state, ctx, player, virtual, unit);
    });
    if (!t) return { ok: false, errors: [`Nessun posto sui trasporti per ${ctx.catalog.unit(unit.type).name}`] };
    used.set(t.id, used.get(t.id)! + 1);
    assignments.push({ unit, transport: t });
  }
  return { ok: true, plan: { source, assignments } };
}

export function applyLoad(plan: LoadPlan): void {
  const loaded = new Set(plan.assignments.map((a) => a.unit.id));
  plan.source.units = plan.source.units.filter((u) => !loaded.has(u.id));
  for (const { unit, transport } of plan.assignments) transport.cargo.push(unit);
}

export interface UnloadPlan {
  source: StackState;
  units: UnitState[];
  end: Point;
  endCity: CityDef | null;
  arrival: Arrival;
}

/** Sbarco: il carico scende su terra entro una breve distanza dal trasporto. */
export function checkUnload(
  state: GameState,
  ctx: GameContext,
  nav: NavGrid,
  player: PlayerId,
  action: UnloadAction,
): Checked<UnloadPlan> {
  const errors: string[] = [];
  const source = resolveStackRef(state, player, action.from);
  if (!source) return { ok: false, errors: ['Pila non trovata'] };
  const carried = source.units.flatMap((t) => t.cargo);
  const fake: StackState = { ...source, units: carried };
  const picked = pickUnits(fake, action.units, new Set());
  if (typeof picked === 'string') return { ok: false, errors: [picked] };
  const endCity = snapToCity(ctx, action.to);
  const end = endCity ? endCity.pos : action.to;
  if (distance(source.pos, end) > ctx.rules.movement.unloadMaxDistance * ctx.map.rangeScale + EPS) {
    errors.push('Troppo lontano dal trasporto per sbarcare');
  }
  if (!endCity && !pointPassable(ctx, nav, 'land', end)) errors.push('Si sbarca solo sulla terraferma');
  const arrival = classifyArrival(state, ctx, player, 'land', end, endCity, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: { source, units: picked, end, endCity, arrival } };
}

/** Toglie le unità dal trasporto (lo sbarco vero e proprio lo fa chi risolve il turno). */
export function takeFromCargo(source: StackState, units: readonly UnitState[]): void {
  const ids = new Set(units.map((u) => u.id));
  for (const t of source.units) t.cargo = t.cargo.filter((c) => !ids.has(c.id));
}
