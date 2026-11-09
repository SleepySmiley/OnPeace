import { useMemo, useState } from 'react';
import {
  boostsFor,
  checkLoad,
  generalUpgradesOf,
  groupRange,
  unitOf,
  type GameState,
  type PlayerId,
  type StackRef,
  type StackState,
  type UnitSelection,
  type UnitState,
} from '@onpeace/engine';
import { cityName, describeUnits, playerName, unitName } from '../game/describe';
import { upgradeName } from '../game/doctrine';
import { chosenUnits, freeSelection, pickedSelection } from '../game/draft';
import { ctx, useSession } from '../game/store';
import { UnitCard } from './cards';
import { TipRow } from './InfoTip';
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

function groupByType(units: readonly UnitState[], moved: ReadonlySet<string>) {
  const groups = new Map<string, { total: number; free: number }>();
  for (const u of units) {
    const g = groups.get(u.type) ?? { total: 0, free: 0 };
    g.total++;
    if (!moved.has(u.id)) g.free++;
    groups.set(u.type, g);
  }
  return [...groups].map(([type, g]) => ({ type, ...g }));
}

const count = (sel: UnitSelection) => sel.reduce((s, x) => s + x.count, 0);

/**
 * Le più numerose unità di terra (scelte nel pannello, o tutte) che salgono sui trasporti della pila:
 * si toglie un'unità alla volta finché il carico non ci sta.
 */
function loadPlan(state: GameState, player: PlayerId, ref: StackRef, candidates: UnitState[]): UnitSelection {
  const toSel = (units: UnitState[]) => {
    const m = new Map<string, number>();
    for (const u of units) m.set(u.type, (m.get(u.type) ?? 0) + 1);
    return [...m].map(([type, n]) => ({ type, count: n }));
  };
  for (let k = candidates.length; k > 0; k--) {
    const sel = toSel(candidates.slice(0, k));
    if (checkLoad(state, ctx, player, { kind: 'load', from: ref, units: sel }).ok) return sel;
  }
  return [];
}

