/**
 * Risoluzione del turno (ricerca 01 §1.4–1.6, fedele ad atWar).
 *
 * A fine turno il server sceglie a caso un giocatore che ha ancora azioni ed esegue
 * la sua prossima azione; ripete finché le liste sono vuote. Ogni giocatore mantiene
 * il proprio ordine. Il caso usa un seme registrato: il turno è riproducibile.
 *
 * Intercettazione ("turnblock"): se attacco una pila che ha ancora un movimento da fare,
 * con 3 unità o meno resta bloccata; altrimenti scappa se rand() > (attaccanti / bersaglio) × 2.
 * Se scappa, esegue subito il suo movimento e l'attaccante la insegue se ha raggio.
 */
import { resolveStackRef, type Action, type UnitSelection } from './actions';
import { cityDef, type GameContext } from './context';
import { makeFighter, resolveBattle, rngDice, type Dice, type Exchange } from './combat';
import { areAllies, canAttack, relationBetween } from './diplomacy';
import {
  applyStartOfTurnEconomy,
  isOwnTerritory,
  reinforcementsForPopulation,
  startingIncomePct,
} from './economy';
import { RuleError } from './errors';
import { distance, type Point } from './geometry';
import { firstWallCrossing } from './lines';
import {
  applyLoad,
  checkLoad,
  checkMove,
  checkUnload,
  placeUnits,
  relocate,
  segmentPassable,
  takeFromCargo,
  type MoveAction,
  type MovePlan,
} from './movement';
import type { NavGrid } from './navigation';
import { applyPurchase, purchaseCost, validatePurchase } from './purchase';
import { createRng, seedFromString, type Rng } from './rng';
import type { CityDef } from './schema/map';
import type { Domain } from './schema/rules';
import { createUnit } from './setup';
import {
  allUnits,
  getPlayer,
  newId,
  relationKey,
  type GameState,
  type PlayerId,
  type StackState,
  type UnitState,
} from './state';

export type TurnEvent =
  | { kind: 'economy'; player: PlayerId; income: number; bonus: number; upkeep: number; net: number }
  | { kind: 'purchase'; player: PlayerId; city: string; units: UnitSelection; buildings: string[]; cost: number }
  | {
      kind: 'move';
      player: PlayerId;
      from: Point;
      to: Point;
      city: string | null;
      units: UnitSelection;
      stoppedByWall: boolean;
    }
  | { kind: 'load' | 'unload'; player: PlayerId; at: Point; units: UnitSelection }
  | { kind: 'intercept'; player: PlayerId; targetOwner: PlayerId | null; at: Point; blocked: boolean }
  | {
      kind: 'battle';
      id: string;
      at: Point;
      city: string | null;
      attacker: PlayerId;
      defender: PlayerId | null;
      attackers: { uid: string; type: string }[];
      defenders: { uid: string; type: string }[];
      winner: 'attacker' | 'defender';
      mutual: boolean;
      exchanges: Exchange[];
    }
  | { kind: 'capture'; player: PlayerId; city: string; from: PlayerId | null; freeMilitia: number; rare: string | null }
  | {
      kind: 'diplomacy';
      from: PlayerId;
      to: PlayerId;
      what: 'propose_peace' | 'propose_alliance' | 'declare_war' | 'break_alliance' | 'accepted' | 'rejected';
    }
  | { kind: 'war_started'; players: [PlayerId, PlayerId] }
  | { kind: 'money'; from: PlayerId; to: PlayerId; amount: number }
  | { kind: 'city_given'; from: PlayerId; to: PlayerId; city: string }
  | { kind: 'action_failed'; player: PlayerId; index: number; action: Action['kind']; reason: string }
  | { kind: 'eliminated'; player: PlayerId }
  | { kind: 'game_over'; winners: PlayerId[] };

export interface TurnResult {
  /** Stato all'inizio del turno successivo (o a fine partita). */
  state: GameState;
  events: TurnEvent[];
}

