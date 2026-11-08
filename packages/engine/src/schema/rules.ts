import { z } from 'zod';

/** Identificativo leggibile: minuscole, cifre e underscore. */
export const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id: solo minuscole, cifre e _');

export const Domain = z.enum(['land', 'naval', 'air']);
export type Domain = z.infer<typeof Domain>;

/** Ruoli: strategie e bonus agiscono sui ruoli, non sulle singole unità. */
export const UnitRole = z.enum([
  'ground_main_attack',
  'ground_main_defence',
  'ground_secondary_defence',
  'ground_special_defence',
  'ground_stealth',
  'naval_main_attack',
  'naval_stealth',
  'naval_transport',
  'air_main_attack',
  'air_special_attack',
  'air_stealth',
  'air_support',
  'air_transport',
  'general',
  'rare',
  'other',
]);
export type UnitRole = z.infer<typeof UnitRole>;

const int = () => z.number().int();

/** Bonus (o malus) alla difesa quando si difende contro certe unità. */
export const DefenceBonus = z.strictObject({
  vs: z.array(Id).min(1),
  value: int(),
});

export const Cargo = z.strictObject({
  capacity: int().min(1),
  /** "any_land" = qualunque unità di terra trasportabile; altrimenti elenco di id. */
  carries: z.union([z.literal('any_land'), z.array(Id).min(1)]),
});

export const UnitDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  domain: Domain,
  role: UnitRole,
  /** Danno massimo per colpo in attacco. */
  attack: int().min(0),
  /** Danno massimo per colpo in difesa. */
  defence: int().min(0),
  /** Probabilità di colpo critico, in %. */
  crit: z.number().min(0).max(100),
  hp: int().min(1),
  /** Raggio di movimento per turno, in punti raggio (vedi rangeScale della mappa). */
  move: z.number().min(0),
  view: z.number().min(0),
  cost: int().min(0),
  /** Danno alla popolazione quando attacca una città. */
  collateral: int().min(0).default(0),
  stealth: z.boolean().default(false),
  canTakeCities: z.boolean(),
  transportable: z.boolean().default(false),
  cargo: Cargo.optional(),
  defenceBonus: z.array(DefenceBonus).default([]),
});
export type UnitDef = z.infer<typeof UnitDef>;

export const BuildingEffects = z.strictObject({
  /** Riduzione del mantenimento per ogni unità prodotta in questa città. */
  upkeepReduction: int().min(0).optional(),
  /** Rinforzi extra a ogni ciclo di reclutamento. */
  extraReinforcements: int().min(0).optional(),
  /** Difesa extra a tutte le unità nella città. */
  cityDefenceBonus: int().min(0).optional(),
});

export const BuildingDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  defence: int().min(0),
  crit: z.number().min(0).max(100),
  hp: int().min(1),
  view: z.number().min(0),
  cost: int().min(0),
  /** Solo nelle città porto. */
  portOnly: z.boolean().default(false),
  defenceBonus: z.array(DefenceBonus).default([]),
  effects: BuildingEffects.default({}),
});
export type BuildingDef = z.infer<typeof BuildingDef>;

export const UnitsFile = z.strictObject({
  $schema: z.string().optional(),
  units: z.array(UnitDef).min(1),
});

export const BuildingsFile = z.strictObject({
  $schema: z.string().optional(),
  buildings: z.array(BuildingDef),
});

const pct = () => z.number().min(0);

