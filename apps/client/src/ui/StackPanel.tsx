import { useMemo, useState } from 'react';
import {
  boostsFor,
  generalUpgradesOf,
  groupRange,
  unitOf,
  type GameState,
  type PlayerId,
  type StackRef,
  type StackState,
  type UnitSelection,
} from '@onpeace/engine';
import { cityName, playerName, unitName } from '../game/describe';
import { unitTooltip, upgradeName } from '../game/doctrine';
import { ctx, useSession } from '../game/store';
import { Stepper } from './Stepper';

interface Props {
  stackId: string;
  /** Stato in anteprima (con gli ordini già dati). */
  state: GameState;
  /** Stato reale del turno: serve per riferire le pile che esistono davvero. */
  realState: GameState;
  planner: PlayerId | null;
  moved: ReadonlySet<string>;
}

/** Come indicare la pila negli ordini (gli id delle pile create in anteprima non esistono davvero). */
export function stackRef(stack: StackState, real: GameState): StackRef {
  if (stack.city) return { city: stack.city };
  if (real.stacks.some((s) => s.id === stack.id)) return { stack: stack.id };
  return { at: stack.pos };
}

function groupByType(units: StackState['units'], moved: ReadonlySet<string>) {
  const groups = new Map<string, { total: number; free: number }>();
  for (const u of units) {
    const g = groups.get(u.type) ?? { total: 0, free: 0 };
    g.total++;
    if (!moved.has(u.id)) g.free++;
    groups.set(u.type, g);
  }
  return [...groups].map(([type, g]) => ({ type, ...g }));
}

