import { financeBreakdown, type GameState, type PlayerId } from '@onpeace/engine';
import { cityName, countryName, unitName } from '../game/describe';
import { ctx, useSession } from '../game/store';

const fmt = new Intl.NumberFormat('it-IT');

/** Da dove vengono i soldi e dove vanno, per il giocatore di turno. */
export function FinancePanel({ state, player }: { state: GameState; player: PlayerId }) {
  const select = useSession((s) => s.select);
  const f = financeBreakdown(state, ctx, player);
  const money = state.players.find((p) => p.id === player)?.money ?? 0;
  return (
    <section className="panel side-panel" aria-label="Finanze">
      <div className="panel-kicker">Finanze</div>
      <h2>
        {fmt.format(Math.floor(money))} <span className={f.totals.net >= 0 ? 'pos' : 'neg'}>{f.totals.net >= 0 ? '+' : ''}{fmt.format(f.totals.net)}</span>
      </h2>
      <dl className="facts">
        <dt>Reddito delle città</dt>
        <dd className="num">{fmt.format(f.totals.income)}</dd>
        <dt>Bonus paesi completi</dt>
        <dd className="num">{fmt.format(f.totals.bonus)}</dd>
        <dt>Mantenimento</dt>
        <dd className="num neg">−{fmt.format(f.totals.upkeep)}</dd>
      </dl>

      <h3 className="section-title">Per paese</h3>
      <ul className="finance-list">
        {f.countries.map((c) => (
          <li key={c.id}>
            <details>
              <summary>
                <span>
                  {countryName(c.id)}
                  {!c.own && <span className="tag warn">senza capitale</span>}
                  {c.full && <span className="tag">completo</span>}
                </span>
                <span className="num">
                  {fmt.format(c.income)}
                  {c.bonus > 0 && <span className="dim"> +{fmt.format(c.bonus)}</span>}
                </span>
              </summary>
              <ul className="finance-cities">
                {c.cities.map((city) => (
                  <li key={city.id}>
                    <button type="button" className="link" onClick={() => select({ kind: 'city', id: city.id })}>
                      {cityName(city.id)}
                    </button>
                    <span className="num">
                      {fmt.format(city.income)} <span className="dim">({city.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>

      <h3 className="section-title">Mantenimento</h3>
      <ul className="finance-list">
        {f.upkeep.map((u) => (
          <li key={u.type} className="row">
            <span>
              {u.count} {unitName(u.type)}
            </span>
            <span className="num">−{fmt.format(u.total)}</span>
          </li>
        ))}
        {f.upkeep.length === 0 && <li className="placeholder">Nessuna unità.</li>}
      </ul>
    </section>
  );
}
