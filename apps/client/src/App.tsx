import { useCallback, useMemo, useState } from 'react';
import { reinforcementsForPopulation } from '@onpeace/engine';
import { rules, testMap } from './data';
import { MapView } from './map/MapView';
import type { HoverTarget } from './map/scene';

const fmt = new Intl.NumberFormat('it-IT');

export function App() {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const onHover = useCallback((t: HoverTarget | null) => setHover(t), []);
  const { defaults } = rules;

  const stats = useMemo(() => {
    const capitals = new Set(testMap.countries.map((c) => c.capital));
    const byCountry = new Map(
      testMap.countries.map((country) => {
        const cities = testMap.cities.filter((c) => c.country === country.id);
        const income = cities.reduce((s, c) => s + c.income, 0);
        const reinforcements = cities.reduce(
          (s, c) => s + reinforcementsForPopulation(c.population, defaults),
          0,
        );
        return [country.id, { cities, income, reinforcements, ports: cities.filter((c) => c.port).length }];
      }),
    );
    return { capitals, byCountry, ports: testMap.cities.filter((c) => c.port).length };
  }, [defaults]);

  const city = hover?.kind === 'city' ? testMap.cities.find((c) => c.id === hover.id) : undefined;
  const countryId = city?.country ?? (hover?.kind === 'country' ? hover.id : undefined);
  const country = countryId ? testMap.countries.find((c) => c.id === countryId) : undefined;
  const countryStats = country ? stats.byCountry.get(country.id) : undefined;
  const capital = country ? testMap.cities.find((c) => c.id === country.capital) : undefined;
  const bonus = countryStats ? Math.round((countryStats.income * defaults.economy.fullCountryBonusPct) / 100) : 0;

  return (
    <div className="shell">
      <MapView map={testMap} onHover={onHover} />

      <header className="topbar">
        <span className="brand">OnPeace</span>
        <span className="divider" />
        <span className="map-name">{testMap.name}</span>
        <span className="status">
          <b>{testMap.countries.length}</b> paesi · <b>{testMap.cities.length}</b> città · <b>{stats.ports}</b> porti
        </span>
        <span className="hint">Rotella: zoom · Trascina: sposta · 0: inquadra tutto</span>
      </header>

      <aside className={`panel info ${country ? '' : 'empty'}`} aria-live="polite">
        {!country && <p className="placeholder">Passa sopra un paese o una città</p>}
        {country && countryStats && (
          <>
            <div className="panel-kicker">Paese</div>
            <h2>{country.name}</h2>
            <dl className="facts">
              <dt>Capitale</dt>
              <dd>{capital?.name ?? '—'}</dd>
              <dt>Città</dt>
              <dd className="num">{countryStats.cities.length}</dd>
              <dt>Reddito nominale</dt>
              <dd className="num">
                {fmt.format(countryStats.income)}{' '}
                <span className="dim" title="Bonus se possiedi tutto il paese">
                  +{fmt.format(bonus)}
                </span>
              </dd>
              <dt>Rinforzi per ciclo</dt>
              <dd className="num">{countryStats.reinforcements}</dd>
              <dt>Porti</dt>
              <dd className="num">{countryStats.ports}</dd>
            </dl>
          </>
        )}
        {city && (
          <div className="city-block">
            <div className="panel-kicker">
              {stats.capitals.has(city.id) ? 'Capitale' : 'Città'}
              {city.port && <span className="tag">porto</span>}
            </div>
            <h3>{city.name}</h3>
            <dl className="facts">
              <dt>Popolazione</dt>
              <dd className="num">{city.population.toLocaleString('it-IT')} M</dd>
              <dt>Reddito nominale</dt>
              <dd className="num">{fmt.format(city.income)}</dd>
              <dt>Rinforzi</dt>
              <dd className="num">{reinforcementsForPopulation(city.population, defaults)}</dd>
            </dl>
          </div>
        )}
      </aside>

      <aside className="panel legend">
        <div className="legend-row">
          <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden>
            <polygon
              points="0,-7.5 2,-2.8 7.1,-2.3 3.2,1.1 4.4,6.1 0,3.4 -4.4,6.1 -3.2,1.1 -7.1,-2.3 -2,-2.8"
              fill="var(--capital)"
              stroke="#10161c"
            />
          </svg>
          Capitale
        </div>
        <div className="legend-row">
          <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden>
            <circle r="3.6" fill="#efe8d6" stroke="#10161c" />
          </svg>
          Città
        </div>
        <div className="legend-row">
          <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden>
            <circle r="7" fill="none" stroke="var(--port)" strokeWidth="1.6" />
            <circle r="3.6" fill="#efe8d6" stroke="#10161c" />
          </svg>
          Porto
        </div>
        <div className="legend-row">
          <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden>
            <path d="M-7 4 L-2 -3 L3 4 M0 4 L4 -1 L8 4" fill="none" stroke="#d8cdb4" strokeWidth="1.4" />
          </svg>
          Montagne invalicabili
        </div>
      </aside>
    </div>
  );
}
