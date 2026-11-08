import { useMemo } from 'react';
import type { Doctrine } from '@onpeace/engine';
import { strategyChanges, upgradeName } from '../game/doctrine';
import { ctx } from '../game/store';

interface Props {
  doctrine: Doctrine;
  strategies: boolean;
  general: boolean;
  onChange: (d: Doctrine) => void;
  /** Disposizione a una colonna (pannello laterale). */
  compact?: boolean;
}

/** Scelta della strategia e dei potenziamenti del Generale. */
export function DoctrinePanel({ doctrine, strategies, general, onChange, compact = false }: Props) {
  const { picks, defaultUpgrades } = ctx.catalog.rules.general;
  const chosen = doctrine.general;
  const strategy = doctrine.strategy ? ctx.catalog.strategies.get(doctrine.strategy) : undefined;
  const changes = useMemo(() => (strategy ? strategyChanges(strategy.id) : []), [strategy]);
  const fallback = defaultUpgrades.filter((id) => !chosen.includes(id)).slice(0, Math.max(0, picks - chosen.length));

  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    if (next.length <= picks) onChange({ ...doctrine, general: next });
  };

  return (
    <div className={`doctrine ${compact ? 'compact' : ''}`}>
      {strategies && (
        <section>
          <h3 className="section-title">Strategia</h3>
          <select
            className="wide-select"
            aria-label="Strategia"
            value={doctrine.strategy ?? ''}
            onChange={(e) => onChange({ ...doctrine, strategy: e.target.value || null })}
          >
            <option value="">Nessuna (valori base)</option>
            {[...ctx.catalog.strategies.values()].map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="hint-text strategy-desc">
            {strategy ? strategy.description : 'Tutte le unità con le statistiche standard.'}
          </p>
          {changes.length > 0 && (
            <details className="changes">
              <summary>Cosa cambia ({changes.length})</summary>
              <ul>
                {changes.map((c) => (
                  <li key={c.name}>
                    <b>{c.name}</b> <span className="dim">{c.changes.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {general && (
        <section>
          <h3 className="section-title">
            Generale · potenziamenti{' '}
            <span className="num">
              {chosen.length}/{picks}
            </span>
          </h3>
          <div className="chips" role="group" aria-label="Potenziamenti del Generale">
            {ctx.catalog.rules.general.upgrades.map((up) => {
              const on = chosen.includes(up.id);
              return (
                <button
                  key={up.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  disabled={!on && chosen.length >= picks}
                  onClick={() => toggle(up.id)}
                >
                  <span className="chip-name">{up.name}</span>
                  <span className="chip-desc">{up.description}</span>
                </button>
              );
            })}
          </div>
          {fallback.length > 0 && (
            <p className="hint-text">
              {chosen.length === 0 ? 'Se non scegli' : 'I posti liberi'} al turno 1 diventano: {fallback.map(upgradeName).join(', ')}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
