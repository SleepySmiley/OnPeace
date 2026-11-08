/** Contenuti di M5: strategie, Generale e comandanti, unità rare. */
import { describe, expect, it } from 'vitest';
import {
  MapDef,
  NavGrid,
  RuleError,
  boostsFor,
  computeEconomy,
  createContext,
  createGame,
  createUnit,
  finishSelection,
  fighterFrom,
  groupRange,
  purchaseCost,
  resolveBattle,
  resolveTurn,
  selectCountry,
  setDoctrine,
  stackInCity,
  statsOf,
  viewFor,
  type Action,
  type GameSettings,
  type GameState,
  type StackState,
  type TurnEvent,
} from '../src';
import { loadRules, scriptedDice } from './helpers';

/** Striscia di terra: A x 20–140 | C (neutrale) x 140–260 | B x 260–380, mare attorno. */
const map = MapDef.parse({
  id: 'contenuti',
  name: 'Contenuti',
  width: 400,
  height: 200,
  rangeScale: 10,
  countries: [
    { id: 'aa', name: 'A', capital: 'a1', shape: [[[[20, 20], [140, 20], [140, 180], [20, 180]]]] },
    { id: 'cc', name: 'C', capital: 'c1', shape: [[[[140, 20], [260, 20], [260, 180], [140, 180]]]] },
    { id: 'bb', name: 'B', capital: 'b1', shape: [[[[260, 20], [380, 20], [380, 180], [260, 180]]]] },
  ],
  cities: [
    { id: 'a1', name: 'A1', country: 'aa', pos: [50, 100], population: 2, income: 300, port: false },
    { id: 'a2', name: 'A2', country: 'aa', pos: [100, 30], population: 1, income: 150, port: true },
    { id: 'c1', name: 'C1', country: 'cc', pos: [200, 100], population: 2, income: 300, port: false },
    { id: 'c2', name: 'C2', country: 'cc', pos: [200, 30], population: 1, income: 250, port: true },
    { id: 'b1', name: 'B1', country: 'bb', pos: [350, 100], population: 2, income: 300, port: false },
    { id: 'b2', name: 'B2', country: 'bb', pos: [300, 160], population: 1, income: 150, port: true },
  ],
});
const ctx = createContext(map, loadRules());
const nav = new NavGrid(map);
const { catalog } = ctx;

function game(
  opts: { a?: { strategy: string | null; general: string[] }; settings?: Partial<GameSettings> } = {},
): GameState {
  const s = createGame(ctx, {
    id: 'm5',
    seed: 7,
    players: [
      { id: 'a', name: 'A', color: '#c33' },
      { id: 'b', name: 'B', color: '#33c' },
    ],
    settings: { startingFunds: 100_000, ...opts.settings },
  });
  if (opts.a) setDoctrine(s, ctx, 'a', opts.a);
  selectCountry(s, ctx, 'a', 'aa');
  selectCountry(s, ctx, 'b', 'bb');
  finishSelection(s, ctx);
  s.turn = 2;
  return s;
}

function place(s: GameState, owner: string | null, types: string[], pos: [number, number], city: string | null = null) {
  const stack: StackState = {
    id: `t${++s.nextId}`,
    owner,
    pos,
    city,
    units: types.map((t) => createUnit(s, ctx, t, null, owner)),
    exposed: false,
  };
  s.stacks.push(stack);
  return stack;
}

const n = (type: string, count: number) => Array.from({ length: count }, () => type);
const of = <K extends TurnEvent['kind']>(events: TurnEvent[], kind: K) =>
  events.filter((e): e is Extract<TurnEvent, { kind: K }> => e.kind === kind);
const run = (s: GameState, actions: Record<string, Action[]>) => resolveTurn(s, ctx, nav, actions);