/** Parametri di regola: ogni numero del gioco che si vuole poter ritoccare. */
export const RulesDefaults = z.strictObject({
  $schema: z.string().optional(),
  turn: z.strictObject({
    minSeconds: int().min(10),
    maxSeconds: int().min(10),
    defaultSeconds: int().min(10),
    /** Turni iniziali in cui tutti sono in pace tra loro. */
    peaceTurns: int().min(0),
  }),
  economy: z.strictObject({
    ownedStartPct: pct(),
    ownedGrowthPct: pct(),
    ownedNormalPct: pct(),
    ownedSlowGrowthPct: pct(),
    ownedCapPct: pct(),
    foreignStartPct: pct(),
    foreignGrowthPct: pct(),
    foreignCapPct: pct(),
    fullCountryBonusPct: pct(),
    /** Mantenimento per turno = costo / upkeepDivisor. */
    upkeepDivisor: z.number().positive(),
    blockPurchasesWhenNegative: z.boolean(),
  }),
  reinforcements: z.strictObject({
    cycleTurns: int().min(1),
    maxPerCity: int().min(1),
    accumulate: z.boolean(),
    freeMilitiaOnCapture: z.boolean(),
    freeMilitiaUnit: Id,
    /** Soglie di popolazione (milioni) → rinforzi, dalla più alta alla più bassa. */
    populationTable: z
      .array(z.strictObject({ minPopulation: z.number().min(0), reinforcements: int().min(0) }))
      .min(1),
  }),
  combat: z.strictObject({
    defenderWinsMutualKill: z.boolean(),
    healAfterBattle: z.boolean(),
    stackBonus: z.boolean(),
    /** Se true i bonus "contro X" si sommano anche al danno massimo del tiro. */
    defenceBonusAddsToMax: z.boolean(),
  }),
  turnblock: z.strictObject({
    /** Pile con al massimo queste unità restano sempre bloccate. */
    alwaysBlockMaxUnits: int().min(0),
    /** Fuga se rand() > (attaccanti / bersaglio) × escapeFactor. */
    escapeFactor: z.number().positive(),
  }),
  movement: z.strictObject({
    stackRange: z.enum(['average', 'minimum']),
    /** Distanza massima (punti raggio) tra pile per formare una linea difensiva. */
    defenceLineMaxDistance: z.number().positive(),
    /** Distanza massima (punti raggio) dal mare perché una città sia porto. */
    portMaxSeaDistance: z.number().positive(),
    /** Un movimento che finisce entro questa distanza (punti raggio) da una città entra nella città. */
    citySnapDistance: z.number().positive(),
    /** Distanza massima (punti raggio) a cui un trasporto può sbarcare il carico. */
    unloadMaxDistance: z.number().positive(),
  }),
  diplomacy: z.strictObject({
    peaceToWarTurns: int().min(0),
    allianceToWarTurns: int().min(0),
    maxAlliances: int().min(0),
  }),
  population: z.strictObject({
    collateralCapPct: pct(),
    recoveryPctPerTurn: pct(),
  }),
  neutrals: z.strictObject({
    /** Milizie in ogni città neutrale = rinforzi della città × questo fattore. */
    militiaPerReinforcement: z.number().min(0),
    /** I paesi con reddito nominale almeno pari a questo hanno anche Fanteria. */
    infantryMinCountryIncome: int().min(0),
    infantryUnit: Id,
    infantryPerCity: int().min(0),
  }),
  selection: z.strictObject({
    /** Valore di un paese = reddito nominale × incomeFactor + rinforzi × reinforcementValue. */
    incomeFactor: z.number().min(0),
    reinforcementValue: z.number().min(0),
  }),
  game: z.strictObject({
    startingFunds: int().min(0),
    initialCountries: int().min(1),
    maxTurns: int().min(1),
    lateJoinUntilTurn: int().min(0),
    countrySelectSeconds: int().min(5),
    disconnectGraceMinutes: z.number().min(0),
    kickAfterInactiveTurns: int().min(1),
    rareUnitChancePct: pct(),
  }),
});
export type RulesDefaults = z.infer<typeof RulesDefaults>;

export interface Rules {
  units: UnitDef[];
  buildings: BuildingDef[];
  defaults: RulesDefaults;
}

/** Valida i tre file di regole e ne controlla la coerenza reciproca. */
export function parseRules(raw: { units: unknown; buildings: unknown; defaults: unknown }): Rules {
  const units = UnitsFile.parse(raw.units).units;
  const buildings = BuildingsFile.parse(raw.buildings).buildings;
  const defaults = RulesDefaults.parse(raw.defaults);
  const errors = checkRules({ units, buildings, defaults });
  if (errors.length > 0) throw new Error(`Regole non coerenti:\n- ${errors.join('\n- ')}`);
  return { units, buildings, defaults };
}

export function checkRules(rules: Rules): string[] {
  const errors: string[] = [];
  const unitIds = new Set<string>();
  for (const u of rules.units) {
    if (unitIds.has(u.id)) errors.push(`unità duplicata: ${u.id}`);
    unitIds.add(u.id);
  }
  const allIds = new Set(unitIds);
  for (const b of rules.buildings) {
    if (allIds.has(b.id)) errors.push(`id edificio già usato: ${b.id}`);
    allIds.add(b.id);
  }
  for (const u of rules.units) {
    for (const bonus of u.defenceBonus) {
      for (const vs of bonus.vs) if (!unitIds.has(vs)) errors.push(`${u.id}: bonus contro unità sconosciuta "${vs}"`);
    }
    if (u.cargo && u.cargo.carries !== 'any_land') {
      for (const c of u.cargo.carries) if (!unitIds.has(c)) errors.push(`${u.id}: trasporta unità sconosciuta "${c}"`);
    }
  }
  for (const b of rules.buildings) {
    for (const bonus of b.defenceBonus) {
      for (const vs of bonus.vs) if (!unitIds.has(vs)) errors.push(`${b.id}: bonus contro unità sconosciuta "${vs}"`);
    }
  }
  const { reinforcements, turn, neutrals } = rules.defaults;
  if (!unitIds.has(reinforcements.freeMilitiaUnit)) {
    errors.push(`freeMilitiaUnit "${reinforcements.freeMilitiaUnit}" non esiste`);
  }
  if (!unitIds.has(neutrals.infantryUnit)) errors.push(`neutrals.infantryUnit "${neutrals.infantryUnit}" non esiste`);
  if (turn.minSeconds > turn.maxSeconds) errors.push('turn.minSeconds > turn.maxSeconds');
  if (turn.defaultSeconds < turn.minSeconds || turn.defaultSeconds > turn.maxSeconds) {
    errors.push('turn.defaultSeconds fuori dall’intervallo min–max');
  }
  const table = reinforcements.populationTable;
  for (let i = 1; i < table.length; i++) {
    if (table[i]!.minPopulation >= table[i - 1]!.minPopulation) {
      errors.push('populationTable deve essere ordinata dalla soglia più alta alla più bassa');
      break;
    }
  }
  return errors;
}
