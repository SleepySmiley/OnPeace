/**
 * Pagina di prova del pannello comandi dell'essenziale (/comandi.html in sviluppo): una partita
 * vera che gira nel browser contro avversari automatici, con quattro proposte da confrontare
 * giocando. A barra in basso · B striscia sotto la barra in alto · C accanto al cursore con la
 * conferma fissa · D pannello stretto sul bordo destro, che si chiude.
 */
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { PLAYER_COLORS } from '@onpeace/protocol';
import type { Insets } from '../board/painter';
import { useLook } from '../look';
import { Stepper } from '../play/ActionPanel';
import { Chip } from '../play/bits';
import { GameScreen } from '../play/GameScreen';
import { attackTargets, maxDice, moveTargets } from '../play/logic';
import { useGame } from '../play/useGame';
import { setLinkFactory, useSession } from '../store';
import { useCommand, type Btn, type Command, type Side } from './comandi-model';
import { LocalGame, localBoard, type Start } from './locale';
import '../styles.css';
import './comandi.css';

// la sessione della prova non deve prendere il posto di quella di una partita vera (stesso indirizzo)
const SESSION_KEY = 'onpeace.session';
const setItem = Storage.prototype.setItem;
const removeItem = Storage.prototype.removeItem;
Storage.prototype.setItem = function (key: string, value: string) {
  if (key !== SESSION_KEY) setItem.call(this, key, value);
};
Storage.prototype.removeItem = function (key: string) {
  if (key !== SESSION_KEY) removeItem.call(this, key);
};

// si prova solo la disposizione essenziale (senza cambiare la preferenza salvata)
useLook.setState({ layout: 'essenziale' });
document.body.dataset.disposizione = 'essenziale';

type Proposal = 'a' | 'b' | 'c' | 'd';
const PROPOSALS: { id: Proposal; name: string; tip: string }[] = [
  { id: 'a', name: 'Barra', tip: 'Barra compatta fissa in basso al centro' },
  { id: 'b', name: 'Striscia', tip: 'Striscia attaccata sotto la barra in alto' },
  { id: 'c', name: 'Cursore', tip: 'Accanto al cursore cosa fa il clic; conferma fissa in basso a destra' },
  { id: 'd', name: 'Bordo', tip: 'Pannello stretto sul bordo destro, si chiude' },
];

const TOP = 52;
const STRIP = 46;
const RAIL = 300;
const RAIL_CLOSED = 58;

function insetsFor(p: Proposal, railOpen: boolean): Insets {
  if (p === 'a') return { top: TOP, right: 0, bottom: 110, left: 0 };
  if (p === 'b') return { top: TOP + STRIP, right: 0, bottom: 0, left: 0 };
  if (p === 'd') return { top: TOP, right: railOpen ? RAIL : RAIL_CLOSED, bottom: 0, left: 0 };
  return { top: TOP, right: 0, bottom: 0, left: 0 };
}

let game: LocalGame | null = null;
function boot(start: Start) {
  game?.stop();
  game = new LocalGame(start);
  setLinkFactory(game.factory);
  useSession.setState({ board: localBoard });
  useSession.getState().create('Andrea', PLAYER_COLORS[0]!, {});
}

// ---------------------------------------------------------------- pezzi comuni

function Kbd({ k }: { k?: string | undefined }) {
  return k ? <kbd className="kbd">{k}</kbd> : null;
}

function Action({ b, primary = false, wide = false }: { b: Btn | null | undefined; primary?: boolean; wide?: boolean }) {
  if (!b) return null;
  return (
    <button
      type="button"
      className={`${primary ? 'primary' : 'ghost'}${b.danger ? ' danger' : ''}${wide ? ' wide' : ''}`}
      disabled={b.disabled}
      onClick={(e) => {
        e.currentTarget.blur();
        b.run();
      }}
    >
      {b.label}
      <Kbd k={b.kbd} />
    </button>
  );
}

function Who({ side }: { side: Side }) {
  return (
    <span className="who" title={side.player}>
      <Chip color={side.color} />
      <span className="who-name">{side.name}</span>
      <span className="who-armies num">{side.armies}</span>
    </span>
  );
}

function Dice({ d }: { d: NonNullable<Command['dice']> }) {
  return (
    <div className="dice-pick cmd-dice" role="radiogroup" aria-label="Dadi da tirare">
      {Array.from({ length: d.all }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={d.value === n} className={d.value === n ? 'on' : ''} disabled={n > d.max} onClick={() => d.set(n)}>
          {n}
        </button>
      ))}
      <span className="dim small">contro {d.defense}</span>
    </div>
  );
}