describe('strategie', () => {
  it('modificano le unità acquistabili e lasciano intatti i valori base', () => {
    const tanks = catalog.unitFor('tanks', 'assalto');
    expect(tanks).toMatchObject({ attack: 8, crit: 7, move: 8, cost: 90 });
    expect(tanks.defenceBonus).toEqual(
      expect.arrayContaining([
        { vs: ['infantry'], value: 1 },
        { vs: ['militia'], value: -1 },
      ]),
    );
    expect(catalog.unit('tanks').cost).toBe(120);
    expect(catalog.unitFor('infantry', 'assalto')).toMatchObject({ defence: 5, cityDefence: -1, lineDefence: -1 });
    // "tutte le unità": +4 movimento e −1 difesa, poi la Milizia ha valori propri
    expect(catalog.unitFor('infantry', 'guerra_lampo')).toMatchObject({ move: 10, defence: 5, view: 18 });
    expect(catalog.unitFor('militia', 'guerra_lampo')).toMatchObject({ move: 5, cost: 40 });
    expect(catalog.unitFor('transport', 'supremazia_navale').cargo?.capacity).toBe(15);
  });

  it('non toccano unità rare e Generale; gli edifici sì', () => {
    expect(catalog.unitFor('alpini', 'guerra_lampo')).toBe(catalog.unit('alpini'));
    expect(catalog.unitFor('general', 'mobilitazione')).toBe(catalog.unit('general'));
    expect(catalog.buildingFor('bank', 'potenza_industriale')).toMatchObject({ cost: 400, crit: 2 });
    expect(catalog.statsFor('bank', 'potenza_industriale').cost).toBe(400);
  });

  it('prezzi, mantenimento e movimento seguono la strategia del giocatore', () => {
    const s = game({ a: { strategy: 'assalto', general: [] } });
    const order = { city: 'a1', units: [{ type: 'tanks', count: 2 }], buildings: [] };
    expect(purchaseCost(s, ctx, 'a', order)).toBe(180);
    expect(purchaseCost(s, ctx, 'b', order)).toBe(240);
    const before = computeEconomy(s, ctx, 'a').upkeep;
    place(s, 'a', n('tanks', 10), [100, 100]);
    expect(computeEconomy(s, ctx, 'a').upkeep - before).toBe(90);
    const st = place(s, 'a', ['tanks'], [60, 60]);
    expect(groupRange(s, ctx, 'a', st.units)).toBe(8);
    expect(groupRange(s, ctx, 'b', st.units)).toBe(7);
  });

  it('con le strategie disattivate tutti giocano con i valori base', () => {
    const s = game({ settings: { strategies: false } });
    expect(() => setDoctrine({ ...s, phase: 'selection' }, ctx, 'a', { strategy: 'assalto', general: [] })).toThrow(
      RuleError,
    );
    s.players[0]!.strategy = 'assalto'; // anche se qualcuno la forzasse nello stato
    expect(statsOf(s, ctx, 'a', 'tanks').cost).toBe(120);
  });

  it('la dottrina si valida e si sceglie solo prima del turno 1', () => {
    const s = createGame(ctx, { id: 'x', seed: 1, players: [{ id: 'a', name: 'A', color: '#c33' }] });
    expect(() => setDoctrine(s, ctx, 'a', { strategy: 'inesistente', general: [] })).toThrow(/sconosciuta/);
    expect(() => setDoctrine(s, ctx, 'a', { strategy: null, general: ['difesa', 'difesa'] })).toThrow(/ripetuto/);
    expect(() =>
      setDoctrine(s, ctx, 'a', { strategy: null, general: ['difesa', 'fortuna', 'carrista', 'fante'] }),
    ).toThrow(/al massimo 3/);
    setDoctrine(s, ctx, 'a', { strategy: 'difesa', general: ['carrista'] });
    expect(s.players[0]).toMatchObject({ strategy: 'difesa', generalUpgrades: ['carrista'] });
    s.phase = 'playing';
    expect(() => setDoctrine(s, ctx, 'a', { strategy: null, general: [] })).toThrow(/prima del turno 1/);
  });

  it('le strategie avversarie restano segrete durante la scelta dei paesi', () => {
    const s = createGame(ctx, {
      id: 'x',
      seed: 1,
      players: [
        { id: 'a', name: 'A', color: '#c33', doctrine: { strategy: 'guerriglia', general: ['fante'] } },
        { id: 'b', name: 'B', color: '#33c' },
      ],
    });
    expect(viewFor(s, ctx, 'a').players[0]!.strategy).toBe('guerriglia');
    expect(viewFor(s, ctx, 'b').players[0]).toMatchObject({ strategy: null, generalUpgrades: [] });
  });
});