export function summarize(units: readonly UnitState[]): UnitSelection {
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, count }));
}

export function turnSeed(state: GameState): number {
  return seedFromString(`${state.id}:${state.seed}:${state.turn}`);
}

/** Risolve il turno corrente. Non modifica `input`: restituisce un nuovo stato. */
export function resolveTurn(
  input: GameState,
  ctx: GameContext,
  nav: NavGrid,
  actions: Readonly<Record<PlayerId, Action[]>>,
): TurnResult {
  if (input.phase !== 'playing') throw new RuleError('La partita non è in corso');
  const state = structuredClone(input);
  const rng = createRng(turnSeed(state));
  const events: TurnEvent[] = [];
  new Resolver(state, ctx, nav, rng, rngDice(rng), events).run(actions);
  endTurn(state, ctx, events);
  if (state.phase === 'playing') startTurn(state, ctx, events);
  return { state, events };
}

type Queued = { action: Action; index: number };

class Resolver {
  private readonly moved = new Set<string>();
  /** Pila spostata per intero → pila in cui è finita (per inseguire i bersagli). */
  private readonly follow = new Map<string, string>();
  private readonly queues = new Map<PlayerId, (Queued | null)[]>();
  private battleCount = 0;

  constructor(
    private readonly state: GameState,
    private readonly ctx: GameContext,
    private readonly nav: NavGrid,
    private readonly rng: Rng,
    private readonly dice: Dice,
    private readonly events: TurnEvent[],
  ) {}

  run(actions: Readonly<Record<PlayerId, Action[]>>): void {
    for (const p of this.state.players) {
      if (p.status !== 'active') continue;
      this.queues.set(
        p.id,
        (actions[p.id] ?? []).map((action, index) => ({ action, index })),
      );
    }
    for (;;) {
      const ready = [...this.queues].filter(([, q]) => q.some((x) => x !== null)).map(([id]) => id);
      if (ready.length === 0) break;
      const player = this.rng.pick(ready);
      const queue = this.queues.get(player)!;
      const pos = queue.findIndex((x) => x !== null);
      const item = queue[pos]!;
      queue[pos] = null;
      this.execute(player, item);
    }
  }

  private fail(player: PlayerId, item: Queued, reason: string): void {
    this.events.push({ kind: 'action_failed', player, index: item.index, action: item.action.kind, reason });
  }

  private execute(player: PlayerId, item: Queued): void {
    if (getPlayer(this.state, player).status !== 'active') return;
    try {
      const a = item.action;
      switch (a.kind) {
        case 'buy':
          return this.buy(player, item, a.order);
        case 'move':
          return this.move(player, item, a);
        case 'load':
          return this.load(player, item, a);
        case 'unload':
          return this.unload(player, item, a);
        case 'diplomacy':
          return this.diplomacy(player, item, a.to, a.proposal);
        case 'respond':
          return this.respond(player, item, a.proposal, a.accept);
        case 'send_money':
          return this.sendMoney(player, item, a.to, a.amount);
        case 'give_city':
          return this.giveCity(player, item, a.city, a.to);
      }
    } catch (err) {
      if (err instanceof RuleError) return this.fail(player, item, err.message);
      throw err;
    }
  }

  // ------------------------------------------------------------------ acquisti

  private buy(player: PlayerId, item: Queued, order: Extract<Action, { kind: 'buy' }>['order']): void {
    const errors = validatePurchase(this.state, this.ctx, player, order);
    if (errors.length > 0) return this.fail(player, item, errors.join('; '));
    const cost = purchaseCost(this.ctx, order);
    applyPurchase(this.state, this.ctx, player, order);
    this.events.push({ kind: 'purchase', player, city: order.city, units: order.units, buildings: order.buildings, cost });
  }

  // ------------------------------------------------------------------ movimento

  private markMoved(units: readonly UnitState[]): void {
    for (const u of units) for (const x of allUnits({ units: [u] } as StackState)) this.moved.add(x.id);
  }

