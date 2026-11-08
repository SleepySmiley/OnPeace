import {
  isPurchasable,
  matchesTarget,
  type BuildingDef,
  type BuildingStatChange,
  type GeneralUpgradeDef,
  type Rules,
  type StrategyDef,
  type UnitDef,
  type UnitStatChange,
} from './schema/rules';

/** Statistiche comuni a unità ed edifici (gli edifici sono unità immobili). */
export interface TypeStats {
  id: string;
  kind: 'unit' | 'building';
  name: string;
  role: string;
  attack: number;
  defence: number;
  crit: number;
  hp: number;
  cost: number;
  /** Bonus di difesa contro specifici tipi di unità attaccanti. */
  bonusVs: Readonly<Record<string, number>>;
  /** Ruoli che l'unità colpisce per primi quando attacca. */
  hunts: readonly string[];
}

function bonusMap(def: UnitDef | BuildingDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of def.defenceBonus) for (const vs of b.vs) out[vs] = (out[vs] ?? 0) + b.value;
  return out;
}

const clamp = (v: number, min: number, max = Infinity) => Math.min(max, Math.max(min, v));

function changeUnit(def: UnitDef, change: UnitStatChange, mode: 'set' | 'add'): void {
  const apply = (cur: number, v: number | undefined) => (v === undefined ? cur : mode === 'set' ? v : cur + v);
  def.attack = apply(def.attack, change.attack);
  def.defence = apply(def.defence, change.defence);
  def.crit = apply(def.crit, change.crit);
  def.hp = apply(def.hp, change.hp);
  def.move = apply(def.move, change.move);
  def.view = apply(def.view, change.view);
  def.cost = apply(def.cost, change.cost);
  def.cityDefence = apply(def.cityDefence, change.cityDefence);
  def.lineDefence = apply(def.lineDefence, change.lineDefence);
  if (def.cargo) def.cargo.capacity = apply(def.cargo.capacity, change.capacity);
}

function changeBuilding(def: BuildingDef, change: BuildingStatChange, mode: 'set' | 'add'): void {
  const apply = (cur: number, v: number | undefined) => (v === undefined ? cur : mode === 'set' ? v : cur + v);
  def.defence = apply(def.defence, change.defence);
  def.crit = apply(def.crit, change.crit);
  def.hp = apply(def.hp, change.hp);
  def.view = apply(def.view, change.view);
  def.cost = apply(def.cost, change.cost);
}

/** L'unità con le modifiche della strategia (le rare e il Generale restano com'erano). */
export function applyStrategyToUnit(base: UnitDef, strategy: StrategyDef): UnitDef {
  if (!isPurchasable(base)) return base;
  const def = structuredClone(base);
  for (const m of strategy.modifiers) {
    if (!matchesTarget(base, m.target)) continue;
    if (m.set) changeUnit(def, m.set, 'set');
    if (m.add) changeUnit(def, m.add, 'add');
    if (m.defenceBonus) def.defenceBonus.push(...m.defenceBonus);
  }
  def.attack = clamp(def.attack, 0);
  def.defence = clamp(def.defence, 0);
  def.crit = clamp(def.crit, 0, 100);
  def.hp = clamp(def.hp, 1);
  def.move = clamp(def.move, 0);
  def.view = clamp(def.view, 0);
  def.cost = clamp(def.cost, 0);
  if (def.cargo) def.cargo.capacity = clamp(def.cargo.capacity, 1);
  return def;
}

export function applyStrategyToBuilding(base: BuildingDef, strategy: StrategyDef): BuildingDef {
  const def = structuredClone(base);
  for (const m of strategy.buildingModifiers) {
    if (m.buildings !== 'all' && !m.buildings.includes(base.id)) continue;
    if (m.set) changeBuilding(def, m.set, 'set');
    if (m.add) changeBuilding(def, m.add, 'add');
  }
  def.defence = clamp(def.defence, 0);
  def.crit = clamp(def.crit, 0, 100);
  def.hp = clamp(def.hp, 1);
  def.view = clamp(def.view, 0);
  def.cost = clamp(def.cost, 0);
  return def;
}