describe('Generale e comandanti', () => {
  it('compare nella capitale al turno 1, con i potenziamenti completati da quelli predefiniti', () => {
    const s = game({ a: { strategy: null, general: ['marcia_forzata'] } });
    const capital = stackInCity(s, 'a', 'a1')!;
    expect(capital.units.filter((u) => u.type === 'general')).toHaveLength(1);
    expect(s.players[0]!.generalUpgrades).toEqual(['marcia_forzata', 'difesa', 'fortuna']);
    expect(stackInCity(s, 'b', 'b1')!.units.some((u) => u.type === 'general')).toBe(true);
  });

  it('senza Generale nelle opzioni non compare', () => {
    const s = game({ settings: { general: false } });
    expect(s.stacks.some((st) => st.units.some((u) => u.type === 'general'))).toBe(false);
    expect(s.players.every((p) => p.generalUpgrades?.length === 0)).toBe(true);
  });

  it('dà i bonus scelti solo alle unità della sua pila', () => {
    const s = game({ a: { strategy: null, general: ['difesa', 'carrista', 'marcia_forzata'] } });
    const withGeneral = place(s, 'a', ['general', 'tanks', 'infantry'], [100, 100]);
    const boost = boostsFor(s, ctx, 'a', withGeneral.units);
    expect(boost(withGeneral.units[1]!)).toMatchObject({ attack: 1, defence: 1, move: 1 });
    expect(boost(withGeneral.units[2]!)).toMatchObject({ attack: 0, defence: 1, move: 1 });
    // media dei raggi (7, 7, 6) più 1
    expect(groupRange(s, ctx, 'a', withGeneral.units)).toBeCloseTo(23 / 3, 5);
    const alone = place(s, 'a', ['tanks'], [60, 60]);
    expect(boostsFor(s, ctx, 'a', alone.units)(alone.units[0]!)).toMatchObject({ attack: 0, defence: 0 });
  });

  it('Intendenza riduce il mantenimento e Chiamata alle armi aggiunge rinforzi', () => {
    const s = game({ a: { strategy: null, general: ['intendenza', 'chiamata_alle_armi', 'difesa'] } });
    const base = computeEconomy(s, ctx, 'a').upkeep;
    place(s, 'a', n('tanks', 5), [100, 100]);
    const withoutGeneral = computeEconomy(s, ctx, 'a').upkeep - base;
    expect(withoutGeneral).toBe(60);
    const generalStack = stackInCity(s, 'a', 'a1')!;
    for (let i = 0; i < 5; i++) generalStack.units.push(createUnit(s, ctx, 'tanks', null, 'a'));
    expect(computeEconomy(s, ctx, 'a').upkeep - base).toBe(60 + 5 * 8);
    // a1 ha popolazione 2 → 6 rinforzi; con il Generale in città 7
    s.turn = 4;
    const next = run(s, {}).state; // turno 5: ciclo di reclutamento
    expect(next.cities['a1']!.reinforcements).toBe(7);
    expect(next.cities['a2']!.reinforcements).toBe(3);
  });

  it('i comandanti rari danno il loro bonus; più copie dello stesso comandante non si sommano', () => {
    const s = game();
    const st = place(s, 'a', ['ufficiale_campo', 'ufficiale_campo', 'raiders', 'militia', 'tanks'], [100, 100]);
    const boost = boostsFor(s, ctx, 'a', st.units);
    expect(boost(st.units[2]!).attack).toBe(1);
    expect(boost(st.units[3]!).attack).toBe(1);
    expect(boost(st.units[4]!).attack).toBe(0);
  });

  it('i Cecchini colpiscono per primi Generale e comandanti', () => {
    const s = game();
    const f = (owner: string, uid: string, type: string) => fighterFrom(statsOf(s, ctx, owner, type), uid);
    const result = resolveBattle(
      [f('a', 'c', 'cecchini')],
      [f('b', 'i', 'infantry'), f('b', 'g', 'general')],
      { rules: ctx.rules.combat, dice: scriptedDice([1, 1]) },
    );
    expect(result.exchanges[0]!.defender).toBe('g');
    expect(result.exchanges[0]!.killed).toContain('g');
  });
});

