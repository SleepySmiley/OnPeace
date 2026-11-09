import { useState } from 'react';
import {
  buildingOf,
  cityIncome,
  controlsCapital,
  effectiveIncomePct,
  isPurchasable,
  purchaseCost,
  unitOf,
  validatePurchase,
  type GameState,
  type PlayerId,
  type PurchaseOrder,
} from '@onpeace/engine';
import { countryName, playerName, unitName } from '../game/describe';
import { unitTooltip } from '../game/doctrine';
import { ctx, useSession } from '../game/store';
import { Stepper } from './Stepper';

const fmt = new Intl.NumberFormat('it-IT');

interface Props {
  cityId: string;
  /** Stato in anteprima (con gli ordini già dati). */
  state: GameState;
  planner: PlayerId | null;
}

export function CityPanel({ cityId, state, planner }: Props) {
  const addAction = useSession((s) => s.addAction);
  const select = useSession((s) => s.select);
  const [cart, setCart] = useState<Record<string, number>>({});
  const def = ctx.cities.get(cityId)!;
  const city = state.cities[cityId]!;
  const isCapital = ctx.countries.get(def.country)?.capital === cityId;
  const mine = planner !== null && city.owner === planner;
  const canBuy = mine && controlsCapital(state, ctx, planner, def.country);
  const ownStack = state.stacks.find((s) => s.city === cityId && s.owner === planner);

  // unità acquistabili, con i valori della strategia di chi compra
  const units = [...ctx.catalog.units.values()]
    .filter((u) => isPurchasable(u) && (u.domain !== 'naval' || def.port))
    .map((u) => (planner ? unitOf(state, ctx, planner, u.id) : u));
  const order: PurchaseOrder = {
    city: cityId,
    units: Object.entries(cart)
      .filter(([, n]) => n > 0)
      .map(([type, count]) => ({ type, count })),
    buildings: [],
  };
  const count = order.units.reduce((s, u) => s + u.count, 0);
  const cost = count > 0 && planner ? purchaseCost(state, ctx, planner, order) : 0;
  const errors = count > 0 && planner ? validatePurchase(state, ctx, planner, order) : [];
  const money = planner ? (state.players.find((p) => p.id === planner)?.money ?? 0) : 0;

  return (
    <section className="panel side-panel" aria-label={`Città ${def.name}`}>
      <div className="panel-kicker">
        {isCapital ? 'Capitale' : 'Città'} · {countryName(def.country)}
        {def.port && <span className="tag">porto</span>}
      </div>
      <h2>{def.name}</h2>
      <dl className="facts">
        <dt>Proprietario</dt>
        <dd>{playerName(state, city.owner)}</dd>
        <dt>Reddito</dt>
        <dd className="num">
          {city.owner ? fmt.format(Math.round(cityIncome(state, ctx, cityId))) : fmt.format(def.income)}
          {city.owner && <span className="dim"> ({Math.round(effectiveIncomePct(state, ctx, cityId))}%)</span>}
        </dd>
        <dt>Popolazione</dt>
        <dd className="num">{city.population.toLocaleString('it-IT', { maximumFractionDigits: 2 })} M</dd>
        <dt>Rinforzi disponibili</dt>
        <dd className="num">{city.reinforcements}</dd>
        {city.buildings.length > 0 && (
          <>
            <dt>Edifici</dt>
            <dd>{city.buildings.map((b) => unitName(b.type)).join(', ')}</dd>
          </>
        )}
      </dl>

      {ownStack && (
        <button type="button" className="ghost wide" onClick={() => select({ kind: 'stack', id: ownStack.id })}>
          Truppe in città ({ownStack.units.length}) →
        </button>
      )}

      {mine && !canBuy && <p className="hint-text">Per comprare qui devi controllare la capitale del paese.</p>}

      {canBuy && (
        <>
          <h3 className="section-title">Arruola</h3>
          <ul className="shop">
            {units.map((u) => (
              <li key={u.id} title={unitTooltip(u)}>
                <span className="shop-name">{u.name}</span>
                <span className="num dim">{u.cost}</span>
                <Stepper
                  label={`Quantità ${u.name}`}
                  value={cart[u.id] ?? 0}
                  max={Math.max(0, city.reinforcements - count + (cart[u.id] ?? 0))}
                  onChange={(v) => setCart((c) => ({ ...c, [u.id]: v }))}
                />
              </li>
            ))}
          </ul>
          <div className="shop-total">
            <span>
              Totale <b className="num">{fmt.format(cost)}</b> <span className="dim">su {fmt.format(Math.floor(money))}</span>
            </span>
            <button
              type="button"
              className="primary"
              disabled={count === 0 || errors.length > 0}
              onClick={() => {
                addAction({ kind: 'buy', order });
                setCart({});
              }}
            >
              Ordina
            </button>
          </div>
          {errors.length > 0 && <p className="error-text">{errors[0]}</p>}

          <h3 className="section-title">Edifici</h3>
          <ul className="shop">
            {[...ctx.catalog.buildings.values()]
              .filter((b) => !b.portOnly || def.port)
              .map((b) => buildingOf(state, ctx, planner, b.id))
              .map((b) => {
                const built = city.buildings.some((x) => x.type === b.id);
                const buildErrors = validatePurchase(state, ctx, planner!, { city: cityId, units: [], buildings: [b.id] });
                return (
                  <li key={b.id} title={b.description}>
                    <span className="shop-name">{b.name}</span>
                    <span className="num dim">{b.cost}</span>
                    <button
                      type="button"
                      className="ghost"
                      disabled={built || buildErrors.length > 0}
                      onClick={() => addAction({ kind: 'buy', order: { city: cityId, units: [], buildings: [b.id] } })}
                    >
                      {built ? 'costruito' : 'Costruisci'}
                    </button>
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </section>
  );
}