export function StackPanel({ stackId, state, realState, planner, moved }: Props) {
  const stack = state.stacks.find((s) => s.id === stackId);
  const startDraft = useSession((s) => s.startDraft);
  const addAction = useSession((s) => s.addAction);
  const [pick, setPick] = useState<Record<string, number> | null>(null);
  const [cargoPick, setCargoPick] = useState<Record<string, number>>({});

  const groups = useMemo(() => (stack ? groupByType(stack.units, moved) : []), [stack, moved]);
  const cargo = useMemo(
    () => (stack ? groupByType(stack.units.flatMap((u) => u.cargo), new Set()) : []),
    [stack],
  );
  if (!stack) return null;

  const mine = planner !== null && stack.owner === planner;
  const selection = pick ?? Object.fromEntries(groups.map((g) => [g.type, g.free]));
  const chosen: UnitSelection = Object.entries(selection)
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, count }));
  const chosenUnits = chosen.flatMap(({ type, count }) =>
    stack.units.filter((u) => u.type === type && !moved.has(u.id)).slice(0, count),
  );
  const domains = new Set(chosen.map((c) => ctx.catalog.unit(c.type).domain));
  const range = mine ? groupRange(state, ctx, planner, chosenUnits) : 0;
  const hasTransport = stack.units.some((u) => ctx.catalog.unit(u.type).cargo);
  const loadable = chosen.filter((c) => ctx.catalog.unit(c.type).transportable);
  const cargoChosen: UnitSelection = Object.entries(cargoPick)
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, count }));
  const ref = stackRef(stack, realState);
  const hasGeneral = stack.units.some((u) => u.type === ctx.catalog.generalUnit);
  const upgrades = hasGeneral ? generalUpgradesOf(state, ctx, stack.owner) : [];
  const boost = boostsFor(state, ctx, stack.owner, stack.units);
  /** Scheda dell'unità con la strategia del proprietario e i bonus di comando della pila. */
  const tooltip = (type: string) => {
    const def = unitOf(state, ctx, stack.owner, type);
    const sample = stack.units.find((u) => u.type === type);
    const b = sample ? boost(sample) : null;
    const bonus = b
      ? [
          b.attack && `att ${b.attack > 0 ? '+' : ''}${b.attack}`,
          b.defence && `dif ${b.defence > 0 ? '+' : ''}${b.defence}`,
          b.crit && `crit +${b.crit}%`,
          b.hp && `HP +${b.hp}`,
          b.move && `mov +${b.move}`,
          b.view && `vista +${b.view}`,
          b.upkeep && `mantenimento ${b.upkeep}`,
        ].filter(Boolean)
      : [];
    return unitTooltip(def) + (bonus.length > 0 ? `
Bonus di comando: ${bonus.join(' · ')}` : '');
  };
  const label = (type: string) => {
    const def = ctx.catalog.units.get(type);
    return (
      <span className="shop-name">
        {def?.role === 'general' && <span className="general-mark" aria-hidden>★</span>}
        {unitName(type)} {def?.rare && <span className="tag rare">rara</span>}
      </span>
    );
  };

  return (
    <section className="panel side-panel" aria-label="Pila">
      <div className="panel-kicker">
        Pila · {playerName(state, stack.owner)}
        {stack.city && <> · {cityName(stack.city)}</>}
      </div>
      <h2>{stack.fog ? 'Fuori vista' : `${stack.units.length} unità`}</h2>
      {stack.fog && <p className="hint-text">Se ne conosce la posizione, non la composizione.</p>}

      {mine && groups.length > 1 && (
        <div className="button-row select-all">
          <button type="button" className="ghost tiny" onClick={() => setPick(null)}>
            Tutte
          </button>
          <button
            type="button"
            className="ghost tiny"
            onClick={() => setPick(Object.fromEntries(groups.map((g) => [g.type, 0])))}
          >
            Nessuna
          </button>
        </div>
      )}
      <ul className="unit-list">
        {groups.map((g) => (
          <li key={g.type} title={stack.fog ? undefined : tooltip(g.type)}>
            {label(g.type)}
            {mine ? (
              <>
                <span className="dim num" title="Ancora da muovere / totale">
                  {g.free}/{g.total}
                </span>
                <Stepper
                  label={`Unità ${unitName(g.type)} da muovere`}
                  value={selection[g.type] ?? 0}
                  max={g.free}
                  onChange={(v) => setPick({ ...selection, [g.type]: v })}
                />
              </>
            ) : (
              <span className="num">{g.total}</span>
            )}
          </li>
        ))}
      </ul>

      {upgrades.length > 0 && (
        <p className="hint-text general-bonus">
          <span className="general-mark" aria-hidden>★</span>
          Generale: {upgrades.map((u) => upgradeName(u.id)).join(', ')}
        </p>
      )}

      {mine && (
        <>
          <div className="move-summary">
            {chosen.length === 0 ? (
              <span className="dim">Nessuna unità selezionata (o già mosse)</span>
            ) : domains.size > 1 ? (
              <span className="error-text">Terra, mare e aria si muovono separatamente</span>
            ) : (
              <span>
                Raggio <b className="num">{range.toFixed(1)}</b>
              </span>
            )}
          </div>
          <div className="button-row">
            <button
              type="button"
              className="primary"
              disabled={chosen.length === 0 || domains.size > 1}
              onClick={() =>
                startDraft({ mode: 'move', from: ref, sourcePos: stack.pos, units: chosen, range: range * ctx.map.rangeScale })
              }
            >
              Muovi / attacca
            </button>
            {hasTransport && loadable.length > 0 && (
              <button type="button" className="ghost" onClick={() => addAction({ kind: 'load', from: ref, units: loadable })}>
                Carica
              </button>
            )}
          </div>
        </>
      )}

      {cargo.length > 0 && (
        <>
          <h3 className="section-title">A bordo</h3>
          <ul className="unit-list">
            {cargo.map((g) => (
              <li key={g.type}>
                <span className="shop-name">{unitName(g.type)}</span>
                {mine ? (
                  <Stepper
                    label={`Unità ${unitName(g.type)} da sbarcare`}
                    value={cargoPick[g.type] ?? 0}
                    max={g.total}
                    onChange={(v) => setCargoPick({ ...cargoPick, [g.type]: v })}
                  />
                ) : (
                  <span className="num">{g.total}</span>
                )}
              </li>
            ))}
          </ul>
          {mine && (
            <button
              type="button"
              className="ghost wide"
              disabled={cargoChosen.length === 0}
              onClick={() =>
                startDraft({
                  mode: 'unload',
                  from: ref,
                  sourcePos: stack.pos,
                  units: cargoChosen,
                  range: ctx.rules.movement.unloadMaxDistance * ctx.map.rangeScale,
                })
              }
            >
              Sbarca…
            </button>
          )}
        </>
      )}
    </section>
  );
}