function Targets({ list }: { list: NonNullable<Command['targets']> }) {
  const click = useSession((s) => s.clickTerritory);
  return (
    <div className="targets">
      {list.map((t) => (
        <button key={t.id} type="button" disabled={t.protectedBy} title={t.protectedBy ? 'Protetto: ha un solo territorio' : `Attacca ${t.name}`} onClick={() => click(t.id, { shift: false, right: false })}>
          <Chip color={t.color} />
          {t.name}
          <span className="num dim">{t.armies}</span>
        </button>
      ))}
    </div>
  );
}

function Count({ c, size }: { c: Command; size: 'big' | 'huge' }) {
  if (!c.count) return null;
  return (
    <div className={`count-block ${size}`}>
      <span className="num count-n">{c.count.left}</span>
      <span className="count-text">
        <span>{c.count.noun}</span>
        {c.count.total !== null && <span className="dim">su {c.count.total}</span>}
      </span>
    </div>
  );
}

/** La parte che cambia con la mossa: contatore, chi contro chi, dadi, quante armate. */
function Middle({ c, tall = false }: { c: Command; tall?: boolean }) {
  const parts: ReactNode[] = [];
  if (c.count) parts.push(<Count key="count" c={c} size={tall ? 'huge' : 'big'} />);
  if (c.from && c.to) {
    parts.push(
      <div key="duel" className="pair">
        <Who side={c.from} />
        <span className="pair-to">
          <span className="pair-arrow" aria-hidden>
            →
          </span>
          <Who side={c.to} />
        </span>
      </div>,
    );
  } else if (c.from) {
    parts.push(
      <div key="from" className="pair">
        <span className="dim">da</span> <Who side={c.from} />
      </div>,
    );
  }
  if (c.targets && c.targets.length > 0) parts.push(<Targets key="targets" list={c.targets} />);
  if (c.dice) parts.push(<Dice key="dice" d={c.dice} />);
  if (c.amount) parts.push(<Stepper key="amount" value={c.amount.value} min={c.amount.min} max={c.amount.max} label={c.amount.label} onChange={c.amount.set} />);
  if (c.who) {
    parts.push(
      <span key="who" className="who">
        <Chip color={c.who.color} />
        <span className="who-name">{c.who.name}</span>
      </span>,
    );
  }
  return parts.length > 0 ? <>{parts}</> : null;
}

function Actions({ c, wide = false }: { c: Command; wide?: boolean }) {
  if (!c.primary && !c.secondary && !c.end) return null;
  return (
    <div className="cmd-actions">
      <Action b={c.secondary} wide={wide} />
      <Action b={c.primary} primary wide={wide} />
      {c.end && (
        <>
          <span className="cmd-sep" aria-hidden />
          <Action b={c.end} wide={wide} />
        </>
      )}
    </div>
  );
}

const phaseOf = (c: Command) => (c.mine ? c.phase : c.kind === 'wait' ? c.phase : '');

// ---------------------------------------------------------------- A: barra in basso

function ProposalA() {
  const c = useCommand();
  const mid = <Middle c={c} />;
  return (
    <section className={`cmd cmd-a${c.mine ? ' mine' : ' idle'}${c.busy ? ' busy' : ''}`} aria-label="La tua mossa" aria-live="polite">
      <div className="a-head">
        {phaseOf(c) && <span className="cmd-phase">{phaseOf(c)}</span>}
        <b className="cmd-title">{c.title}</b>
        {c.hint && <span className="cmd-hint">{c.hint}</span>}
      </div>
      {(c.count || c.from || c.who || c.dice || c.amount) && <div className="a-mid">{mid}</div>}
      <Actions c={c} />
    </section>
  );
}

// ---------------------------------------------------------------- B: striscia sotto la barra in alto

function ProposalB() {
  const c = useCommand();
  return (
    <section className={`cmd cmd-b${c.mine ? ' mine' : ' idle'}${c.busy ? ' busy' : ''}`} aria-label="La tua mossa" aria-live="polite">
      <span className="b-phase">{phaseOf(c) || 'Attesa'}</span>
      <p className="b-text">
        <b className="cmd-title">{c.title}</b>
        {c.hint && <span className="cmd-hint">{c.hint}</span>}
      </p>
      <div className="b-mid">
        <Middle c={c} />
      </div>
      <Actions c={c} />
    </section>
  );
}

// ---------------------------------------------------------------- C: accanto al cursore + conferma fissa

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

function useShift() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => setOn(e.shiftKey);
    window.addEventListener('keydown', k);
    window.addEventListener('keyup', k);
    return () => {
      window.removeEventListener('keydown', k);
      window.removeEventListener('keyup', k);
    };
  }, []);
  return on;
}

