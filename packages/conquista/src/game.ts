/**
 * Motore del gioco di conquista: preparazione, turni uno alla volta (rinforzi, attacchi,
 * spostamento), carte, eliminazioni e vittoria. Funzioni pure: ricevono uno stato e ne
 * restituiscono uno nuovo con gli eventi prodotti; il caso passa dal seme salvato nello stato.
 */
import { RuleError, assertRule } from '@onpeace/engine';
import { buildDeck, setValue, shuffle } from './cards';
import { continentsHeld, dealObjectives, objectiveDef, objectiveMet } from './objectives';
import { createGameRng, expandSeed, type GameRng } from './random';
import type { GameMode } from './schema';
import type { Action, ActionResult, Card, GameContext, GameEvent, GameState, PlayerState } from './state';

export interface NewPlayer {
  id: string;
  name: string;
  color: string;
}

// ---------------------------------------------------------------- utilità
const clone = (s: GameState): GameState => structuredClone(s);

function player(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new RuleError('Giocatore sconosciuto.');
  return p;
}

export function ownedBy(state: GameState, id: string): string[] {
  return Object.entries(state.territories)
    .filter(([, t]) => t.owner === id)
    .map(([tid]) => tid);
}

function withRng<T>(state: GameState, fn: (rng: GameRng) => T): T {
  const rng = createGameRng(state.seed);
  const out = fn(rng);
  state.seed = rng.state();
  return out;
}

const territoryName = (ctx: GameContext, id: string) => ctx.board.territories.find((t) => t.id === id)?.name ?? id;

/** Armate di rinforzo a inizio turno: territori / divisore (con un minimo) + bonus dei continenti. */
export function reinforcementsFor(ctx: GameContext, state: GameState, id: string): number {
  const { divisor, minimum } = ctx.rules.reinforcements;
  const base = Math.max(minimum, Math.floor(ownedBy(state, id).length / divisor));
  const bonus = continentsHeld(ctx, state, id).reduce((s, c) => s + (ctx.board.continents.find((x) => x.id === c)?.bonus ?? 0), 0);
  return base + bonus;
}

function checkPlacements(ctx: GameContext, state: GameState, id: string, placements: Record<string, number>, total: number) {
  let sum = 0;
  for (const [tid, n] of Object.entries(placements)) {
    const t = state.territories[tid];
    assertRule(t, `Territorio sconosciuto: ${tid}.`);
    assertRule(t.owner === id, `${territoryName(ctx, tid)} non è tuo.`);
    assertRule(Number.isInteger(n) && n > 0, 'Le armate da piazzare devono essere numeri interi positivi.');
    sum += n;
  }
  assertRule(sum === total, `Devi piazzare esattamente ${total} armate (ne hai indicate ${sum}).`);
}