  private relocateTracked(
    player: PlayerId,
    source: StackState,
    units: readonly UnitState[],
    end: Point,
    endCity: string | null,
  ): StackState {
    const whole = this.state.stacks.includes(source) && units.length === source.units.length;
    const dest = this.state.stacks.includes(source)
      ? relocate(this.state, player, source, units, end, endCity)
      : placeUnits(this.state, player, units, end, endCity, source.exposed);
    if (whole && dest !== source) this.follow.set(source.id, dest.id);
    return dest;
  }

  private followStack(id: string): StackState | undefined {
    let cur = id;
    for (let guard = 0; this.follow.has(cur) && guard < 100; guard++) cur = this.follow.get(cur)!;
    return this.state.stacks.find((s) => s.id === cur);
  }

  /** Punto in cui il percorso si ferma contro un muro nemico, se lo incrocia. */
  private wallStop(player: PlayerId, domain: Domain, start: Point, path: readonly Point[]): Point | null {
    if (domain === 'air') return null;
    let prev = start;
    for (const p of path) {
      const hit = firstWallCrossing(this.state, this.ctx, player, prev, p);
      if (hit) {
        const len = distance(prev, p) || 1;
        const t = Math.max(0, hit.t - 1 / len);
        return [prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t];
      }
      prev = p;
    }
    return null;
  }

  private move(player: PlayerId, item: Queued, action: MoveAction): void {
    let check = checkMove(this.state, this.ctx, this.nav, player, this.retarget(action), this.moved);
    if (!check.ok && action.target) {
      // il bersaglio si è spostato fuori portata (o non c'è più): movimento normale
      const { target: _gone, ...plain } = action;
      check = checkMove(this.state, this.ctx, this.nav, player, plain, this.moved);
    }
    if (!check.ok) return this.fail(player, item, check.errors.join('; '));
    const plan = check.plan;
    const path = [...action.path.slice(0, -1), plan.end];
    if (plan.arrival === 'attack_stack') return this.attackStack(player, plan, path);
    if (plan.arrival === 'attack_city') {
      return this.attackCity(player, plan.source, plan.units, plan.domain, path, plan.endCity!, true);
    }
    this.plainMove(player, plan.source, plan.units, plan.domain, path, plan.endCity?.id ?? null);
  }

  /** Se la pila bersaglio si è già spostata in questo turno, l'attacco la insegue. */
  private retarget(action: MoveAction): MoveAction {
    if (!action.target) return action;
    const now = this.followStack(action.target);
    if (!now) {
      const { target: _gone, ...plain } = action;
      return plain;
    }
    if (now.id === action.target) return action;
    return { ...action, target: now.id, path: [now.pos] };
  }

  private plainMove(
    player: PlayerId,
    source: StackState,
    units: UnitState[],
    domain: Domain,
    path: readonly Point[],
    endCity: string | null,
  ): void {
    const from = source.pos;
    const stop = this.wallStop(player, domain, from, path);
    const end = stop ?? path[path.length - 1]!;
    this.markMoved(units);
    this.relocateTracked(player, source, units, end, stop ? null : endCity);
    this.events.push({
      kind: 'move',
      player,
      from,
      to: end,
      city: stop ? null : endCity,
      units: summarize(units),
      stoppedByWall: Boolean(stop),
    });
  }

  /** Trova il prossimo movimento non ancora eseguito della pila (nella coda del suo padrone). */
  private pendingMoveOf(target: StackState): { queue: (Queued | null)[]; pos: number } | null {
    if (target.owner === null) return null;
    const queue = this.queues.get(target.owner);
    if (!queue) return null;
    for (let pos = 0; pos < queue.length; pos++) {
      const q = queue[pos];
      if (q?.action.kind === 'move' && resolveStackRef(this.state, target.owner, q.action.from) === target) {
        return { queue, pos };
      }
    }
    return null;
  }

