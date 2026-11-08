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
  /** Comandanti rari: danno bonus alla propria pila. */
  'commander',
  'other',
]);
export type UnitRole = z.infer<typeof UnitRole>;

const int = () => z.number().int();

/** Bonus (o malus) alla difesa quando si difende contro certe unità. */
export const DefenceBonus = z.strictObject({
  vs: z.array(Id).min(1),
  value: int(),
});

/**
 * A quali unità si applica un modificatore (strategia) o un bonus di comando (aura).
 * Basta che l'unità corrisponda a uno dei criteri.
 */
export const UnitTarget = z
  .strictObject({
    /** Tutte le unità (per le strategie: tutte quelle acquistabili). */
    all: z.boolean().optional(),
    units: z.array(Id).min(1).optional(),
    roles: z.array(UnitRole).min(1).optional(),
    domains: z.array(Domain).min(1).optional(),
  })
  .refine((t) => t.all === true || t.units || t.roles || t.domains, 'bersaglio vuoto');
export type UnitTarget = z.infer<typeof UnitTarget>;

/** Bonus che un comandante (o il Generale) dà alle unità della sua pila. Valori da sommare. */
export const AuraEffect = z.strictObject({
  target: UnitTarget,
  attack: int().optional(),
  defence: int().optional(),
  crit: z.number().optional(),
  hp: int().optional(),
  move: z.number().optional(),
  view: z.number().optional(),
  /** Variazione del mantenimento per turno di ogni unità (negativa = risparmio). */
  upkeep: z.number().optional(),
});
export type AuraEffect = z.infer<typeof AuraEffect>;

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
  /** Difesa extra quando difende in una città propria. */
  cityDefence: int().default(0),
  /** Difesa extra quando la pila fa parte di una linea difensiva. */
  lineDefence: int().default(0),
  /** Unità rara: non si compra, si trova conquistando le città, non paga mantenimento. */
  rare: z.boolean().default(false),
  /** Peso nell'estrazione delle unità rare (più alto = più frequente). */
  rareWeight: z.number().min(0).default(1),
  /** Bonus alle unità della stessa pila (comandanti). */
  aura: z.array(AuraEffect).default([]),
  /** Si consuma dopo aver attaccato (missili, testate, guastatori). */
  oneShot: z.boolean().default(false),
  /** Quando attacca, colpisce per prime le unità di questi ruoli (es. i comandanti). */
  hunts: z.array(UnitRole).default([]),
});
export type UnitDef = z.infer<typeof UnitDef>;

/** Le unità che si comprano nelle città (e su cui agiscono le strategie). */
export const isPurchasable = (u: UnitDef) => !u.rare && u.role !== 'general';

export function matchesTarget(def: UnitDef, t: UnitTarget): boolean {
  return (
    t.all === true ||
    (t.units?.includes(def.id) ?? false) ||
    (t.roles?.includes(def.role) ?? false) ||
    (t.domains?.includes(def.domain) ?? false)
  );
}

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

/** Valori fissati (set) o sommati (add) da una strategia. */
const UnitStatChange = z.strictObject({
  attack: int().optional(),
  defence: int().optional(),
  crit: z.number().optional(),
  hp: int().optional(),
  move: z.number().optional(),
  view: z.number().optional(),
  cost: int().optional(),
  /** Capacità di carico (solo per i trasporti). */
  capacity: int().optional(),
  cityDefence: int().optional(),
  lineDefence: int().optional(),
});
export type UnitStatChange = z.infer<typeof UnitStatChange>;

const BuildingStatChange = z.strictObject({
  defence: int().optional(),
  crit: z.number().optional(),
  hp: int().optional(),
  view: z.number().optional(),
  cost: int().optional(),
});
export type BuildingStatChange = z.infer<typeof BuildingStatChange>;

export const StrategyModifier = z.strictObject({
  target: UnitTarget,
  /** Prima si fissano i valori di `set`, poi si sommano quelli di `add`. */
  set: UnitStatChange.optional(),
  add: UnitStatChange.optional(),
  /** Bonus di difesa contro certe unità, in aggiunta a quelli dell'unità. */
  defenceBonus: z.array(DefenceBonus).optional(),
});

export const BuildingModifier = z.strictObject({
  buildings: z.union([z.literal('all'), z.array(Id).min(1)]),
  set: BuildingStatChange.optional(),
  add: BuildingStatChange.optional(),
});

/**
 * Strategia (dottrina militare): si sceglie una per partita e modifica le unità
 * acquistabili e gli edifici del giocatore. Non tocca unità rare e Generale.
 */
export const StrategyDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  modifiers: z.array(StrategyModifier).default([]),
  buildingModifiers: z.array(BuildingModifier).default([]),
});
export type StrategyDef = z.infer<typeof StrategyDef>;

export const GeneralUpgradeDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  aura: z.array(AuraEffect).default([]),
  /** Rinforzi extra, a ogni ciclo, nella città in cui si trova il Generale. */
  extraReinforcements: int().min(0).default(0),
});
export type GeneralUpgradeDef = z.infer<typeof GeneralUpgradeDef>;

export const UnitsFile = z.strictObject({
  $schema: z.string().optional(),
  units: z.array(UnitDef).min(1),
});

export const BuildingsFile = z.strictObject({
  $schema: z.string().optional(),
  buildings: z.array(BuildingDef),
});

