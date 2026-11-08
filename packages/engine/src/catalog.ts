import type { BuildingDef, Rules, UnitDef } from './schema/rules';

/** Statistiche comuni a unità ed edifici (gli edifici sono unità immobili). */
export interface TypeStats {
  id: string;
  kind: 'unit' | 'building';
  name: string;
  attack: number;
  defence: number;
  crit: number;
  hp: number;
  cost: number;
  /** Bonus di difesa contro specifici tipi di unità attaccanti. */
  bonusVs: Readonly<Record<string, number>>;
}

function bonusMap(def: UnitDef | BuildingDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of def.defenceBonus) for (const vs of b.vs) out[vs] = (out[vs] ?? 0) + b.value;
  return out;
}

/** Accesso rapido alle definizioni di unità ed edifici per id. */
export class Catalog {
  readonly units = new Map<string, UnitDef>();
  readonly buildings = new Map<string, BuildingDef>();
  private readonly stats = new Map<string, TypeStats>();

  constructor(readonly rules: Rules) {
    for (const u of rules.units) {
      this.units.set(u.id, u);
      this.stats.set(u.id, {
        id: u.id,
        kind: 'unit',
        name: u.name,
        attack: u.attack,
        defence: u.defence,
        crit: u.crit,
        hp: u.hp,
        cost: u.cost,
        bonusVs: bonusMap(u),
      });
    }
    for (const b of rules.buildings) {
      this.buildings.set(b.id, b);
      this.stats.set(b.id, {
        id: b.id,
        kind: 'building',
        name: b.name,
        attack: 0,
        defence: b.defence,
        crit: b.crit,
        hp: b.hp,
        cost: b.cost,
        bonusVs: bonusMap(b),
      });
    }
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
}
