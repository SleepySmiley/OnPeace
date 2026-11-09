import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeEconomy, simulatePlan, type Point } from '@onpeace/engine';
import { describeUnits, playerName } from './game/describe';
import { doctrineOf } from './game/doctrine';
import { sfx } from './audio/sfx';
import { useGameSounds } from './audio/useGameSounds';
import { describeOutcome, dragUnits, evaluateDraft, waypointFor } from './game/draft';
import { productionOf } from './game/production';
import { ctx, currentPicker, currentPlanner, nav, useSession } from './game/store';
import { EMPTY_VIEW, buildView, type DraftMarker } from './game/viewModel';
import { MapView, type MapClick } from './map/MapView';
import type { HitTarget } from './map/scene';
import { BattleReplay } from './ui/BattleReplay';
import { ChatPanel } from './ui/ChatPanel';
import { CityPanel } from './ui/CityPanel';
import { Countdown } from './ui/Countdown';
import { DoctrinePanel } from './ui/DoctrinePanel';
import { FinancePanel } from './ui/FinancePanel';
import { GameOverPanel } from './ui/GameOverPanel';
import { GuideModal, guideSeen } from './ui/GuideModal';
import { InfoPanel } from './ui/InfoPanel';
import { LobbyScreen } from './ui/LobbyScreen';
import { PlanPanel } from './ui/PlanPanel';
import { PlayersPanel } from './ui/PlayersPanel';
import { ProductionPanel } from './ui/ProductionPanel';
import { ReportModal } from './ui/ReportModal';
import { ReportPanel } from './ui/ReportPanel';
import { SetupScreen } from './ui/SetupScreen';
import { SoundButton } from './ui/SoundButton';
import { StackPanel, stackRef } from './ui/StackPanel';
import { StatsChart } from './ui/StatsChart';
import { TurnCard } from './ui/TurnCard';

const fmt = new Intl.NumberFormat('it-IT');
const noop = () => {};
type Tab = 'orders' | 'players' | 'report' | 'chat';