  private attackStack(player: PlayerId, plan: MovePlan, path: Point[]): void {
    let target: StackState | undefined = plan.target!;
    if (target.city) return this.attackCity(player, plan.source, plan.units, plan.domain, path, cityDef(this.ctx, target.city), true);

    let mutual = false;
    const pending = this.pendingMoveOf(target);
    if (pending) {
      const q = pending.queue[pending.pos]!;
      const counterTarget = q.action.kind === 'move' ? q.action.target : undefined;
      if (counterTarget === plan.source.id) {
        // si attaccano a vicenda: una sola battaglia a ruoli alternati
        mutual = true;
        pending.queue[pending.pos] = null;
        this.markMoved(target.units);
      } else {
        const { alwaysBlockMaxUnits, escapeFactor } = this.ctx.rules.turnblock;
        const n = target.units.length;
        const blocked = n <= alwaysBlockMaxUnits || this.rng.next() <= (plan.units.length / n) * escapeFactor;
        this.events.push({ kind: 'intercept', player, targetOwner: target.owner, at: target.pos, blocked });
        if (blocked) {
          this.markMoved(target.units);
        } else {
          pending.queue[pending.pos] = null;
          const targetId = target.id;
          this.execute(target.owner!, q);
          target = this.followStack(targetId);
          const range = plan.range * this.ctx.map.rangeScale;
          const reachable =
            target &&
            distance(plan.source.pos, target.pos) <= range + 0.5 &&
            segmentPassable(this.ctx, this.nav, plan.domain, plan.source.pos, target.pos) &&
            canAttack(this.state, this.ctx, player, target.owner);
          if (!reachable || !target) {
            return this.plainMove(player, plan.source, plan.units, plan.domain, path, null);
          }
          if (target.city) {
            return this.attackCity(player, plan.source, plan.units, plan.domain, [target.pos], cityDef(this.ctx, target.city), false);
          }
          path = [target.pos];
        }
      }
    }
    if (!target || !this.state.stacks.includes(target)) {
      return this.plainMove(player, plan.source, plan.units, plan.domain, path, null);
    }
    const stop = this.wallStop(player, plan.domain, plan.source.pos, path);
    if (stop) return this.plainMove(player, plan.source, plan.units, plan.domain, [stop], null);

    this.markMoved(plan.units);
    const at = target.pos;
    const result = this.fight(player, plan.source, plan.units, [target], null, target.owner, mutual, at);
    if (result?.winner === 'attacker' && result.survivors.length > 0) {
      this.relocateTracked(player, plan.source, result.survivors, at, null);
    }
  }

  private attackCity(
    player: PlayerId,
    source: StackState,
    units: UnitState[],
    domain: Domain,
    path: readonly Point[],
    city: CityDef,
    checkWalls: boolean,
  ): void {
    const approach = path.slice(0, -1);
    const stop = checkWalls ? this.wallStop(player, domain, source.pos, [...approach, city.pos]) : null;
    if (stop) return this.plainMove(player, source, units, domain, [stop], null);

    this.markMoved(units);
    const owner = this.state.cities[city.id]!.owner;
    const defenders = this.state.stacks.filter((s) => s.city === city.id && s.owner === owner);
    const result = this.fight(player, source, units, defenders, city.id, owner, false, city.pos);
    const survivors = result ? result.survivors : units;
    const won = !result || result.winner === 'attacker';
    if (!won || survivors.length === 0) {
      if (!this.state.stacks.includes(source) && survivors.length > 0) {
        this.relocateTracked(player, source, survivors, this.parkPoint(source.pos, approach, city.pos), null);
      }
      return;
    }
    const canTake = survivors.some((u) => {
      const def = this.ctx.catalog.unit(u.type);
      return def.canTakeCities && (def.domain !== 'air' || u.cargo.length > 0);
    });
    if (canTake) this.capture(player, source, survivors, city);
    else this.relocateTracked(player, source, survivors, this.parkPoint(source.pos, approach, city.pos), null);
  }

