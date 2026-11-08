import {
  countryValue,
  reinforcementsForPopulation,
  type GameState,
} from '@onpeace/engine';
import { cityName, countryName, describeUnits, playerName } from '../game/describe';
import { ctx } from '../game/store';
import type { HitTarget } from '../map/scene';
import { summarizeUnits } from './summarize';

const fmt = new Intl.NumberFormat('it-IT');

/** Riquadro in basso a sinistra: cosa c'è sotto il cursore. */
export function InfoPanel({ target, state }: { target: HitTarget | null; state: GameState }) {
  if (!target) return null;

  if (target.kind === 'stack') {
    const stack = state.stacks.find((s) => s.id === target.id);
    if (!stack) return null;
    return (
      <aside className="panel info" aria-live="polite">
        <div className="panel-kicker">Pila · {playerName(state, stack.owner)}</div>
        <p className="info-line">
          {stack.fog ? 'Fuori vista: composizione sconosciuta' : describeUnits(summarizeUnits(stack.units))}
        </p>
        {stack.units.some((u) => u.cargo.length > 0) && (
          <p className="info-line dim">A bordo: {describeUnits(summarizeUnits(stack.units.flatMap((u) => u.cargo)))}</p>
        )}
      </aside>
    );
  }

  const cityId = target.kind === 'city' ? target.id : null;
  const countryId = cityId ? ctx.cities.get(cityId)!.country : target.id;
  const country = ctx.countries.get(countryId)!;
  const cities = ctx.citiesByCountry.get(countryId) ?? [];
  const owner = state.cities[country.capital]?.owner ?? null;
  const income = cities.reduce((s, c) => s + c.income, 0);

  return (
    <aside className="panel info" aria-live="polite">
      <div className="panel-kicker">Paese · {playerName(state, owner)}</div>
      <h3>{countryName(countryId)}</h3>
      <dl className="facts">
        <dt>Capitale</dt>
        <dd>{cityName(country.capital)}</dd>
        <dt>Città</dt>
        <dd className="num">{cities.length}</dd>
        <dt>Reddito nominale</dt>
        <dd className="num">{fmt.format(income)}</dd>
        {state.phase === 'selection' && (
          <>
            <dt>Prezzo</dt>
            <dd className="num">{fmt.format(countryValue(ctx, countryId))}</dd>
          </>
        )}
      </dl>
      {cityId && (
        <div className="city-block">
          <div className="panel-kicker">
            {country.capital === cityId ? 'Capitale' : 'Città'} · {playerName(state, state.cities[cityId]!.owner)}
          </div>
          <h3>{cityName(cityId)}</h3>
          <dl className="facts">
            <dt>Popolazione</dt>
            <dd className="num">{state.cities[cityId]!.population.toLocaleString('it-IT', { maximumFractionDigits: 2 })} M</dd>
            <dt>Reddito nominale</dt>
            <dd className="num">{fmt.format(ctx.cities.get(cityId)!.income)}</dd>
            <dt>Rinforzi per ciclo</dt>
            <dd className="num">{reinforcementsForPopulation(state.cities[cityId]!.population, ctx.rules)}</dd>
          </dl>
        </div>
      )}
    </aside>
  );
}