export function App() {
  const s = useSession();
  const { game, screen, selected, draft, mode, online } = s;
  const [hover, setHover] = useState<HitTarget | null>(null);
  const [tab, setTab] = useState<Tab>('orders');
  const [doctrineOpen, setDoctrineOpen] = useState(true);
  const [overlay, setOverlay] = useState<'guide' | 'report' | null>(null);
  const [freshGuide, setFreshGuide] = useState(() => !guideSeen());
  const closeOverlay = useCallback(() => setOverlay(null), []);

  // Guida (evidenziata finché non la si apre) e, online, Segnala
  const helpButtons = (
    <>
      <SoundButton />
      <button
        type="button"
        className={freshGuide ? 'tiny guide-fresh' : 'ghost tiny'}
        title="Come si gioca"
        onClick={() => {
          setFreshGuide(false);
          setOverlay('guide');
        }}
      >
        Guida
      </button>
      {mode === 'online' && (
        <button type="button" className="ghost tiny" title="Segnala un problema" onClick={() => setOverlay('report')}>
          Segnala
        </button>
      )}
    </>
  );
  const overlays = (
    <>
      {overlay === 'guide' && <GuideModal onClose={closeOverlay} />}
      {overlay === 'report' && <ReportModal onClose={closeOverlay} />}
    </>
  );

  // gli avvisi si chiudono da soli (o con un clic)
  useEffect(() => {
    if (!s.notice) return;
    const id = setTimeout(() => useSession.getState().setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [s.notice]);

  // all'avvio: se c'è una partita online salvata (e il link non ne indica un'altra), si rientra
  useEffect(() => {
    useSession.getState().resumeOnline();
  }, []);

  // a ogni nuovo resoconto si apre la scheda corrispondente; una partita nuova riparte dagli ordini
  useEffect(() => {
    if (s.reportSeq > 0) setTab('report');
  }, [s.reportSeq]);
  useEffect(() => {
    setTab('orders');
  }, [game?.id]);

  // titolo della scheda: avvisa se tocca a te o se è iniziato un turno mentre eri altrove
  const [unseenTurn, setUnseenTurn] = useState(false);
  useEffect(() => {
    if (game && !document.hasFocus()) setUnseenTurn(true);
  }, [game?.turn, game?.phase]);
  useEffect(() => {
    const seen = () => setUnseenTurn(false);
    window.addEventListener('focus', seen);
    return () => window.removeEventListener('focus', seen);
  }, []);
  useEffect(() => {
    const base = !game
      ? 'OnPeace'
      : game.phase === 'selection'
        ? 'Scelta dei paesi · OnPeace'
        : `Turno ${game.turn} · OnPeace`;
    const myPick = mode === 'online' && game?.phase === 'selection' && online.picker === online.me;
    document.title = (myPick ? '● Tocca a te · ' : unseenTurn ? '● Nuovo turno · ' : '') + base;
  }, [game, mode, online.picker, online.me, unseenTurn]);

  const planner = screen === 'planning' ? currentPlanner(s) : null;

  useGameSounds({
    game,
    me: mode === 'online' ? online.me : null,
    events: s.events,
    picker: mode === 'online' ? online.picker : null,
    deadline: mode === 'online' ? online.deadline : null,
    paused: Boolean(online.paused),
    planning:
      mode === 'online' && game?.phase === 'playing' && planner !== null && online.waiting.includes(planner),
    chat: online.chat,
    lobbyPlayers: online.lobby?.players.length ?? 0,
  });

  // annuncio all'inizio di ogni turno (una volta per turno e per chi pianifica su questo schermo)
  const [turnCard, setTurnCard] = useState(false);
  const announced = useRef<string | null>(null);
  const closeTurnCard = useCallback(() => setTurnCard(false), []);
  useEffect(() => {
    if (!game || game.phase !== 'playing' || !planner) return;
    const key = `${game.id}:${game.turn}:${planner}`;
    if (announced.current === key) return;
    announced.current = key;
    setTurnCard(true);
  }, [game, planner]);
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
            ...(screen === 'results' || mode === 'online' ? { events: s.events } : {}),
            pickable,
          })
        : EMPTY_VIEW,
    [shown, selected, preview, screen, mode, s.events, pickable],
  );

  const draftEval = useMemo(
    () => (draft && preview && planner ? evaluateDraft(draft, preview, planner, draft.hover, draft.target) : null),
    [draft, preview, planner],
  );

  // pila propria scelta: cerchio tenue con il raggio di ciò che si muoverebbe trascinandola
  const reachRing = useMemo((): DraftMarker | null => {
    if (draft || !preview || !planner || selected?.kind !== 'stack') return null;
    const stack = preview.state.stacks.find((x) => x.id === selected.id);
    if (!stack || stack.owner !== planner) return null;
    const drag = dragUnits(preview.state, planner, stack, s.unitPick, preview.moved);
    if ('error' in drag) return null;
    return { points: [], ok: true, attack: false, center: stack.pos, range: drag.range * ctx.map.rangeScale, idle: true };
  }, [draft, preview, planner, selected, s.unitPick]);

  const onHover = useCallback((t: HitTarget | null) => setHover(t), []);

  const onPointer = useCallback((world: Point, hit: HitTarget | null) => {
    const st = useSession.getState();
    if (!st.draft) return;
    st.updateDraft({ hover: world, target: st.draft.mode === 'move' && hit?.kind === 'stack' ? hit.id : null });
  }, []);

  /**
   * Conferma dell'ordine in preparazione (rilascio della pila o clic).
   * Con Maiusc si mette una tappa e la freccia continua a seguire il mouse.
   */
  const commitDraft = useCallback(
    ({ hit, world, shift }: MapClick) => {
      const st = useSession.getState();
      const d = st.draft;
      if (!d || !preview || !planner) return;
      if (shift && d.mode === 'move') {
        const wp = waypointFor(d, world);
        if ('error' in wp) {
          sfx.play('error');
          st.updateDraft({ dragging: false });
          return st.setNotice(wp.error);
        }
        sfx.play('waypoint');
        st.updateDraft({ waypoints: [...d.waypoints, wp.point], dragging: false, hover: world });
        return;
      }
      const result = evaluateDraft(d, preview, planner, world, d.mode === 'move' && hit?.kind === 'stack' ? hit.id : null);
      if (result.idle) return st.cancelDraft();
      if (result.action) {
        sfx.play(result.marker.attack ? 'attack' : 'move');
        return st.addAction(result.action);
      }
      sfx.play('error');
      st.setNotice(result.errors[0] ?? 'Destinazione non valida');
      // con delle tappe già messe l'ordine resta aperto: si può correggere l'ultimo tratto
      if (d.waypoints.length > 0) st.updateDraft({ dragging: false });
      else st.cancelDraft();
    },
    [preview, planner],
  );

  /** Si può trascinare: una propria pila, mentre si danno gli ordini. */
  const draggable = useCallback(
    (hit: HitTarget) =>
      hit.kind === 'stack' &&
      planner !== null &&
      preview !== null &&
      preview.state.stacks.some((x) => x.id === hit.id && x.owner === planner),
    [planner, preview],
  );

  const onDragStart = useCallback(
    (hit: HitTarget) => {
      const st = useSession.getState();
      if (hit.kind !== 'stack' || st.screen !== 'planning' || !preview || !planner || !st.game) return false;
      const stack = preview.state.stacks.find((x) => x.id === hit.id);
      if (!stack || stack.owner !== planner) return false;
      const drag = dragUnits(preview.state, planner, stack, st.unitPick, preview.moved);
      if (st.selected?.kind !== 'stack' || st.selected.id !== stack.id) st.select({ kind: 'stack', id: stack.id });
      if ('error' in drag) {
        sfx.play('error');
        st.setNotice(drag.error);
        return false;
      }
      sfx.play('pickup');
      st.startDraft(
        {
          mode: 'move',
          from: stackRef(stack, st.game),
          sourcePos: stack.pos,
          units: drag.units,
          range: drag.range * ctx.map.rangeScale,
        },
        true,
      );
      return true;
    },
    [preview, planner],
  );

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
      if (st.screen === 'planning' && st.draft) return commitDraft({ hit, world, shift });
      if (hit?.kind === 'stack' || hit?.kind === 'city') sfx.play('select');
      if (hit?.kind === 'stack') st.select({ kind: 'stack', id: hit.id });
      else if (hit?.kind === 'city') st.select({ kind: 'city', id: hit.id });
      else st.select(null);
    },
    [commitDraft],
  );

  // ---------------------------------------------------------------- schermate iniziali
  if (screen === 'setup' || (mode === 'online' && (screen === 'lobby' || !game))) {
    return (
      <div className="shell">
        <MapView map={ctx.map} view={EMPTY_VIEW} draft={null} onHover={noop} onClick={noop} />
        <header className="topbar above">
          <span className="brand">OnPeace</span>
          <span className="spacer" />
          {helpButtons}
        </header>
        {screen === 'setup' ? <SetupScreen /> : <LobbyScreen />}
        {s.notice && (
          <div className="toast" role="status" onClick={() => s.setNotice(null)}>
            {s.notice}
          </div>
        )}
        {overlays}
      </div>
    );
  }
  if (!game) return null;

  // ---------------------------------------------------------------- partita
  const picker = game.phase === 'selection' ? currentPicker(s) : null;
  const pickerPlayer = picker ? game.players.find((p) => p.id === picker) : undefined;
  // durante la scelta dei paesi: online la propria dottrina, in locale quella di chi sta scegliendo
  const doctrineId = mode === 'online' ? online.me : picker;
  const doctrinePlayer =
    game.phase === 'selection' && (game.settings.strategies || game.settings.general)
      ? game.players.find((p) => p.id === doctrineId && p.status === 'active')
      : undefined;
  const economy = planner && shown ? computeEconomy(shown, ctx, planner) : null;
  const production = planner && shown && game.phase === 'playing' ? productionOf(shown, planner) : null;
  const stepsInvalid = preview?.steps.filter((x) => !x.ok).length ?? 0;
  const handoffPlayer = screen === 'handoff' ? game.players.find((p) => p.id === currentPlanner(s)) : null;
  const iAmDone = mode === 'online' && planner !== null && !online.waiting.includes(planner);
  const isHost = mode === 'online' && online.lobby?.hostId === online.me;
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
        draft={draftEval?.marker ?? reachRing}
        focus={s.focus}
        onHover={onHover}
        onClick={onClick}
        onPointer={onPointer}
        onCancel={onCancel}
        draggable={draggable}
        onDragStart={onDragStart}
        onDrop={commitDraft}
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
        {mode === 'online' && game.phase !== 'ended' && (
          <Countdown
            deadline={online.deadline}
            paused={online.paused}
            {...(game.phase === 'playing' ? { total: game.settings.turnSeconds * 1000 } : {})}
          />
        )}
        {isHost && game.phase !== 'ended' && (
          <button
            type="button"
            className="ghost tiny"
            title={online.paused ? 'Fa ripartire il tempo' : 'Ferma il tempo per tutti (gli ordini si possono ancora dare)'}
            onClick={() => s.send({ t: 'pause', paused: !online.paused })}
          >
            {online.paused?.reason === 'error' ? 'Riprova' : online.paused ? 'Riprendi' : 'Pausa'}
          </button>
        )}
        {plannerPlayer && (
          <span className="player-chip" style={{ borderColor: plannerPlayer.color }}>
            <span className="swatch small" style={{ background: plannerPlayer.color }} />
            {plannerPlayer.name}
          </span>
        )}
        {mode === 'online' && game.phase === 'playing' && (
          <span className={`status waiting ${iAmDone ? 'done' : ''}`} title="Chi non ha ancora finito il turno">
            {iAmDone && <span className="done-mark">✓ Turno inviato · </span>}
            {waitingNames.length > 0 ? <>in attesa di {waitingNames.join(', ')}</> : <>tutti pronti</>}
          </span>
        )}
        {mode === 'online' && !online.connected && <span className="status offline">Riconnessione…</span>}
        <span className="spacer" />
        {plannerPlayer && economy && shown && (
          <button
            type="button"
            className="status money link"
            title="Fondi dopo gli ordini · bilancio del prossimo turno (clic: finanze)"
            onClick={() => s.select(selected?.kind === 'finance' ? null : { kind: 'finance' })}
          >
            <b>{fmt.format(Math.floor(shown.players.find((p) => p.id === planner)!.money))}</b>
            <span className={economy.net >= 0 ? 'pos' : 'neg'}>
              {' '}
              {economy.net >= 0 ? '+' : ''}
              {fmt.format(economy.net)}
            </span>
          </button>
        )}
        {production && (
          <button
            type="button"
            className={`status reinforcements link ${production.available === 0 ? 'empty' : ''}`}
            title="Unità che puoi ancora arruolare e quando i rinforzi si ricaricano (clic: dettaglio per città)"
            onClick={() => s.select(selected?.kind === 'production' ? null : { kind: 'production' })}
          >
            {production.available > 0 ? (
              <>
                Rinforzi <b>{production.available}</b>
                <span className="dim"> · ricarica T{production.nextRefill}</span>
              </>
            ) : (
              <>
                Rinforzi esauriti<span className="dim"> · di nuovo al T{production.nextRefill}</span>
              </>
            )}
          </button>
        )}
        {screen === 'planning' && planner && (
          <button
            type="button"
            className={iAmDone ? 'ghost' : 'primary'}
            onClick={() => {
              sfx.play(iAmDone ? 'unready' : 'ready');
              s.endTurn();
            }}
          >
            {iAmDone ? 'Riprendi il turno' : `Fine turno${stepsInvalid > 0 ? ` (${stepsInvalid} non validi)` : ''}`}
          </button>
        )}
        {helpButtons}
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
          {mode === 'online' && <Countdown deadline={online.deadline} paused={online.paused} />}
        </div>
      )}

      {mode === 'online' && online.paused && game.phase === 'playing' && (
        <div className="banner paused" role="status">
          {online.paused.reason === 'host' ? (
            <>
              <b>Tempo fermato dall'host.</b> Si possono ancora dare ordini e finire il turno.
            </>
          ) : (
            <>
              <b>Il server non riesce a risolvere il turno.</b> L'errore è registrato: l'host può riprovare o
              riavviare il server.
            </>
          )}
        </div>
      )}

      {doctrinePlayer && !doctrineOpen && (
        <button type="button" className="panel doctrine-toggle" onClick={() => setDoctrineOpen(true)}>
          <span className="swatch small" style={{ background: doctrinePlayer.color }} />
          Strategia e Generale ▸
        </button>
      )}
      {doctrinePlayer && doctrineOpen && (
        <aside className="panel side-panel doctrine-panel" aria-label="Strategia e Generale">
          <div className="panel-kicker">
            <span className="swatch small" style={{ background: doctrinePlayer.color }} />
            Dottrina · {doctrinePlayer.name}
            <button
              type="button"
              className="ghost tiny panel-close"
              aria-label="Chiudi il pannello"
              onClick={() => setDoctrineOpen(false)}
            >
              ◂ Chiudi
            </button>
          </div>
          <h2>Strategia e Generale</h2>
          <p className="hint-text">Si può cambiare fino all'inizio del turno 1; gli avversari la scoprono solo allora.</p>
          <DoctrinePanel
            compact
            doctrine={doctrineOf(game, doctrinePlayer.id)}
            strategies={Boolean(game.settings.strategies)}
            general={Boolean(game.settings.general)}
            onChange={s.chooseDoctrine}
          />
        </aside>
      )}

      {screen === 'planning' && draft && draftEval && (
        <div className="banner draft" role="status">
          <div className="draft-line">
            <span>
              {draft.mode === 'unload' ? 'Sbarca ' : 'Muovi '}
              <b>{describeUnits(draft.units)}</b>
            </span>
            {draft.hover && !draftEval.idle && (
              <span className={draftEval.errors[0] ? 'error-text' : draftEval.marker.attack ? 'draft-outcome attack' : 'draft-outcome'}>
                {draftEval.errors[0] ? '' : '→ '}
                {describeOutcome(game, draftEval)}
              </span>
            )}
            {draft.mode === 'move' && draft.waypoints.length > 0 && (
              <span className="dim num">
                raggio rimasto {(draftEval.left / ctx.map.rangeScale).toFixed(1)} su{' '}
                {(draft.range / ctx.map.rangeScale).toFixed(1)}
              </span>
            )}
          </div>
          <div className="draft-keys">
            {draft.dragging ? 'Rilascia sulla destinazione' : 'Clic sulla destinazione'}
            {draft.mode === 'move' && (
              <>
                {' · '}
                <kbd>Maiusc</kbd>
                {draft.dragging ? ' al rilascio: tappa intermedia' : '+clic: altra tappa'}
              </>
            )}
            {' · '}
            <kbd>Esc</kbd> o tasto destro: annulla
          </div>
        </div>
      )}

      {s.notice && (
        <div className="toast" role="status" onClick={() => s.setNotice(null)}>
          {s.notice}
        </div>
      )}

      {turnCard && planner && game.phase === 'playing' && !online.paused && (
        <TurnCard
          key={`${game.turn}:${planner}`}
          game={shown ?? game}
          player={planner}
          events={game.turn > 1 ? s.events : []}
          onClose={closeTurnCard}
        />
      )}

      {shown && !draft && selected?.kind === 'city' && (
        <CityPanel key={`${selected.id}:${actions.length}`} cityId={selected.id} state={shown} planner={planner} />
      )}
      {shown && !draft && planner && selected?.kind === 'finance' && <FinancePanel state={shown} player={planner} />}
      {shown && !draft && planner && selected?.kind === 'production' && <ProductionPanel state={shown} player={planner} />}
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
            {activeTab === 'players' && (
              <>
                <PlayersPanel game={game} planner={planner} actions={actions} />
                <h3 className="section-title">Andamento</h3>
                <StatsChart game={game} metrics={['cities', 'score']} width={310} height={170} />
              </>
            )}
            {activeTab === 'chat' && <ChatPanel />}
          </div>
          {screen === 'results' && game.phase !== 'ended' && (
            <div className="panel-footer">
              <button type="button" className="primary wide" onClick={() => s.continueAfterResults()}>
                Continua
              </button>
            </div>
          )}
        </aside>
      )}

      {shown && !draft && <InfoPanel target={hover} state={shown} />}

      {s.replay && <BattleReplay game={game} battle={s.replay} onClose={() => s.openReplay(null)} />}

      {game.phase === 'ended' && !s.replay && (
        <GameOverPanel game={game} onNew={() => (mode === 'online' ? s.leaveOnline() : s.reset())} />
      )}

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

      {overlays}
    </div>
  );
}