  /** Dove si fermano gli aerei (o le navi) che vincono ma non possono prendere la città. */
  private parkPoint(start: Point, approach: readonly Point[], city: Point): Point {
    const from = approach.length > 0 ? approach[approach.length - 1]! : start;
    const keep = this.ctx.rules.movement.citySnapDistance * this.ctx.map.rangeScale + 2;
    const d = distance(from, city);
    if (d <= keep) return from;
    const k = (d - keep) / d;
    return [from[0] + (city[0] - from[0]) * k, from[1] + (city[1] - from[1]) * k];
  }

  private capture(player: PlayerId, source: StackState, survivors: UnitState[], city: CityDef): void {
    const cs = this.state.cities[city.id]!;
    const from = cs.owner;
    cs.owner = player;
    cs.incomePct = startingIncomePct(isOwnTerritory(this.state, this.ctx, city.id), this.ctx.rules);
    const dest = this.relocateTracked(player, source, survivors, city.pos, city.id);

    let freeMilitia = 0;
    if (this.ctx.rules.reinforcements.freeMilitiaOnCapture) {
      freeMilitia = reinforcementsForPopulation(cs.population, this.ctx.rules);
      for (let i = 0; i < freeMilitia; i++) {
        dest.units.push(createUnit(this.state, this.ctx, this.ctx.rules.reinforcements.freeMilitiaUnit, city.id));
      }
    }

    let rare: string | null = null;
    const rares = [...this.ctx.catalog.units.values()].filter((u) => u.role === 'rare');
    if (rares.length > 0 && this.rng.next() * 100 < this.state.settings.rareUnitChancePct) {
      rare = this.rng.pick(rares).id;
      dest.units.push(createUnit(this.state, this.ctx, rare, null));
    }

    const isCapital = this.ctx.countries.get(city.country)?.capital === city.id;
    getPlayer(this.state, player).score += isCapital
      ? this.ctx.rules.scoring.capitalCaptured
      : this.ctx.rules.scoring.cityCaptured;
    this.events.push({ kind: 'capture', player, city: city.id, from, freeMilitia, rare });
  }

