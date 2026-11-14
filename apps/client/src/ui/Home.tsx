/** Pagina iniziale: crea una partita o entra in quella di un amico (dal link o con il codice). */
import { useState } from 'react';
import { PLAYER_COLORS } from '@onpeace/protocol';
import { styleColor, useLook } from '../look';
import { gameFromUrl } from '../net';
import { useSession } from '../store';

const NAME_KEY = 'onpeace.nome';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // niente archiviazione: il nome si riscrive la prossima volta
  }
}

export function Home() {
  const style = useLook((s) => s.style);
  const create = useSession((s) => s.create);
  const join = useSession((s) => s.join);
  const linked = gameFromUrl();
  const [name, setName] = useState(savedName);
  const [color, setColor] = useState(PLAYER_COLORS[0]!);
  const [code, setCode] = useState(linked ?? '');
  const [tab, setTab] = useState<'create' | 'join'>(linked ? 'join' : 'create');
  const clean = name.trim().slice(0, 18);

  const submit = () => {
    if (!clean) return;
    rememberName(clean);
    if (tab === 'create') create(clean, color, {});
    else if (code.trim()) join(code.trim().toLowerCase(), clean, color);
  };

  return (
    <div className="home">
      <div className="home-card panel">
        <p className="kicker">Gioco di conquista tra amici</p>
        <h1 className="home-title">OnPeace</h1>
        <p className="lead">
          Il mondo diviso in 47 territori. Rinforzi, dadi, tris di carte e un obiettivo segreto: vince chi lo raggiunge per primo.
        </p>

        {!linked && (
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'create'} onClick={() => setTab('create')}>
              Crea una partita
            </button>
            <button type="button" role="tab" aria-selected={tab === 'join'} onClick={() => setTab('join')}>
              Entra con il codice
            </button>
          </div>
        )}

        <form
          className="home-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {tab === 'join' && (
            <label className="field">
              <span>Codice della partita</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="es. k7m2qx"
                maxLength={12}
                readOnly={Boolean(linked)}
                className="num"
                autoComplete="off"
              />
            </label>
          )}
          <label className="field">
            <span>Il tuo nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="Come ti vedono gli altri" autoFocus />
          </label>
          <div className="field">
            <span>Colore {tab === 'join' && <small className="dim">(se è già preso te ne tocca un altro)</small>}</span>
            <div className="swatches" role="radiogroup" aria-label="Colore">
              {PLAYER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={c === color}
                  aria-label={`Colore ${PLAYER_COLORS.indexOf(c) + 1}`}
                  className="swatch"
                  style={{ ['--c' as string]: styleColor(style, c) }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <button type="submit" className="primary wide" disabled={!clean || (tab === 'join' && !code.trim())}>
            {tab === 'create' ? 'Crea la partita' : 'Entra nella partita'}
          </button>
        </form>
        {linked && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              history.replaceState(null, '', location.pathname);
              location.reload();
            }}
          >
            Non è questa? Crea una partita nuova
          </button>
        )}
      </div>
    </div>
  );
}
