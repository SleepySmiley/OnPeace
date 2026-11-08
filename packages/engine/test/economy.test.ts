import { describe, expect, it } from 'vitest';
import {
  RuleError,
  allUnits,
  applyPurchase,
  applyStartOfTurnEconomy,
  cityIncome,
  computeEconomy,
  countryValue,
  createGame,
  createUnit,
  finishSelection,
  isOwnTerritory,
  isReinforcementTurn,
  relationKey,
  selectCountry,
  stackInCity,
  startingIncomePct,
  unitUpkeep,
  validatePurchase,
  type GameState,
} from '../src';
import { loadContext } from './helpers';

const ctx = loadContext();
const countries = ctx.map.countries;
const c1 = countries[0]!;
const c2 = countries[1]!;
const citiesOf = (countryId: string) => ctx.citiesByCountry.get(countryId)!;
const nonCapital = (countryId: string) =>
  citiesOf(countryId).find((c) => c.id !== ctx.countries.get(countryId)!.capital)!;

function newGame(settings = {}): GameState {
  return createGame(ctx, {
    id: 'g',
    seed: 1,
    players: [
      { id: 'a', name: 'Anna', color: '#c33' },
      { id: 'b', name: 'Bruno', color: '#33c' },
    ],
    settings,
  });
}

/** Partita al turno 1 con "a" padrone di c1 e "b" di c2. */
function startedGame(): GameState {
  const s = newGame({ startingFunds: 100_000 });
  selectCountry(s, ctx, 'a', c1.id);
  selectCountry(s, ctx, 'b', c2.id);
  finishSelection(s);
  return s;
}