  /**
   * Battaglia tra le unità attaccanti (nella pila `source`) e le pile difensive
   * (più gli edifici, se si difende una città). Restituisce null se non c'è nessuno a difendere.
   */
  private fight(
    player: PlayerId,
    source: StackState,
    attackers: UnitState[],
    defenderStacks: StackState[],
    cityId: string | null,
    defenderOwner: PlayerId | null,
    mutual: boolean,
    at: Point,
  ): { winner: 'attacker' | 'defender'; survivors: UnitState[] } | null {
    const { catalog } = this.ctx;
    const city = cityId ? this.state.cities[cityId]! : null;
    const buildings = city && city.owner === defenderOwner ? city.buildings : [];
    const defUnits = defenderStacks.flatMap((s) => s.units);
    if (defUnits.length === 0 && buildings.length === 0) return null;

    const fort = buildings.reduce((s, b) => s + (catalog.building(b.type).effects.cityDefenceBonus ?? 0), 0);
    const result = resolveBattle(
      attackers.map((u) => makeFighter(catalog, u.id, u.type, u.hp)),
      [...defUnits, ...buildings].map((u) => makeFighter(catalog, u.id, u.type, u.hp)),
      { rules: this.ctx.rules.combat, dice: this.dice, mutual, defenderExtraDefence: fort },
    );
    const hpA = new Map(result.attackers.map((f) => [f.uid, f.hp]));
    const hpD = new Map(result.defenders.map((f) => [f.uid, f.hp]));

    const deadA = attackers.filter((u) => !hpA.has(u.id));
    const deadD = [...defUnits, ...buildings].filter((u) => !hpD.has(u.id));
    const survivors = attackers.filter((u) => hpA.has(u.id));
    for (const u of survivors) u.hp = hpA.get(u.id)!;

    const deadAIds = new Set(deadA.map((u) => u.id));
    source.units = source.units.filter((u) => !deadAIds.has(u.id));
    if (source.units.length === 0) this.state.stacks = this.state.stacks.filter((s) => s !== source);
    source.exposed = true;
    for (const s of defenderStacks) {
      s.units = s.units.filter((u) => hpD.has(u.id));
      for (const u of s.units) u.hp = hpD.get(u.id)!;
      s.exposed = true;
    }
    this.state.stacks = this.state.stacks.filter((s) => s.units.length > 0 || !defenderStacks.includes(s));
    if (city) city.buildings = city.buildings.filter((b) => hpD.has(b.id) || city.owner !== defenderOwner);

    // punteggio: valore delle unità distrutte (compreso il carico dei trasporti)
    const value = (dead: UnitState[]) =>
      dead.flatMap((u) => allUnits({ units: [u] } as StackState)).reduce((s, u) => s + catalog.typeStats(u.type).cost, 0) *
      this.ctx.rules.scoring.unitCostFactor;
    getPlayer(this.state, player).score += value(deadD);
    if (defenderOwner) getPlayer(this.state, defenderOwner).score += value(deadA);

    // danni collaterali alla popolazione della città attaccata
    if (city && cityId) {
      const collateral = attackers.reduce((s, u) => s + (catalog.units.get(u.type)?.collateral ?? 0), 0);
      if (collateral > 0) {
        const base = cityDef(this.ctx, cityId).population;
        const lossPct = Math.min(this.ctx.rules.population.collateralCapPct, collateral);
        city.population = Math.max(base * 0.05, city.population - (base * lossPct) / 100);
      }
    }

    this.events.push({
      kind: 'battle',
      id: `b${++this.battleCount}`,
      at,
      city: cityId,
      attacker: player,
      defender: defenderOwner,
      attackers: attackers.map((u) => ({ uid: u.id, type: u.type })),
      defenders: [...defUnits, ...buildings].map((u) => ({ uid: u.id, type: u.type })),
      winner: result.winner,
      mutual,
      exchanges: result.exchanges,
    });
    return { winner: result.winner, survivors };
  }

  // ------------------------------------------------------------------ trasporti

  private load(player: PlayerId, item: Queued, action: Extract<Action, { kind: 'load' }>): void {
    const check = checkLoad(this.state, this.ctx, player, action);
    if (!check.ok) return this.fail(player, item, check.errors.join('; '));
    applyLoad(check.plan);
    this.events.push({
      kind: 'load',
      player,
      at: check.plan.source.pos,
      units: summarize(check.plan.assignments.map((a) => a.unit)),
    });
  }

  private unload(player: PlayerId, item: Queued, action: Extract<Action, { kind: 'unload' }>): void {
    const check = checkUnload(this.state, this.ctx, this.nav, player, action);
    if (!check.ok) return this.fail(player, item, check.errors.join('; '));
    const plan = check.plan;
    takeFromCargo(plan.source, plan.units);
    this.events.push({ kind: 'unload', player, at: plan.end, units: summarize(plan.units) });
    if (plan.arrival === 'attack_city') {
      const landing: StackState = {
        id: newId(this.state, 's'),
        owner: player,
        pos: plan.source.pos,
        city: null,
        units: [...plan.units],
        exposed: false,
      };
      return this.attackCity(player, landing, plan.units, 'land', [plan.end], plan.endCity!, false);
    }
    this.markMoved(plan.units);
    placeUnits(this.state, player, plan.units, plan.end, plan.endCity?.id ?? null);
  }

  // ------------------------------------------------------------------ diplomazia

  private allianceCount(player: PlayerId): number {
    return this.state.players.filter((p) => p.id !== player && relationBetween(this.state, player, p.id) === 'alliance')
      .length;
  }