export function StackPanel({ stackId, state, realState, planner, moved }: Props) {
  const stack = state.stacks.find((s) => s.id === stackId);
  const startDraft = useSession((s) => s.startDraft);
  const addAction = useSession((s) => s.addAction);
  const unitPick = useSession((s) => s.unitPick);
  const setUnitPick = useSession((s) => s.setUnitPick);
  const [cargoPick, setCargoPick] = useState<Record<string, number>>({});

  const groups = useMemo(() => (stack ? groupByType(stack.units, moved) : []), [stack, moved]);
  const cargo = useMemo(() => (stack ? groupByType(stack.units.flatMap((u) => u.cargo), new Set()) : []), [stack]);
  if (!stack) return null;

  const mine = planner !== null && stack.owner === planner;
  const ref = stackRef(stack, realState);
  // scelta del pannello: si parte da nessuna unità; senza scelta il trascinamento muove tutte le libere
  const picked = pickedSelection(stack, unitPick, moved);
  const free = freeSelection(stack, moved);
  const moving = picked.length > 0 ? picked : free;
  const domains = new Set(moving.map((c) => ctx.catalog.unit(c.type).domain));
  const range = mine && domains.size === 1 ? groupRange(state, ctx, planner, chosenUnits(stack, moving, moved)) : 0;
  const setCount = (type: string, n: number) =>
    setUnitPick({
      stack: stack.id,
      counts: { ...(unitPick?.stack === stack.id ? unitPick.counts : {}), [type]: n },
    });

  // trasporti nella pila: posti, chi può salire, chi è a bordo
  const transports = stack.units.filter((u) => unitOf(state, ctx, stack.owner, u.type).cargo);
  const seats = transports.reduce((s, t) => s + unitOf(state, ctx, stack.owner, t.type).cargo!.capacity, 0);
  const aboard = transports.reduce((s, t) => s + t.cargo.length, 0);
  const pickedUnits = chosenUnits(stack, picked, moved);
  const boardable = (u: UnitState) => ctx.catalog.unit(u.type).domain === 'land' && ctx.catalog.unit(u.type).transportable;
  const candidates = (picked.length > 0 ? pickedUnits : stack.units).filter(boardable);
  const toLoad = mine && transports.length > 0 ? loadPlan(state, planner, ref, candidates) : [];
  const transportKinds = groupByType(transports, new Set());
  const portCity = stack.city ? ctx.cities.get(stack.city)?.port : false;
  const landOnly = stack.units.every(boardable);

  const hasGeneral = stack.units.some((u) => u.type === ctx.catalog.generalUnit);
  const upgrades = hasGeneral ? generalUpgradesOf(state, ctx, stack.owner) : [];
  const boost = boostsFor(state, ctx, stack.owner, stack.units);
  /** Scheda dell'unità con la strategia del proprietario e i bonus di comando della pila. */
  const card = (type: string, inStack = true) => () => {
    const sample = inStack ? stack.units.find((u) => u.type === type) : undefined;
    const b = sample ? boost(sample) : null;
    const bonus = b
      ? [
          b.attack && `attacco ${b.attack > 0 ? '+' : ''}${b.attack}`,
          b.defence && `difesa ${b.defence > 0 ? '+' : ''}${b.defence}`,
          b.crit && `critico +${b.crit}%`,
          b.hp && `vita +${b.hp}`,
          b.move && `movimento +${b.move}`,
          b.view && `vista +${b.view}`,
          b.upkeep && `mantenimento ${b.upkeep}`,
        ].filter((x): x is string => Boolean(x))
      : [];
    return <UnitCard def={unitOf(state, ctx, stack.owner, type)} base={ctx.catalog.unit(type)} bonus={bonus} />;
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
          <button
            type="button"
            className="ghost tiny"
            onClick={() => setUnitPick({ stack: stack.id, counts: Object.fromEntries(groups.map((g) => [g.type, g.free])) })}
          >
            Scegli tutte
          </button>
          <button type="button" className="ghost tiny" disabled={picked.length === 0} onClick={() => setUnitPick(null)}>
            Azzera
          </button>
        </div>
      )}
      <ul className="unit-list">
        {groups.map((g) => (
          <TipRow key={g.type} tip={stack.fog ? null : card(g.type)}>
            {label(g.type)}
            {mine ? (
              <>
                <span className="dim num" title="Ancora da muovere / totale">
                  {g.free}/{g.total}
                </span>
                <Stepper
                  label={`Unità ${unitName(g.type)} da muovere`}
                  value={picked.find((p) => p.type === g.type)?.count ?? 0}
                  max={g.free}
                  onChange={(v) => setCount(g.type, v)}
                />
              </>
            ) : (
              <span className="num">{g.total}</span>
            )}
          </TipRow>
        ))}
      </ul>

      {upgrades.length > 0 && (
        <p className="hint-text general-bonus">
          <span className="general-mark" aria-hidden>★</span>
          Generale: {upgrades.map((u) => upgradeName(u.id)).join(', ')}
        </p>
      )}

      {mine && (
        <div className="move-box">
          {free.length === 0 ? (
            <p className="hint-text">Tutte le unità di questa pila si sono già mosse in questo turno.</p>
          ) : domains.size > 1 ? (
            <p className="error-text">
              Terra, mare e aria si muovono separatamente: scegli qui sopra quali unità muovere.
            </p>
          ) : (
            <>
              <p className="move-what">
                {picked.length > 0 ? (
                  <>
                    Scelte <b>{count(picked)}</b> unità
                  </>
                ) : (
                  <>
                    Nessuna scelta: si muovono <b>tutte le {count(free)}</b> unità libere
                  </>
                )}
                <span className="dim">
                  {' '}
                  · raggio <b className="num">{range.toFixed(1)}</b>
                </span>
              </p>
              <p className="drag-hint">
                <span className="drag-icon" aria-hidden>
                  ⤳
                </span>
                <span>
                  Trascina la pila sulla mappa per muovere o attaccare. <kbd>Maiusc</kbd> al rilascio: tappa intermedia.
                </span>
              </p>
            </>
          )}
        </div>
      )}

      {mine && transports.length > 0 && (
        <>
          <h3 className="section-title">Trasporto</h3>
          <ul className="transport-list">
            {transportKinds.map((t) => (
              <li key={t.type}>
                <span>
                  {unitName(t.type)}
                  {t.total > 1 && <span className="dim"> ×{t.total}</span>}
                </span>
              </li>
            ))}
            <li className="dim">
              A bordo{' '}
              <b className="num">
                {aboard}/{seats}
              </b>{' '}
              posti
            </li>
          </ul>
          {toLoad.length > 0 ? (
            <>
              <button
                type="button"
                className="ghost wide"
                onClick={() => addAction({ kind: 'load', from: ref, units: toLoad })}
                title={describeUnits(toLoad)}
              >
                Imbarca {count(toLoad)} unità
                {picked.length === 0 ? '' : ' scelte'}
              </button>
              <p className="hint-text small-gap">
                Salgono subito a bordo. Poi trascina il trasporto e, vicino alla costa, usa <b>Sbarca</b>: tutto nello
                stesso turno.
              </p>
            </>
          ) : (
            <p className="hint-text">
              {aboard >= seats
                ? 'Posti esauriti.'
                : 'Per imbarcare, porta qui truppe di terra (nella stessa città o nello stesso punto).'}
            </p>
          )}
        </>
      )}

      {mine && transports.length === 0 && landOnly && portCity && (
        <p className="hint-text small-gap">
          Per attraversare il mare: compra qui una <b>Nave da trasporto</b>, poi imbarca le truppe dal pannello di questa
          pila.
        </p>
      )}

      {cargo.length > 0 && (
        <>
          <h3 className="section-title">A bordo</h3>
          <ul className="unit-list">
            {cargo.map((g) => (
              <TipRow key={g.type} tip={card(g.type, false)}>
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
              </TipRow>
            ))}
          </ul>
          {mine && (
            <>
              <button
                type="button"
                className="ghost wide"
                disabled={!cargo.some((g) => (cargoPick[g.type] ?? 0) > 0)}
                onClick={() =>
                  startDraft({
                    mode: 'unload',
                    from: ref,
                    sourcePos: stack.pos,
                    units: Object.entries(cargoPick)
                      .filter(([, n]) => n > 0)
                      .map(([type, n]) => ({ type, count: n })),
                    range: ctx.rules.movement.unloadMaxDistance * ctx.map.rangeScale,
                  })
                }
              >
                Sbarca…
              </button>
              <p className="hint-text small-gap">Scegli quante unità, poi clicca un punto di terra dentro il cerchio.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
