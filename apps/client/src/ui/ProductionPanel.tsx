import type { GameState, PlayerId } from '@onpeace/engine';
import { cityName, countryName } from '../game/describe';
import { productionOf, refillText } from '../game/production';
import { ctx, useSession } from '../game/store';
import { ReinforcementBar } from './ReinforcementBar';

/** Dove si può ancora arruolare e quando i rinforzi si ricaricano. */
export function ProductionPanel({ state, player }: { state: GameState; player: PlayerId }) {
  const select = useSession((s) => s.select);
  const p = productionOf(state, player);
  const accumulate = ctx.rules.reinforcements.accumulate;

  return (
    <section className="panel side-panel" aria-label="Rinforzi">
      <div className="panel-kicker">Rinforzi · turno {state.turn}</div>
      <h2>
        {p.available > 0 ? (
          <>
            {p.available} <span className="h2-sub">unità arruolabili</span>
          </>
        ) : (
          'Arruolamento esaurito'
        )}
      </h2>
      <p className={`refill-note ${p.available === 0 ? 'warn' : ''}`}>
        {p.available > 0 ? 'Ricarica ' : 'Si riprende '}
        {refillText(state.turn, p.nextRefill)}.{' '}
        {accumulate ? 'I rinforzi non usati si sommano alla ricarica.' : 'Quelli non usati non si accumulano.'}
      </p>
      {p.blocked && <p className="error-text">{p.blocked}</p>}

      <ul className="production-list">
        {p.countries.map((c) => (
          <li key={c.country}>
            <div className="production-country">
              <span>
                {countryName(c.country)}
                {!c.canBuy && <span className="tag warn">senza capitale</span>}
              </span>
              <span className="num">
                {c.canBuy ? (
                  <>
                    {c.available}
                    <span className="dim">/{c.quota}</span>
                  </>
                ) : (
                  <span className="dim">—</span>
                )}
              </span>
            </div>
            {c.canBuy ? (
              <ul className="production-cities">
                {c.cities.map((city) => (
                  <li key={city.city}>
                    <button type="button" className="link" onClick={() => select({ kind: 'city', id: city.city })}>
                      {cityName(city.city)}
                    </button>
                    <ReinforcementBar available={city.available} quota={city.quota} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint-text small-gap">Per arruolare qui devi prima conquistare la capitale.</p>
            )}
          </li>
        ))}
        {p.countries.length === 0 && <li className="placeholder">Nessuna città.</li>}
      </ul>
    </section>
  );
}