  private diplomacy(player: PlayerId, item: Queued, to: PlayerId, proposal: 'peace' | 'alliance' | 'war'): void {
    const other = getPlayer(this.state, to);
    if (to === player || other.status !== 'active') return this.fail(player, item, 'Giocatore non valido');
    const me = getPlayer(this.state, player);
    if (me.team != null && me.team === other.team) return this.fail(player, item, 'Le alleanze di squadra sono permanenti');
    const rel = this.state.relations[relationKey(player, to)]!;
    const turn = this.state.turn;
    const d = this.ctx.rules.diplomacy;

    if (proposal === 'war') {
      if (rel.relation === 'war') return this.fail(player, item, 'Siete già in guerra');
      if (rel.warFromTurn !== undefined) return this.fail(player, item, 'Guerra già dichiarata');
      if (rel.relation === 'alliance') {
        rel.relation = 'peace';
        rel.warFromTurn = turn + d.allianceToWarTurns;
        this.events.push({ kind: 'diplomacy', from: player, to, what: 'break_alliance' });
      } else {
        rel.warFromTurn = turn + d.peaceToWarTurns;
        this.events.push({ kind: 'diplomacy', from: player, to, what: 'declare_war' });
      }
      this.state.proposals = this.state.proposals.filter(
        (p) => !((p.from === player && p.to === to) || (p.from === to && p.to === player)),
      );
      return;
    }
    if (proposal === 'peace' && rel.relation !== 'war') return this.fail(player, item, 'La pace si propone solo in guerra');
    if (proposal === 'alliance') {
      if (rel.relation !== 'peace' || rel.warFromTurn !== undefined) {
        return this.fail(player, item, "L'alleanza si propone solo in pace");
      }
      if (this.allianceCount(player) >= this.state.settings.maxAlliances) {
        return this.fail(player, item, 'Hai raggiunto il numero massimo di alleanze');
      }
    }
    if (this.state.proposals.some((p) => p.from === player && p.to === to && p.kind === proposal)) return;
    this.state.proposals.push({ id: newId(this.state, 'p'), from: player, to, kind: proposal, turn });
    this.events.push({ kind: 'diplomacy', from: player, to, what: proposal === 'peace' ? 'propose_peace' : 'propose_alliance' });
  }

  private respond(player: PlayerId, item: Queued, proposalId: string, accept: boolean): void {
    const p = this.state.proposals.find((x) => x.id === proposalId && x.to === player);
    if (!p || p.turn >= this.state.turn) return this.fail(player, item, 'Proposta non trovata');
    this.state.proposals = this.state.proposals.filter((x) => x !== p);
    const rel = this.state.relations[relationKey(p.from, p.to)]!;
    if (!accept) {
      this.events.push({ kind: 'diplomacy', from: player, to: p.from, what: 'rejected' });
      return;
    }
    if (p.kind === 'peace' && rel.relation !== 'war') return this.fail(player, item, 'La proposta non è più valida');
    if (p.kind === 'alliance') {
      if (rel.relation !== 'peace' || rel.warFromTurn !== undefined) return this.fail(player, item, 'La proposta non è più valida');
      const max = this.state.settings.maxAlliances;
      if (this.allianceCount(p.from) >= max || this.allianceCount(p.to) >= max) {
        return this.fail(player, item, 'Numero massimo di alleanze raggiunto');
      }
    }
    rel.relation = p.kind;
    delete rel.warFromTurn;
    this.events.push({ kind: 'diplomacy', from: player, to: p.from, what: 'accepted' });
  }

  private sendMoney(player: PlayerId, item: Queued, to: PlayerId, amount: number): void {
    const me = getPlayer(this.state, player);
    const other = getPlayer(this.state, to);
    if (other.status !== 'active' || !areAllies(this.state, player, to) || player === to) {
      return this.fail(player, item, 'Si può inviare denaro solo agli alleati');
    }
    if (!Number.isFinite(amount) || amount <= 0) return this.fail(player, item, 'Importo non valido');
    if (amount > me.money) return this.fail(player, item, 'Fondi insufficienti');
    me.money -= amount;
    other.money += amount;
    this.events.push({ kind: 'money', from: player, to, amount });
  }