describe('unità rare', () => {
  it('i missili si consumano attaccando e non danno punti al nemico', () => {
    const s = game();
    const target = place(s, 'b', n('infantry', 3), [230, 100]);
    const missile = place(s, 'a', ['missile_corto'], [200, 100]);
    const scoreB = s.players[1]!.score;
    const { state, events } = run(s, {
      a: [
        {
          kind: 'move',
          from: { stack: missile.id },
          units: [{ type: 'missile_corto', count: 1 }],
          path: [target.pos],
          target: target.id,
        },
      ],
    });
    const battle = of(events, 'battle')[0]!;
    expect(battle.winner).toBe('attacker');
    expect(battle.spent).toHaveLength(1);
    // la pila bersaglio è annientata (il missile non muore nello scambio, quindi niente "vince il difensore")
    expect(state.stacks.some((st) => st.id === target.id)).toBe(false);
    expect(state.stacks.some((st) => st.units.some((u) => u.type === 'missile_corto'))).toBe(false);
    expect(state.players[1]!.score).toBe(scoreB);
  });

  it('si trovano conquistando, secondo i pesi, e le navi solo nei porti', () => {
    const found: string[] = [];
    for (let seed = 0; seed < 40; seed++) {
      const s = game({ settings: { rareUnitChancePct: 100 } });
      s.seed = seed;
      const st = place(s, 'a', n('tanks', 14), [140, 100]);
      const { events } = run(s, {
        a: [{ kind: 'move', from: { stack: st.id }, units: [{ type: 'tanks', count: 14 }], path: [[200, 100]] }],
      });
      const rare = of(events, 'capture')[0]?.rare;
      if (rare) found.push(rare);
    }
    expect(found.length).toBe(40);
    expect(found.every((id) => catalog.unit(id).rare && catalog.unit(id).domain !== 'naval')).toBe(true);
    expect(new Set(found).size).toBeGreaterThan(8);
  });

  it('non pagano mantenimento e non si comprano', () => {
    const s = game();
    const before = computeEconomy(s, ctx, 'a').upkeep;
    place(s, 'a', ['carri_pesanti', 'compagnia_ventura'], [100, 100]);
    expect(computeEconomy(s, ctx, 'a').upkeep).toBe(before);
    const { events } = run(s, {
      a: [{ kind: 'buy', order: { city: 'a1', units: [{ type: 'alpini', count: 1 }], buildings: [] } }],
    });
    expect(of(events, 'action_failed')[0]?.reason).toMatch(/non si può comprare/);
  });

  it('la fanteria che difende in linea e in città usa i bonus della strategia', () => {
    const s = game({ settings: {} });
    s.players[1]!.strategy = 'assalto'; // fanteria −1 in città e in linea
    const garrison = stackInCity(s, 'b', 'b1')!;
    garrison.units = [createUnit(s, ctx, 'infantry', null, 'b')];
    const attackers = place(s, 'a', ['tanks'], [320, 100]);
    const { events } = run(s, {
      a: [{ kind: 'move', from: { stack: attackers.id }, units: [{ type: 'tanks', count: 1 }], path: [[350, 100]] }],
    });
    const battle = of(events, 'battle')[0]!;
    const infantry = battle.defenders.find((d) => d.type === 'infantry')!;
    expect(infantry.maxHp).toBe(7);
    // la difesa effettiva (5 − 1 in città) è il massimo dei tiri di difesa senza critico
    const defRolls = battle.exchanges.filter((e) => e.defender === infantry.uid && !e.defenceCrit).map((e) => e.defenceRoll);
    expect(Math.max(...defRolls)).toBeLessThanOrEqual(4);
  });
});