type Tone = 'ok' | 'no' | 'attack';

/** Che cosa farebbe un clic sul territorio sotto il cursore. */
function useIntent(): { text: string; tone: Tone } | null {
  const { view, lobby, board, me, move, territory } = useGame();
  const hover = useSession((s) => s.hover);
  const draft = useSession((s) => s.draft);
  const shift = useShift();
  if (!hover || !me) return null;
  const t = view.territories[hover];
  const rules = lobby.rules;
  const n = board.geo.neighbours;
  switch (move.kind) {
    case 'pick':
      return t ? { text: 'Già preso', tone: 'no' } : { text: `Prendi ${territory(hover)}`, tone: 'ok' };
    case 'place': {
      if (t?.owner !== me) return { text: 'Non è tuo', tone: 'no' };
      const left = move.budget - sum(draft.placements);
      if (left <= 0) return { text: 'Tutto messo · Invio conferma', tone: 'no' };
      const k = shift ? left : 1;
      return { text: `+${k} qui · ${left - k === 0 ? 'finite' : `ne restano ${left - k}`}`, tone: 'ok' };
    }
    case 'attack': {
      if (!t) return null;
      if (t.owner === me) {
        if (draft.selected === hover) return { text: 'Annulla la scelta', tone: 'no' };
        return t.armies >= 2 ? { text: `Attacca da qui · ${t.armies} armate`, tone: 'ok' } : { text: 'Servono almeno 2 armate', tone: 'no' };
      }
      let from = draft.selected;
      if (!from || !attackTargets(view, rules, n, from).some((x) => x.id === hover)) {
        from =
          (n.get(hover) ?? [])
            .filter((x) => view.territories[x]?.owner === me && view.territories[x]!.armies >= 2)
            .sort((a, b) => view.territories[b]!.armies - view.territories[a]!.armies)[0] ?? null;
      }
      if (!from) return { text: 'Nessun tuo confinante può attaccarlo', tone: 'no' };
      if (attackTargets(view, rules, n, from).find((x) => x.id === hover)?.protectedBy) return { text: 'Protetto fino a fine giro', tone: 'no' };
      const max = maxDice(rules, view.territories[from]!.armies);
      const dice = draft.selected === from && draft.dice !== null ? Math.min(draft.dice, max) : max;
      if (draft.selected === from && draft.target === hover) return { text: `Tira ${dice} ${dice === 1 ? 'dado' : 'dadi'}`, tone: 'attack' };
      return { text: `Attacca da ${territory(from)}`, tone: 'attack' };
    }
    case 'fortify': {
      if (!t || t.owner !== me) return { text: 'Non è tuo', tone: 'no' };
      if (draft.selected === hover) return { text: 'Annulla la scelta', tone: 'no' };
      if (draft.selected && moveTargets(view, rules, n, draft.selected).includes(hover)) return { text: 'Porta le armate qui', tone: 'ok' };
      return t.armies >= 2 ? { text: `Sposta da qui · fino a ${t.armies - 1}`, tone: 'ok' } : { text: "Un'armata sola: resta lì", tone: 'no' };
    }
    default:
      return null;
  }
}

function CursorTag() {
  const intent = useIntent();
  const el = useRef<HTMLDivElement>(null);
  const [inside, setInside] = useState(false);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      setInside((e.target as Element | null)?.classList?.contains('board-canvas') ?? false);
      const box = el.current;
      if (!box) return;
      // a destra e sotto il cursore; vicino ai bordi si gira
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const x = e.clientX + 18 + w > innerWidth - 8 ? e.clientX - 14 - w : e.clientX + 18;
      const y = e.clientY + 22 + h > innerHeight - 8 ? e.clientY - 14 - h : e.clientY + 22;
      box.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return (
    <div ref={el} className={`cursor-tag ${intent?.tone ?? ''}${inside && intent ? ' on' : ''}`} aria-hidden>
      {intent?.text}
    </div>
  );
}