function unitStats(u: UnitDef): TypeStats {
  return {
    id: u.id,
    kind: 'unit',
    name: u.name,
    role: u.role,
    attack: u.attack,
    defence: u.defence,
    crit: u.crit,
    hp: u.hp,
    cost: u.cost,
    bonusVs: bonusMap(u),
    hunts: u.hunts,
  };
}

function buildingStats(b: BuildingDef): TypeStats {
  return {
    id: b.id,
    kind: 'building',
    name: b.name,
    role: 'building',
    attack: 0,
    defence: b.defence,
    crit: b.crit,
    hp: b.hp,
    cost: b.cost,
    bonusVs: bonusMap(b),
    hunts: [],
  };
}

/**
 * Accesso rapido alle definizioni di unità, edifici e strategie per id.
 * I metodi "…For(id, strategia)" restituiscono le definizioni modificate dalla strategia.
 */
export class Catalog {
  readonly units = new Map<string, UnitDef>();
  readonly buildings = new Map<string, BuildingDef>();
  readonly strategies = new Map<string, StrategyDef>();
  readonly generalUpgrades = new Map<string, GeneralUpgradeDef>();
  private readonly stats = new Map<string, TypeStats>();
  private readonly cache = new Map<string, UnitDef | BuildingDef | TypeStats>();

  constructor(readonly rules: Rules) {
    for (const u of rules.units) {
      this.units.set(u.id, u);
      this.stats.set(u.id, unitStats(u));
    }
    for (const b of rules.buildings) {
      this.buildings.set(b.id, b);
      this.stats.set(b.id, buildingStats(b));
    }
    for (const s of rules.strategies) this.strategies.set(s.id, s);
    for (const g of rules.general.upgrades) this.generalUpgrades.set(g.id, g);
  }

  unit(id: string): UnitDef {
    const u = this.units.get(id);
    if (!u) throw new Error(`unità sconosciuta: ${id}`);
    return u;
  }

  building(id: string): BuildingDef {
    const b = this.buildings.get(id);
    if (!b) throw new Error(`edificio sconosciuto: ${id}`);
    return b;
  }

  typeStats(id: string): TypeStats {
    const s = this.stats.get(id);
    if (!s) throw new Error(`tipo sconosciuto: ${id}`);
    return s;
  }

  isBuilding(id: string): boolean {
    return this.buildings.has(id);
  }

  /** Id dell'unità Generale. */
  get generalUnit(): string {
    return this.rules.general.unit;
  }

  strategy(id: string): StrategyDef {
    const s = this.strategies.get(id);
    if (!s) throw new Error(`strategia sconosciuta: ${id}`);
    return s;
  }

  private cached<T extends UnitDef | BuildingDef | TypeStats>(key: string, make: () => T): T {
    let v = this.cache.get(key);
    if (!v) {
      v = make();
      this.cache.set(key, v);
    }
    return v as T;
  }

  /** Unità con la strategia applicata (strategia null o sconosciuta = valori base). */
  unitFor(id: string, strategy: string | null): UnitDef {
    const s = strategy ? this.strategies.get(strategy) : undefined;
    if (!s) return this.unit(id);
    return this.cached(`u|${s.id}|${id}`, () => applyStrategyToUnit(this.unit(id), s));
  }

  buildingFor(id: string, strategy: string | null): BuildingDef {
    const s = strategy ? this.strategies.get(strategy) : undefined;
    if (!s) return this.building(id);
    return this.cached(`b|${s.id}|${id}`, () => applyStrategyToBuilding(this.building(id), s));
  }

  statsFor(id: string, strategy: string | null): TypeStats {
    const s = strategy ? this.strategies.get(strategy) : undefined;
    if (!s) return this.typeStats(id);
    return this.cached(`s|${s.id}|${id}`, () =>
      this.isBuilding(id) ? buildingStats(this.buildingFor(id, s.id)) : unitStats(this.unitFor(id, s.id)),
    );
  }
}
