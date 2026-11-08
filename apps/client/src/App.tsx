import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkMove,
  checkUnload,
  computeEconomy,
  simulatePlan,
  type Action,
  type PlanPreview,
  type PlayerId,
  type Point,
} from '@onpeace/engine';
import { describeUnits, playerName } from './game/describe';
import { ctx, currentPicker, currentPlanner, nav, useSession, type MoveDraft } from './game/store';
import { EMPTY_VIEW, buildView, type DraftMarker } from './game/viewModel';
import { MapView, type MapClick } from './map/MapView';
import type { HitTarget } from './map/scene';
import { ChatPanel } from './ui/ChatPanel';
import { CityPanel } from './ui/CityPanel';
import { Countdown } from './ui/Countdown';
import { InfoPanel } from './ui/InfoPanel';
import { LobbyScreen } from './ui/LobbyScreen';
import { PlanPanel } from './ui/PlanPanel';
import { PlayersPanel } from './ui/PlayersPanel';
import { ReportPanel } from './ui/ReportPanel';
import { SetupScreen } from './ui/SetupScreen';
import { StackPanel } from './ui/StackPanel';

const fmt = new Intl.NumberFormat('it-IT');
const noop = () => {};
type Tab = 'orders' | 'players' | 'report' | 'chat';

interface DraftEval {
  marker: DraftMarker;
  action: Action | null;
  errors: string[];
}

/** Costruisce l'ordine dal percorso in preparazione e lo verifica sull'anteprima. */
function evaluateDraft(
  draft: MoveDraft,
  preview: PlanPreview,
  planner: PlayerId,
  point: Point | null,
  target: string | null,
): DraftEval {
  const marker: DraftMarker = { points: [], ok: false, attack: false, center: draft.sourcePos, range: draft.range };
  if (!point) return { marker, action: null, errors: [] };
  if (draft.mode === 'unload') {
    const action: Action = { kind: 'unload', from: draft.from, units: draft.units, to: point };
    const check = checkUnload(preview.state, ctx, nav, planner, action);
    marker.points = [draft.sourcePos, check.ok ? check.plan.end : point];
    marker.ok = check.ok;
    marker.attack = check.ok && check.plan.arrival === 'attack_city';
    return { marker, action: check.ok ? action : null, errors: check.ok ? [] : check.errors };
  }
  const targetStack = target ? preview.state.stacks.find((s) => s.id === target) : undefined;
  const end = targetStack ? targetStack.pos : point;
  const action: Action = {
    kind: 'move',
    from: draft.from,
    units: draft.units,
    path: [...draft.waypoints, end],
    ...(targetStack ? { target: targetStack.id } : {}),
  };
  const check = checkMove(preview.state, ctx, nav, planner, action, preview.moved);
  marker.points = [draft.sourcePos, ...draft.waypoints, check.ok ? check.plan.end : end];
  marker.ok = check.ok;
  marker.attack = check.ok && (check.plan.arrival === 'attack_city' || check.plan.arrival === 'attack_stack');
  return { marker, action: check.ok ? action : null, errors: check.ok ? [] : check.errors };
}