  private giveCity(player: PlayerId, item: Queued, cityId: string, to: PlayerId): void {
    const city = this.state.cities[cityId];
    if (!city || city.owner !== player) return this.fail(player, item, 'La città non è tua');
    if (!areAllies(this.state, player, to) || player === to) return this.fail(player, item, 'Si cedono città solo agli alleati');
    if (this.state.stacks.some((s) => s.city === cityId && s.owner === player)) {
      return this.fail(player, item, 'Si cedono solo città senza truppe');
    }
    city.owner = to;
    city.incomePct = startingIncomePct(isOwnTerritory(this.state, this.ctx, cityId), this.ctx.rules);
    this.events.push({ kind: 'city_given', from: player, to, city: cityId });
  }
}

// ------------------------------------------------------------------ fine e inizio turno

function eliminate(state: GameState, player: PlayerId, events: TurnEvent[]): void {
  const p = getPlayer(state, player);
  p.status = 'eliminated';
  for (const city of Object.values(state.cities)) if (city.owner === player) city.owner = null;
  // le truppe nelle città diventano presidi neutrali, le altre si sciolgono
  state.stacks = state.stacks.filter((s) => s.owner !== player || s.city !== null);
  for (const s of state.stacks) if (s.owner === player) s.owner = null;
  state.proposals = state.proposals.filter((x) => x.from !== player && x.to !== player);
  events.push({ kind: 'eliminated', player });
}

/** Eliminazioni e condizioni di vittoria a fine turno. */
export function endTurn(state: GameState, ctx: GameContext, events: TurnEvent[]): void {
  for (const p of state.players) {
    if (p.status !== 'active') continue;
    const cities = Object.values(state.cities).filter((c) => c.owner === p.id).length;
    let out = cities === 0;
    if (state.settings.victory === 'homeland' && p.homeCountry) {
      const capital = ctx.countries.get(p.homeCountry)?.capital;
      out ||= capital !== undefined && state.cities[capital]?.owner !== p.id;
    }
    if (out) eliminate(state, p.id, events);
  }

  const active = state.players.filter((p) => p.status === 'active');
  let winners: PlayerId[] | null = null;
  if (active.length <= 1) winners = active.map((p) => p.id);
  else if (active.every((a) => active.every((b) => a === b || relationBetween(state, a.id, b.id) === 'alliance'))) {
    winners = active.map((p) => p.id);
  } else if (state.turn >= state.settings.maxTurns) {
    const best = Math.max(...active.map((p) => p.score));
    winners = active.filter((p) => p.score === best).map((p) => p.id);
  }
  if (winners) {
    state.phase = 'ended';
    state.winners = winners;
    events.push({ kind: 'game_over', winners });
  }
}

/** Inizio del turno successivo: guerre che scattano, proposte scadute, economia, invisibilità. */
export function startTurn(state: GameState, ctx: GameContext, events: TurnEvent[]): void {
  state.turn += 1;
  for (const [key, rel] of Object.entries(state.relations)) {
    if (rel.warFromTurn !== undefined && rel.warFromTurn <= state.turn) {
      rel.relation = 'war';
      delete rel.warFromTurn;
      const [a, b] = key.split('|') as [PlayerId, PlayerId];
      events.push({ kind: 'war_started', players: [a, b] });
    }
  }
  // una proposta resta valida per il turno successivo a quello in cui è stata fatta
  state.proposals = state.proposals.filter((p) => p.turn >= state.turn - 1);

  for (const r of applyStartOfTurnEconomy(state, ctx)) {
    events.push({ kind: 'economy', ...r });
  }

  // le unità invisibili che hanno combattuto tornano nascoste rientrando in una città propria
  for (const s of state.stacks) {
    if (s.exposed && s.city && state.cities[s.city]?.owner === s.owner) s.exposed = false;
  }
}