// ---------------------------------------------------------------- nuova partita
/** `seed`: per le partite vere quattro numeri casuali veri (es. da randomBytes(16)); un numero solo per test e prove. */
export function createGame(ctx: GameContext, players: NewPlayer[], mode: GameMode, seed: number | readonly number[]): GameState {
  const { rules, board } = ctx;
  if (players.length < rules.players.min || players.length > rules.players.max) {
    throw new RuleError(`Servono da ${rules.players.min} a ${rules.players.max} giocatori.`);
  }
  if (!rules.modes.includes(mode)) throw new RuleError('Modalità non disponibile.');
  if (mode === 'objectives' && players.length < rules.players.objectivesMin) {
    throw new RuleError(`Con gli obiettivi segreti servono almeno ${rules.players.objectivesMin} giocatori.`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new RuleError('Giocatori ripetuti.');
  const state: GameState = {
    board: board.id,
    mode,
    seed: expandSeed(seed),
    players: players.map((p) => ({ ...p, alive: true, cards: [], objective: null, setupLeft: 0, setupDone: false })),
    order: [],
    territories: {},
    phase: 'setup',
    setupPlayer: null,
    turn: null,
    deck: [],
    discard: [],
    winner: null,
  };
  withRng(state, (rng) => {
    state.order = shuffle(
      players.map((p) => p.id),
      rng,
    );
    // territori distribuiti a giro, nell'ordine di gioco, con un'armata ciascuno
    shuffle(
      board.territories.map((t) => t.id),
      rng,
    ).forEach((tid, i) => {
      state.territories[tid] = { owner: state.order[i % state.order.length]!, armies: 1 };
    });
    const initial = rules.initialArmies[String(players.length)]!;
    for (const p of state.players) {
      p.setupLeft = initial - ownedBy(state, p.id).length;
      p.setupDone = p.setupLeft === 0;
    }
    state.deck = shuffle(buildDeck(ctx), rng);
    if (mode === 'objectives') {
      const dealt = dealObjectives(ctx, state.order, rng);
      for (const p of state.players) p.objective = dealt.get(p.id)!;
    }
  });
  if (rules.setup.placement === 'rounds') state.setupPlayer = nextToPlace(state, null);
  // nessuno ha armate da piazzare (regole con armate iniziali minime): si parte subito
  if (state.players.every((p) => p.setupDone)) finishSetupIfReady(ctx, state, []);
  return state;
}

/** Preparazione a giri: il prossimo, in ordine di gioco dopo `after`, che ha ancora armate da piazzare. */
function nextToPlace(state: GameState, after: string | null): string | null {
  const start = after === null ? -1 : state.order.indexOf(after);
  for (let k = 1; k <= state.order.length; k++) {
    const id = state.order[(start + k) % state.order.length]!;
    if (player(state, id).setupLeft > 0) return id;
  }
  return null;
}

/** Armate da piazzare adesso nella preparazione: un giro, o tutte se si piazza tutti insieme. */
export function setupStep(ctx: GameContext, state: GameState, id: string): number {
  const left = state.players.find((p) => p.id === id)?.setupLeft ?? 0;
  return ctx.rules.setup.placement === 'rounds' ? Math.min(ctx.rules.setup.perRound, left) : left;
}

// ---------------------------------------------------------------- turni
function startTurn(ctx: GameContext, state: GameState, id: string, events: GameEvent[]) {
  const number = (state.turn?.number ?? 0) + 1;
  const reinforcements = reinforcementsFor(ctx, state, id);
  state.phase = 'reinforce';
  state.turn = { player: id, number, reinforcements, conquered: false, occupation: null, fortifyLeft: ctx.rules.fortify.moves };
  events.push({ type: 'turn', player: id, number, reinforcements });
}

function nextAlive(state: GameState, after: string): string {
  const i = state.order.indexOf(after);
  for (let k = 1; k <= state.order.length; k++) {
    const id = state.order[(i + k) % state.order.length]!;
    if (player(state, id).alive) return id;
  }
  return after;
}

function drawCard(state: GameState, id: string): Card | null {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = withRng(state, (rng) => shuffle(state.discard, rng));
    state.discard = [];
  }
  const card = state.deck.shift() ?? null;
  if (card) player(state, id).cards.push(card);
  return card;
}

function endTurn(ctx: GameContext, state: GameState, events: GameEvent[]) {
  const turn = state.turn!;
  if (turn.conquered) events.push({ type: 'card', player: turn.player, card: drawCard(state, turn.player) });
  startTurn(ctx, state, nextAlive(state, turn.player), events);
}

function finishSetupIfReady(ctx: GameContext, state: GameState, events: GameEvent[]) {
  if (!state.players.every((p) => p.setupDone)) return;
  // piazzamento tutti insieme: le armate coperte si scoprono adesso, tutte nello stesso momento
  const revealed: Record<string, Record<string, number>> = {};
  for (const p of state.players) {
    if (!p.pending) continue;
    for (const [tid, n] of Object.entries(p.pending)) state.territories[tid]!.armies += n;
    revealed[p.id] = p.pending;
    delete p.pending;
  }
  if (Object.keys(revealed).length > 0) events.push({ type: 'setup-reveal', placements: revealed });
  state.setupPlayer = null;
  startTurn(ctx, state, state.order[0]!, events);
}

/**
 * Regola Prestige: nessuno può essere eliminato prima della fine del giro `protectedRounds`.
 * Finché vale nessuno esce di scena, quindi ogni giro ha esattamente un turno per giocatore.
 */
export function eliminationAllowed(ctx: GameContext, state: GameState): boolean {
  return !state.turn || state.turn.number > ctx.rules.elimination.protectedRounds * state.order.length;
}

/** Vittoria: obiettivo raggiunto da chi gioca, oppure un solo superstite (che possiede tutto il mondo). */
function checkVictory(ctx: GameContext, state: GameState, events: GameEvent[]) {
  const alive = state.players.filter((p) => p.alive);
  let winner: string | null = null;
  let reason: 'objective' | 'conquest' | 'last-standing' = 'last-standing';
  if (alive.length === 1) {
    winner = alive[0]!.id;
    if (state.mode === 'conquest') reason = 'conquest';
  } else if (state.mode === 'objectives' && state.turn && objectiveMet(ctx, state, state.turn.player)) {
    winner = state.turn.player;
    reason = 'objective';
  }
  if (winner) {
    state.winner = winner;
    state.phase = 'over';
    events.push({ type: 'victory', player: winner, reason });
  }
}

function eliminate(ctx: GameContext, state: GameState, victim: string, by: string, events: GameEvent[]) {
  const v = player(state, victim);
  v.alive = false;
  v.eliminatedBy = by;
  let taken = 0;
  if (ctx.rules.cards.inheritOnElimination) {
    taken = v.cards.length;
    player(state, by).cards.push(...v.cards);
  } else state.discard.push(...v.cards);
  v.cards = [];
  events.push({ type: 'eliminated', player: victim, by, cardsTaken: taken });
  // chi doveva eliminarlo ma è stato battuto sul tempo passa all'obiettivo di riserva
  for (const p of state.players) {
    if (p.id === by || !p.alive || p.objective?.target !== victim) continue;
    const def = objectiveDef(ctx, p.objective.id);
    if (def.kind === 'eliminate') {
      p.objective = { id: def.fallback };
      events.push({ type: 'objective-changed', player: p.id });
    }
  }
}

function areLinked(ctx: GameContext, a: string, b: string) {
  return ctx.neighbours.get(a)?.includes(b) ?? false;
}

/** Territori propri raggiungibili da `from` passando solo per territori propri. */
function connectedOwn(ctx: GameContext, state: GameState, from: string): Set<string> {
  const owner = state.territories[from]!.owner;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    for (const n of ctx.neighbours.get(queue.pop()!) ?? []) {
      if (!seen.has(n) && state.territories[n]!.owner === owner) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------- azioni
export function applyAction(ctx: GameContext, prev: GameState, id: string, action: Action): ActionResult {
  const state = clone(prev);
  const events: GameEvent[] = [];
  const me = player(state, id);
  assertRule(state.phase !== 'over', 'La partita è finita.');
  assertRule(me.alive, 'Sei stato eliminato.');

  if (action.kind === 'setup-place') {
    assertRule(state.phase === 'setup', 'La preparazione è già finita.');
    assertRule(!me.setupDone, 'Hai già piazzato tutte le armate iniziali.');
    const rounds = ctx.rules.setup.placement === 'rounds';
    assertRule(!rounds || state.setupPlayer === id, 'Non tocca a te piazzare.');
    const step = setupStep(ctx, state, id);
    checkPlacements(ctx, state, id, action.placements, step);
    // tutti insieme si piazza alla cieca: le armate restano coperte finché non hanno confermato tutti
    if (rounds) for (const [tid, n] of Object.entries(action.placements)) state.territories[tid]!.armies += n;
    else me.pending = action.placements;
    me.setupLeft -= step;
    me.setupDone = me.setupLeft === 0;
    events.push({ type: 'setup-place', player: id, placements: action.placements, left: me.setupLeft, ...(rounds ? {} : { hidden: true }) });
    if (rounds) state.setupPlayer = nextToPlace(state, id);
    finishSetupIfReady(ctx, state, events);
    return { state, events };
  }

  const turn = state.turn;
  assertRule(state.phase !== 'setup' && turn, 'La partita non è ancora cominciata.');
  assertRule(turn.player === id, 'Non è il tuo turno.');
  assertRule(!turn.occupation || action.kind === 'occupy', 'Prima decidi quante armate spostare nel territorio conquistato.');

  switch (action.kind) {
    case 'play-set': {
      assertRule(state.phase === 'reinforce', 'I tris si giocano nei rinforzi.');
      assertRule(new Set(action.cards).size === 3, 'Servono tre carte diverse.');
      const cards = action.cards.map((cid) => me.cards.find((c) => c.id === cid));
      assertRule(cards.every(Boolean), 'Non hai queste carte.');
      const value = setValue(ctx.rules, cards as Card[]);
      assertRule(value !== null, 'Queste tre carte non formano un tris.');
      const bonus =
        (cards as Card[]).filter((c) => c.territory && state.territories[c.territory]!.owner === id).length *
        ctx.rules.cards.ownedTerritoryBonus;
      me.cards = me.cards.filter((c) => !action.cards.includes(c.id));
      state.discard.push(...(cards as Card[]));
      turn.reinforcements += value + bonus;
      events.push({ type: 'set', player: id, cards: cards as Card[], armies: value + bonus });
      break;
    }
    case 'reinforce': {
      assertRule(state.phase === 'reinforce', 'I rinforzi sono già stati piazzati.');
      checkPlacements(ctx, state, id, action.placements, turn.reinforcements);
      for (const [tid, n] of Object.entries(action.placements)) state.territories[tid]!.armies += n;
      events.push({ type: 'reinforce', player: id, placements: action.placements });
      state.phase = 'attack';
      break;
    }
    case 'attack': {
      assertRule(state.phase === 'attack', 'Adesso non puoi attaccare.');
      const from = state.territories[action.from];
      const to = state.territories[action.to];
      assertRule(from && to, 'Territorio sconosciuto.');
      assertRule(from.owner === id, 'Puoi attaccare solo dai tuoi territori.');
      assertRule(to.owner !== id, 'Non puoi attaccare un tuo territorio.');
      assertRule(areLinked(ctx, action.from, action.to), `${territoryName(ctx, action.from)} non confina con ${territoryName(ctx, action.to)}.`);
      assertRule(action.dice <= ctx.rules.dice.attackMax, `Puoi tirare al massimo ${ctx.rules.dice.attackMax} dadi.`);
      assertRule(action.dice <= from.armies - 1, 'Serve almeno un\'armata in più dei dadi che tiri.');
      const defender = to.owner;
      assertRule(
        eliminationAllowed(ctx, state) || ownedBy(state, defender).length > 1,
        `${player(state, defender).name} ha un solo territorio: nessuno può essere eliminato prima della fine del ${ctx.rules.elimination.protectedRounds}° giro.`,
      );
      const defDice = Math.min(ctx.rules.dice.defenseMax, to.armies);
      const roll = (n: number) =>
        withRng(state, (rng) => Array.from({ length: n }, () => rng.int(1, 6)).sort((a, b) => b - a));
      const attack = roll(action.dice);
      const defense = roll(defDice);
      let attackerLosses = 0;
      let defenderLosses = 0;
      for (let i = 0; i < Math.min(attack.length, defense.length); i++) {
        const a = attack[i]!;
        const d = defense[i]!;
        const attackerWins = a > d || (a === d && ctx.rules.dice.tiesTo === 'attacker');
        if (attackerWins) defenderLosses++;
        else attackerLosses++;
      }
      from.armies -= attackerLosses;
      to.armies -= defenderLosses;
      const conquered = to.armies === 0;
      events.push({
        type: 'battle',
        player: id,
        defender,
        from: action.from,
        to: action.to,
        attack,
        defense,
        attackerLosses,
        defenderLosses,
        conquered,
      });
      if (conquered) {
        to.owner = id;
        turn.conquered = true;
        const max = from.armies - 1;
        turn.occupation = { from: action.from, to: action.to, min: Math.min(action.dice, max), max };
        if (ownedBy(state, defender).length === 0) eliminate(ctx, state, defender, id, events);
      }
      break;
    }
    case 'occupy': {
      const occ = turn.occupation;
      assertRule(occ, 'Non c\'è nessun territorio da occupare.');
      assertRule(action.armies >= occ.min && action.armies <= occ.max, `Puoi spostare da ${occ.min} a ${occ.max} armate.`);
      state.territories[occ.from]!.armies -= action.armies;
      state.territories[occ.to]!.armies = action.armies;
      turn.occupation = null;
      events.push({ type: 'occupy', player: id, from: occ.from, to: occ.to, armies: action.armies });
      break;
    }
    case 'end-attack': {
      assertRule(state.phase === 'attack', 'Non sei nella fase degli attacchi.');
      if (turn.fortifyLeft > 0) state.phase = 'fortify';
      else endTurn(ctx, state, events);
      break;
    }
    case 'fortify': {
      assertRule(state.phase === 'attack' || state.phase === 'fortify', 'Adesso non puoi spostare armate.');
      assertRule(turn.fortifyLeft > 0, 'Hai già fatto lo spostamento di questo turno.');
      const from = state.territories[action.from];
      const to = state.territories[action.to];
      assertRule(from && to && action.from !== action.to, 'Spostamento non valido.');
      assertRule(from.owner === id && to.owner === id, 'Puoi spostare armate solo tra territori tuoi.');
      const reachable =
        ctx.rules.fortify.reach === 'adjacent'
          ? areLinked(ctx, action.from, action.to)
          : connectedOwn(ctx, state, action.from).has(action.to);
      assertRule(
        reachable,
        ctx.rules.fortify.reach === 'adjacent'
          ? 'Si sposta solo verso un territorio confinante.'
          : 'I due territori devono essere collegati da territori tuoi.',
      );
      assertRule(action.armies <= from.armies - 1, 'Almeno un\'armata deve restare dove si trova.');
      from.armies -= action.armies;
      to.armies += action.armies;
      turn.fortifyLeft--;
      events.push({ type: 'fortify', player: id, from: action.from, to: action.to, armies: action.armies });
      // lo spostamento può completare l'obiettivo (es. armate minime): si controlla prima di passare il turno
      checkVictory(ctx, state, events);
      if (state.winner) break;
      if (turn.fortifyLeft === 0) endTurn(ctx, state, events);
      else state.phase = 'fortify';
      break;
    }
    case 'end-turn': {
      assertRule(state.phase === 'attack' || state.phase === 'fortify', 'Prima piazza i rinforzi.');
      endTurn(ctx, state, events);
      break;
    }
  }
  // la vittoria si controlla a occupazione fatta: prima si decidono le armate nel territorio conquistato
  if (!state.winner && !state.turn?.occupation) checkVictory(ctx, state, events);
  return { state, events };
}

// ---------------------------------------------------------------- tempo scaduto
/** Distribuisce `total` armate a caso sui territori indicati (preferendo quelli di confine). */
function autoPlace(ctx: GameContext, state: GameState, id: string, total: number): Record<string, number> {
  const mine = ownedBy(state, id);
  const border = mine.filter((t) => (ctx.neighbours.get(t) ?? []).some((n) => state.territories[n]!.owner !== id));
  const pool = border.length > 0 ? border : mine;
  const out: Record<string, number> = {};
  withRng(state, (rng) => {
    for (let i = 0; i < total; i++) {
      const t = rng.pick(pool);
      out[t] = (out[t] ?? 0) + 1;
    }
  });
  return out;
}

/**
 * Tempo scaduto: in preparazione piazza a caso le armate di chi non ha confermato; durante un
 * turno chiude quello che manca (rinforzi, occupazione) e passa al prossimo.
 */
export function timeout(ctx: GameContext, prev: GameState): ActionResult {
  let state = clone(prev);
  const events: GameEvent[] = [];
  if (state.phase === 'over') return { state, events };
  if (state.phase === 'setup') {
    // a giri scade solo il giro di chi deve piazzare; tutti insieme, quello di chi non ha confermato
    const late = state.setupPlayer ? [state.setupPlayer] : state.players.filter((x) => !x.setupDone).map((x) => x.id);
    for (const pid of late) {
      const placements = autoPlace(ctx, state, pid, setupStep(ctx, state, pid));
      const r = applyAction(ctx, state, pid, { kind: 'setup-place', placements });
      state = r.state;
      events.push(...r.events);
    }
    return { state, events };
  }
  const id = state.turn!.player;
  const run = (action: Action) => {
    const r = applyAction(ctx, state, id, action);
    state = r.state;
    events.push(...r.events);
  };
  if (state.phase === 'reinforce') run({ kind: 'reinforce', placements: autoPlace(ctx, state, id, state.turn!.reinforcements) });
  if (state.phase === 'attack' && state.turn!.occupation) run({ kind: 'occupy', armies: state.turn!.occupation.min });
  if (state.phase === 'attack' || state.phase === 'fortify') run({ kind: 'end-turn' });
  return { state, events };
}