function ProposalC() {
  const c = useCommand();
  return (
    <>
      <CursorTag />
      <section className={`cmd cmd-c${c.mine ? ' mine' : ' idle'}${c.busy ? ' busy' : ''}`} aria-label="La tua mossa" aria-live="polite">
        <div className="c-head">
          {phaseOf(c) && <span className="cmd-phase">{phaseOf(c)}</span>}
          <b className="cmd-title">{c.title}</b>
        </div>
        <div className="c-mid">
          <Middle c={c} />
        </div>
        {c.hint && <p className="cmd-hint">{c.hint}</p>}
        <Actions c={c} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------- D: bordo destro

function ProposalD({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const c = useCommand();
  const { territory } = useGame();
  if (!open) {
    return (
      <aside className={`cmd cmd-d closed${c.mine ? ' mine' : ' idle'}`} aria-label="La tua mossa">
        <button type="button" className="d-toggle" aria-label="Apri il pannello della mossa" title="Apri" onClick={() => setOpen(true)}>
          ‹
        </button>
        {c.count && <span className="num d-mini-count">{c.count.left}</span>}
        <span className="d-vertical">{c.mine ? c.phase : c.title}</span>
        {c.primary && (
          <button type="button" className="primary d-mini-go" title={`${c.primary.label} (${c.primary.kbd ?? ''})`} disabled={c.primary.disabled} onClick={() => c.primary!.run()}>
            ✓
          </button>
        )}
      </aside>
    );
  }
  return (
    <aside className={`cmd cmd-d${c.mine ? ' mine' : ' idle'}${c.busy ? ' busy' : ''}`} aria-label="La tua mossa" aria-live="polite">
      <header className="d-head">
        <span className="cmd-phase">{phaseOf(c) || 'Attesa'}</span>
        <button type="button" className="d-toggle" aria-label="Chiudi il pannello della mossa" title="Chiudi" onClick={() => setOpen(false)}>
          ›
        </button>
      </header>
      <h3 className="cmd-title">{c.title}</h3>
      {c.hint && <p className="cmd-hint">{c.hint}</p>}
      <div className="d-body">
        <Middle c={c} tall />
        {c.breakdown && <p className="dim small d-breakdown">{c.breakdown}</p>}
        {c.placements && c.placements.length > 0 && (
          <ul className="d-placements">
            {c.placements.map((p) => (
              <li key={p.id}>
                <span>{territory(p.id)}</span>
                <span className="num">+{p.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="d-foot">
        <Action b={c.primary} primary wide />
        <div className="d-foot-row">
          <Action b={c.secondary} />
          <Action b={c.end} />
        </div>
      </footer>
    </aside>
  );
}

// ---------------------------------------------------------------- pagina

function Switcher({ p, setP }: { p: Proposal; setP: (p: Proposal) => void }) {
  return (
    <div className="mock-switch">
      <span className="mock-tag">Prova</span>
      <div className="segmented mock-seg" role="tablist" aria-label="Proposta">
        {PROPOSALS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={p === x.id}
            title={x.tip}
            onClick={(e) => {
              e.currentTarget.blur();
              setP(x.id);
            }}
          >
            <span className="num">{x.id.toUpperCase()}</span>
            <span className="mock-name"> {x.name}</span>
          </button>
        ))}
      </div>
      <select
        className="mock-restart"
        aria-label="Ricomincia la prova"
        value=""
        onChange={(e) => {
          const v = e.target.value as Start | '';
          e.target.blur();
          if (v) boot(v);
        }}
      >
        <option value="">Rifai…</option>
        <option value="turno">dal primo turno</option>
        <option value="inizio">dall'inizio vero</option>
      </select>
    </div>
  );
}

function readProposal(): Proposal {
  const q = new URLSearchParams(location.search).get('proposta');
  return PROPOSALS.find((x) => x.id === q)?.id ?? 'a';
}

function Page() {
  const view = useSession((s) => s.view);
  const lobby = useSession((s) => s.online.lobby);
  const board = useSession((s) => s.board);
  const joined = useSession((s) => s.online.game);
  const [p, setP] = useState<Proposal>(readProposal);
  const [railOpen, setRailOpen] = useState(true);
  const booted = useRef(false);
  const wasIn = useRef(false);

  useEffect(() => {
    document.body.dataset.proposta = p;
    const url = new URL(location.href);
    url.searchParams.set('proposta', p);
    url.searchParams.delete('g');
    history.replaceState(null, '', url);
  }, [p]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    boot(new URLSearchParams(location.search).get('da') === 'inizio' ? 'inizio' : 'turno');
  }, []);

  if (view && lobby && board) wasIn.current = true;
  if (!view || !lobby || !board) {
    if (!wasIn.current || joined) return <p className="mock-out">Preparo la partita di prova…</p>;
    return (
      <div className="mock-out panel">
        <p>Sei uscito dalla prova.</p>
        <button type="button" className="primary" onClick={() => boot('turno')}>
          Ricomincia
        </button>
      </div>
    );
  }

  const command =
    p === 'a' ? <ProposalA /> : p === 'b' ? <ProposalB /> : p === 'c' ? <ProposalC /> : <ProposalD open={railOpen} setOpen={setRailOpen} />;
  return <GameScreen command={command} insets={insetsFor(p, railOpen)} topbarExtra={<Switcher p={p} setP={setP} />} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