describe('preparazione della partita', () => {
  it('tutte le città partono neutrali e presidiate', () => {
    const s = newGame();
    expect(Object.values(s.cities).every((c) => c.owner === null)).toBe(true);
    for (const city of ctx.map.cities) {
      const garrison = stackInCity(s, null, city.id);
      expect(garrison?.units.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('scegliere un paese passa città e presidi al giocatore e costa il suo valore', () => {
    const s = newGame();
    const value = countryValue(ctx, c1.id);
    selectCountry(s, ctx, 'a', c1.id);
    const a = s.players[0]!;
    expect(a.money).toBe(ctx.rules.game.startingFunds - value);
    expect(a.homeCountry).toBe(c1.id);
    for (const city of citiesOf(c1.id)) {
      expect(s.cities[city.id]!.owner).toBe('a');
      expect(stackInCity(s, 'a', city.id)).toBeDefined();
    }
  });

  it('rifiuta paese già preso, troppi paesi e fondi insufficienti', () => {
    const s = newGame();
    selectCountry(s, ctx, 'a', c1.id);
    expect(() => selectCountry(s, ctx, 'b', c1.id)).toThrow(RuleError);
    expect(() => selectCountry(s, ctx, 'a', c2.id)).toThrow(/tutti i paesi/);
    const poor = newGame({ startingFunds: 0 });
    expect(() => selectCountry(poor, ctx, 'a', c1.id)).toThrow(/Fondi insufficienti/);
  });

  it('a fine scelta parte il turno 1; chi non ha paesi è fuori', () => {
    const s = newGame();
    selectCountry(s, ctx, 'a', c1.id);
    finishSelection(s);
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe(1);
    expect(s.players[1]!.status).toBe('left');
  });

  it('relazioni iniziali: guerra, alleanza tra compagni di squadra', () => {
    const s = createGame(ctx, {
      id: 'g',
      seed: 1,
      players: [
        { id: 'a', name: 'A', color: '#000', team: 1 },
        { id: 'b', name: 'B', color: '#000', team: 1 },
        { id: 'c', name: 'C', color: '#000', team: 2 },
      ],
    });
    expect(s.relations[relationKey('a', 'b')]!.relation).toBe('alliance');
    expect(s.relations[relationKey('a', 'c')]!.relation).toBe('war');
  });
});

describe('economia', () => {
  it('reddito pieno + bonus del paese completo − mantenimento', () => {
    const s = startedGame();
    const report = computeEconomy(s, ctx, 'a');
    const income = citiesOf(c1.id).reduce((sum, c) => sum + c.income, 0);
    expect(report.income).toBe(income);
    expect(report.bonus).toBe(Math.round(income * 0.2));
    const upkeep = s.stacks
      .filter((st) => st.owner === 'a')
      .flatMap(allUnits)
      .reduce((sum, u) => sum + ctx.catalog.unit(u.type).cost / 10, 0);
    expect(report.upkeep).toBe(Math.round(upkeep));
    const before = s.players[0]!.money;
    s.turn = 2;
    applyStartOfTurnEconomy(s, ctx);
    expect(s.players[0]!.money).toBe(before + report.net);
  });

  it('capitale conquistata: rende il 50%, poi 75, 100 e +2% a turno', () => {
    const s = startedGame();
    const capital = c2.capital;
    s.cities[capital]!.owner = 'a';
    s.cities[capital]!.incomePct = startingIncomePct(isOwnTerritory(s, ctx, capital), ctx.rules);
    expect(s.cities[capital]!.incomePct).toBe(50);
    const pcts: number[] = [];
    for (let t = 2; t <= 5; t++) {
      s.turn = t;
      applyStartOfTurnEconomy(s, ctx);
      pcts.push(s.cities[capital]!.incomePct);
    }
    expect(pcts).toEqual([75, 100, 102, 104]);
  });

  it('città senza la capitale del suo paese: territorio straniero, 10% e tetto al 50%', () => {
    const s = startedGame();
    const city = nonCapital(c2.id);
    s.cities[city.id]!.owner = 'a';
    expect(isOwnTerritory(s, ctx, city.id)).toBe(false);
    s.cities[city.id]!.incomePct = startingIncomePct(false, ctx.rules);
    expect(s.cities[city.id]!.incomePct).toBe(10);
    for (let t = 2; t <= 20; t++) {
      s.turn = t;
      applyStartOfTurnEconomy(s, ctx);
    }
    expect(s.cities[city.id]!.incomePct).toBe(50);
    expect(cityIncome(s, ctx, city.id)).toBeCloseTo(city.income * 0.5, 5);
  });

  it('rinforzi ai turni 1, 5, 9…', () => {
    const turns = Array.from({ length: 12 }, (_, i) => i + 1).filter((t) => isReinforcementTurn(t, ctx.rules));
    expect(turns).toEqual([1, 5, 9]);
  });

  it('la Banca riduce il mantenimento delle unità prodotte in quella città', () => {
    const s = startedGame();
    const city = citiesOf(c1.id)[0]!;
    const unit = createUnit(s, ctx, 'tanks', city.id);
    expect(unitUpkeep(s, ctx, 'a', unit)).toBe(12);
    s.cities[city.id]!.buildings.push(createUnit(s, ctx, 'bank', city.id));
    expect(unitUpkeep(s, ctx, 'a', unit)).toBe(11);
  });
});

describe('acquisti', () => {
  const capitalOf = (countryId: string) => ctx.countries.get(countryId)!.capital;

  it('acquisto valido: denaro e rinforzi scendono, le unità compaiono in città', () => {
    const s = startedGame();
    const city = capitalOf(c1.id);
    const money = s.players[0]!.money;
    const reinf = s.cities[city]!.reinforcements;
    const before = stackInCity(s, 'a', city)!.units.length;
    applyPurchase(s, ctx, 'a', { city, units: [{ type: 'infantry', count: 2 }], buildings: [] });
    expect(s.players[0]!.money).toBe(money - 140);
    expect(s.cities[city]!.reinforcements).toBe(reinf - 2);
    expect(stackInCity(s, 'a', city)!.units.length).toBe(before + 2);
  });

  it('navi solo nei porti', () => {
    const s = startedGame();
    const inland = ctx.map.cities.find((c) => !c.port && s.cities[c.id]!.owner === 'a');
    if (!inland) return; // la mappa potrebbe non averne
    const errors = validatePurchase(s, ctx, 'a', {
      city: inland.id,
      units: [{ type: 'destroyer', count: 1 }],
      buildings: [],
    });
    expect(errors.join()).toMatch(/solo nei porti/);
  });

  it('senza la capitale del paese non si compra', () => {
    const s = startedGame();
    const city = nonCapital(c2.id);
    s.cities[city.id]!.owner = 'a';
    const errors = validatePurchase(s, ctx, 'a', { city: city.id, units: [{ type: 'militia', count: 1 }], buildings: [] });
    expect(errors.join()).toMatch(/capitale/);
  });

  it('non si superano i rinforzi della città', () => {
    const s = startedGame();
    const city = capitalOf(c1.id);
    const n = s.cities[city]!.reinforcements + 1;
    const errors = validatePurchase(s, ctx, 'a', { city, units: [{ type: 'militia', count: n }], buildings: [] });
    expect(errors.join()).toMatch(/Rinforzi insufficienti/);
  });

  it('un edificio per tipo; saldo negativo blocca gli acquisti', () => {
    const s = startedGame();
    const city = capitalOf(c1.id);
    applyPurchase(s, ctx, 'a', { city, units: [], buildings: ['radar'] });
    expect(validatePurchase(s, ctx, 'a', { city, units: [], buildings: ['radar'] }).join()).toMatch(/c'è già/);
    s.players[0]!.money = -5;
    expect(validatePurchase(s, ctx, 'a', { city, units: [{ type: 'militia', count: 1 }], buildings: [] }).join()).toMatch(
      /saldo negativo/,
    );
  });
});