export const StrategiesFile = z.strictObject({
  $schema: z.string().optional(),
  strategies: z.array(StrategyDef),
});

/** Il Generale: un'unità per giocatore con potenziamenti scelti a inizio partita. */
export const GeneralFile = z.strictObject({
  $schema: z.string().optional(),
  /** Id dell'unità Generale in units.json. */
  unit: Id,
  /** Quanti potenziamenti sceglie ogni giocatore. */
  picks: int().min(0),
  /** Potenziamenti assegnati a chi non sceglie (nell'ordine, fino a `picks`). */
  defaultUpgrades: z.array(Id),
  upgrades: z.array(GeneralUpgradeDef),
});
export type GeneralRules = Omit<z.infer<typeof GeneralFile>, '$schema'>;

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
  scoring: z.strictObject({
    /** Punti per unità nemica distrutta = costo × questo fattore. */
    unitCostFactor: z.number().min(0),
    cityCaptured: z.number().min(0),
    capitalCaptured: z.number().min(0),
  }),
  stealth: z.strictObject({
    /** Raggio di rilevamento = vista × questo fattore. */
    detectionFactor: z.number().min(0),
  }),
  vision: z.strictObject({
    /** Raggio visivo di una città (punti raggio), a cui si sommano gli edifici. */
    cityView: z.number().min(0),
    /** Fuori dal raggio visivo si vede la posizione delle pile nemiche (non la composizione). */
    showFoggedStacks: z.boolean(),
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
    /** Strategie attive di default nelle nuove partite. */
    strategies: z.boolean(),
    /** Generale attivo di default nelle nuove partite. */
    general: z.boolean(),
  }),
});
export type RulesDefaults = z.infer<typeof RulesDefaults>;

export interface Rules {
  units: UnitDef[];
  buildings: BuildingDef[];
  defaults: RulesDefaults;
  strategies: StrategyDef[];
  general: GeneralRules;
}

/** I file di regole così come si leggono da data/rules/ (prima della validazione). */
export interface RawRules {
  units: unknown;
  buildings: unknown;
  defaults: unknown;
  strategies: unknown;
  general: unknown;
}

/** Valida i file di regole e ne controlla la coerenza reciproca. */
export function parseRules(raw: RawRules): Rules {
  const units = UnitsFile.parse(raw.units).units;
  const buildings = BuildingsFile.parse(raw.buildings).buildings;
  const defaults = RulesDefaults.parse(raw.defaults);
  const strategies = StrategiesFile.parse(raw.strategies).strategies;
  const { $schema: _schema, ...general } = GeneralFile.parse(raw.general);
  const rules: Rules = { units, buildings, defaults, strategies, general };
  const errors = checkRules(rules);
  if (errors.length > 0) throw new Error(`Regole non coerenti:\n- ${errors.join('\n- ')}`);
  return rules;
}

function checkTarget(where: string, t: UnitTarget, unitIds: ReadonlySet<string>, errors: string[]): void {
  for (const id of t.units ?? []) if (!unitIds.has(id)) errors.push(`${where}: unità sconosciuta "${id}"`);
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
  for (const u of rules.units) {
    for (const a of u.aura) checkTarget(`${u.id} (aura)`, a.target, unitIds, errors);
  }

  const strategyIds = new Set<string>();
  const buildingIds = new Set(rules.buildings.map((b) => b.id));
  for (const s of rules.strategies) {
    if (strategyIds.has(s.id)) errors.push(`strategia duplicata: ${s.id}`);
    strategyIds.add(s.id);
    for (const m of s.modifiers) {
      checkTarget(`strategia ${s.id}`, m.target, unitIds, errors);
      for (const b of m.defenceBonus ?? []) {
        for (const vs of b.vs) if (!unitIds.has(vs)) errors.push(`strategia ${s.id}: bonus contro unità sconosciuta "${vs}"`);
      }
    }
    for (const m of s.buildingModifiers) {
      if (m.buildings === 'all') continue;
      for (const id of m.buildings) if (!buildingIds.has(id)) errors.push(`strategia ${s.id}: edificio sconosciuto "${id}"`);
    }
  }

  const g = rules.general;
  const generalUnit = rules.units.find((u) => u.id === g.unit);
  if (!generalUnit) errors.push(`general.unit "${g.unit}" non esiste`);
  else if (generalUnit.role !== 'general') errors.push(`general.unit "${g.unit}" deve avere ruolo "general"`);
  const upgradeIds = new Set<string>();
  for (const up of g.upgrades) {
    if (upgradeIds.has(up.id)) errors.push(`potenziamento del Generale duplicato: ${up.id}`);
    upgradeIds.add(up.id);
    for (const a of up.aura) checkTarget(`Generale ${up.id}`, a.target, unitIds, errors);
  }
  for (const id of g.defaultUpgrades) {
    if (!upgradeIds.has(id)) errors.push(`general.defaultUpgrades: potenziamento sconosciuto "${id}"`);
  }
  if (new Set(g.defaultUpgrades).size < Math.min(g.picks, g.upgrades.length)) {
    errors.push('general.defaultUpgrades deve contenere almeno `picks` potenziamenti diversi');
  }
  if (g.picks > g.upgrades.length) errors.push('general.picks supera il numero di potenziamenti');

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