export function App() {
  const s = useSession();
  const { game, screen, selected, draft, mode, online } = s;
  const [hover, setHover] = useState<HitTarget | null>(null);
  const [tab, setTab] = useState<Tab>('orders');

  // all'avvio: se c'è una partita online salvata (e il link non ne indica un'altra), si rientra
  useEffect(() => {
    useSession.getState().resumeOnline();
  }, []);

  // a ogni nuovo resoconto si apre la scheda corrispondente
  useEffect(() => {
    if (s.reportSeq > 0) setTab('report');
  }, [s.reportSeq]);

  const planner = screen === 'planning' ? currentPlanner(s) : null;
  const plannerPlayer = planner && game ? game.players.find((p) => p.id === planner)! : null;
  const actions = useMemo(() => (planner ? (s.plans[planner] ?? []) : []), [planner, s.plans]);

  const preview = useMemo(
    () => (game && planner && game.phase === 'playing' ? simulatePlan(game, ctx, nav, planner, actions) : null),
    [game, planner, actions],
  );
  const shown = preview?.state ?? game;

  const pickable = useMemo(
    () =>
      game?.phase === 'selection'
        ? new Set(ctx.map.countries.filter((c) => game.cities[c.capital]?.owner == null).map((c) => c.id))
        : null,
    [game],
  );

  const view = useMemo(
    () =>
      shown
        ? buildView({
            state: shown,
            selected,
            ...(preview ? { steps: preview.steps, moved: preview.moved } : {}),
            ...(plannerPlayer ? { plannerColor: plannerPlayer.color } : {}),
            ...(screen === 'results' || mode === 'online' ? { events: s.events } : {}),
            pickable,
          })
        : EMPTY_VIEW,
    [shown, selected, preview, plannerPlayer, screen, mode, s.events, pickable],
  );

  const draftEval = useMemo(
    () => (draft && preview && planner ? evaluateDraft(draft, preview, planner, draft.hover, draft.target) : null),
    [draft, preview, planner],
  );

  const onHover = useCallback((t: HitTarget | null) => setHover(t), []);

  const onPointer = useCallback((world: Point, hit: HitTarget | null) => {
    const st = useSession.getState();
    if (!st.draft) return;
    const plannerId = currentPlanner(st);
    const enemy =
      hit?.kind === 'stack' && st.game?.stacks.some((x) => x.id === hit.id && x.owner !== plannerId) ? hit.id : null;
    st.updateDraft({ hover: world, target: st.draft.mode === 'move' ? enemy : null });
  }, []);

  const onCancel = useCallback(() => {
    const st = useSession.getState();
    if (st.draft) st.cancelDraft();
    else st.select(null);
  }, []);

  const onClick = useCallback(
    ({ hit, world, shift }: MapClick) => {
      const st = useSession.getState();
      if (!st.game) return;
      if (st.game.phase === 'selection') {
        const countryId =
          hit?.kind === 'country' ? hit.id : hit?.kind === 'city' ? ctx.cities.get(hit.id)!.country : null;
        if (countryId) st.pickCountry(countryId);
        return;
      }
      if (st.screen === 'planning' && st.draft && preview && planner) {
        if (shift && st.draft.mode === 'move') {
          st.updateDraft({ waypoints: [...st.draft.waypoints, world] });
          return;
        }
        const enemy =
          st.draft.mode === 'move' &&
          hit?.kind === 'stack' &&
          preview.state.stacks.some((x) => x.id === hit.id && x.owner !== planner)
            ? hit.id
            : null;
        const result = evaluateDraft(st.draft, preview, planner, world, enemy);
        if (result.action) st.addAction(result.action);
        else st.setNotice(result.errors[0] ?? 'Destinazione non valida');
        return;
      }
      if (hit?.kind === 'stack') st.select({ kind: 'stack', id: hit.id });
      else if (hit?.kind === 'city') st.select({ kind: 'city', id: hit.id });
      else st.select(null);
    },
    [preview, planner],
  );

  // ---------------------------------------------------------------- schermate iniziali
  if (screen === 'setup' || (mode === 'online' && (screen === 'lobby' || !game))) {
    return (
      <div className="shell">
        <MapView map={ctx.map} view={EMPTY_VIEW} draft={null} onHover={noop} onClick={noop} />
        <header className="topbar">
          <span className="brand">OnPeace</span>
        </header>
        {screen === 'setup' ? <SetupScreen /> : <LobbyScreen />}
        {s.notice && (
          <div className="toast" role="status" onClick={() => s.setNotice(null)}>
            {s.notice}
          </div>
        )}
      </div>
    );
  }
  if (!game) return null;

  // ---------------------------------------------------------------- partita
  const picker = game.phase === 'selection' ? currentPicker(s) : null;
  const pickerPlayer = picker ? game.players.find((p) => p.id === picker) : undefined;
  const economy = planner && shown ? computeEconomy(shown, ctx, planner) : null;
  const stepsInvalid = preview?.steps.filter((x) => !x.ok).length ?? 0;
  const handoffPlayer = screen === 'handoff' ? game.players.find((p) => p.id === currentPlanner(s)) : null;
  const iAmDone = mode === 'online' && planner !== null && !online.waiting.includes(planner);
  const waitingNames = online.waiting.filter((p) => p !== online.me).map((p) => playerName(game, p));
  const reportForced = mode === 'local' && screen === 'results';
  const activeTab: Tab = reportForced ? 'report' : tab;
  const tabs: [Tab, string][] = [
    ['orders', 'Ordini'],
    ['players', 'Giocatori'],
    ['report', 'Resoconto'],
    ...(mode === 'online' ? ([['chat', 'Chat']] as [Tab, string][]) : []),
  ];

  return (
    <div className="shell">
      <MapView
        map={ctx.map}
        view={view}
        draft={draftEval?.marker ?? null}
        onHover={onHover}
        onClick={onClick}
        onPointer={onPointer}
        onCancel={onCancel}
      />

      <header className="topbar">
        <span className="brand">OnPeace</span>
        <span className="divider" />
        {game.phase === 'selection' ? (
          <span className="status">Scelta dei paesi</span>
        ) : (
          <span className="status">
            Turno <b>{game.turn}</b>
            {game.phase !== 'ended' && <span className="dim"> / {game.settings.maxTurns}</span>}
          </span>
        )}
        {mode === 'online' && game.phase !== 'ended' && <Countdown deadline={online.deadline} />}
        {plannerPlayer && (
          <span className="player-chip" style={{ borderColor: plannerPlayer.color }}>
            <span className="swatch small" style={{ background: plannerPlayer.color }} />
            {plannerPlayer.name}
          </span>
        )}
        {mode === 'online' && game.phase === 'playing' && (
          <span className="status waiting" title="Chi non ha ancora finito il turno">
            {waitingNames.length > 0 ? <>In attesa di {waitingNames.join(', ')}</> : <>Tutti pronti</>}
          </span>
        )}
        {mode === 'online' && !online.connected && <span className="status offline">Riconnessione…</span>}
        <span className="spacer" />
        {plannerPlayer && economy && shown && (
          <span className="status money" title="Fondi dopo gli ordini · bilancio del prossimo turno">
            <b>{fmt.format(Math.floor(shown.players.find((p) => p.id === planner)!.money))}</b>
            <span className={economy.net >= 0 ? 'pos' : 'neg'}>
              {' '}
              {economy.net >= 0 ? '+' : ''}
              {fmt.format(economy.net)}
            </span>
          </span>
        )}
        {screen === 'planning' && planner && (
          <button type="button" className={iAmDone ? 'ghost' : 'primary'} onClick={() => s.endTurn()}>
            {iAmDone ? 'Riprendi il turno' : `Fine turno${stepsInvalid > 0 ? ` (${stepsInvalid} non validi)` : ''}`}
          </button>
        )}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            if (mode === 'online') {
              if (confirm('Uscire dalla partita? Le tue città diventeranno neutrali.')) s.leaveOnline();
            } else if (confirm('Abbandonare la partita e tornare all’inizio?')) s.reset();
          }}
        >
          {mode === 'online' ? 'Esci' : 'Nuova partita'}
        </button>
      </header>

      {game.phase === 'selection' && pickerPlayer && (
        <div className="banner">
          <span className="swatch small" style={{ background: pickerPlayer.color }} />
          {mode === 'online' && picker === online.me ? (
            <>
              <b>Tocca a te</b>: clicca un paese libero.
            </>
          ) : (
            <>
              Tocca a <b>{pickerPlayer.name}</b>
              {mode === 'local' && ': clicca un paese libero'}.
            </>
          )}{' '}
          Fondi: <b className="num">{fmt.format(pickerPlayer.money)}</b>
          {mode === 'online' && <Countdown deadline={online.deadline} />}
        </div>
      )}

      {screen === 'planning' && draftEval && (
        <div className="banner draft">
          {draft?.mode === 'unload' ? 'Sbarco di ' : 'Muovi '}
          <b>{describeUnits(draft!.units)}</b> · clicca la destinazione
          {draft?.mode === 'move' && ' · Maiusc+clic: punto intermedio'} · Esc: annulla
          {draftEval.errors[0] && <span className="error-text block">{draftEval.errors[0]}</span>}
        </div>
      )}

      {s.notice && (
        <div className="toast" role="status" onClick={() => s.setNotice(null)}>
          {s.notice}
        </div>
      )}

      {shown && !draft && selected?.kind === 'city' && (
        <CityPanel key={`${selected.id}:${actions.length}`} cityId={selected.id} state={shown} planner={planner} />
      )}
      {shown && !draft && selected?.kind === 'stack' && (
        <StackPanel
          key={`${selected.id}:${actions.length}`}
          stackId={selected.id}
          state={shown}
          realState={game}
          planner={planner}
          moved={preview?.moved ?? new Set()}
        />
      )}

      {game.phase !== 'selection' && screen !== 'handoff' && (
        <aside className="panel right-panel">
          <div className="tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                className={activeTab === id ? 'active' : ''}
                onClick={() => setTab(id)}
                disabled={reportForced}
              >
                {label}
                {id === 'orders' && actions.length > 0 && <span className="count">{actions.length}</span>}
                {id === 'chat' && online.unread > 0 && activeTab !== 'chat' && (
                  <span className="count">{online.unread}</span>
                )}
              </button>
            ))}
          </div>
          <div className="tab-body">
            {activeTab === 'report' && <ReportPanel game={game} events={s.events} turn={s.eventsTurn} />}
            {activeTab === 'orders' && <PlanPanel game={game} actions={actions} steps={preview?.steps ?? []} />}
            {activeTab === 'players' && <PlayersPanel game={game} planner={planner} actions={actions} />}
            {activeTab === 'chat' && <ChatPanel />}
          </div>
          {(screen === 'results' || game.phase === 'ended') && (
            <div className="panel-footer">
              {game.phase === 'ended' ? (
                <b>Partita finita — vince {(game.winners ?? []).map((w) => playerName(game, w)).join(' e ')}</b>
              ) : (
                <button type="button" className="primary wide" onClick={() => s.continueAfterResults()}>
                  Continua
                </button>
              )}
            </div>
          )}
        </aside>
      )}

      {shown && !draft && <InfoPanel target={hover} state={shown} />}

      {screen === 'handoff' && handoffPlayer && (
        <div className="modal-backdrop">
          <div className="modal handoff">
            <div className="panel-kicker">Turno {game.turn}</div>
            <h1>
              Tocca a <span style={{ color: handoffPlayer.color }}>{handoffPlayer.name}</span>
            </h1>
            <p className="lead">Gli altri non guardino: gli ordini restano segreti fino alla fine del turno.</p>
            <button type="button" className="primary" autoFocus onClick={() => s.beginPlanning()}>
              Inizia il turno
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
