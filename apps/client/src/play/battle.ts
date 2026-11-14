/**
 * Regista della scena della battaglia: raccoglie i tiri che arrivano dal gioco, li raggruppa per
 * scontro (stesso attacco ripetuto o "fino in fondo") e decide i tempi di ogni momento: ingresso
 * (la camera vola sui due territori), lancio dei dadi, sparatoria dei carri, attesa, esito, uscita.
 * Chi guarda una battaglia degli altri la vede in piccolo (o intera, o niente: è un'opzione).
 */
import { create } from 'zustand';
import type { GameView } from '@onpeace/conquista';
import type { LoggedEvent } from '@onpeace/protocol';
import { sfx, type SoundName } from '../audio/sfx';
import { styleColor, useLook } from '../look';
import { setBlitzStep, territoryName, useSession } from '../store';

/** "Fino in fondo": ogni tiro con i suoi dadi, oppure il conto delle perdite che scorre. */
export type BlitzMode = 'tiri' | 'conto';
/** Che cosa vede chi non combatte. */
export type Watch = 'piccola' | 'intera' | 'niente';
export type Role = 'attacker' | 'defender' | 'spectator';

export interface Roll {
  attack: number[];
  defense: number[];
  aLoss: number;
  dLoss: number;
  conquered: boolean;
}

export interface Fighter {
  player: string;
  name: string;
  color: string;
  territory: string;
  place: string;
  /** Armate prima del primo tiro dello scontro. */
  armies: number;
}

export interface Engagement {
  id: number;
  role: Role;
  a: Fighter;
  d: Fighter;
  rolls: Roll[];
  /** Niente più tiri: territorio preso, o l'attaccante non può più tirare. */
  over: boolean;
  /** Ripresa di uno scontro appena chiuso sugli stessi territori: ingresso breve. */
  again: boolean;
  /** Battaglia finta di prova: "fino in fondo" lo decide lei. */
  demo: null | { blitz: boolean };
}

export type Stage = 'intro' | 'throw' | 'resolve' | 'hold' | 'end' | 'outro';

export interface Playing {
  eng: Engagement;
  /** Tiro mostrato (-1 prima del primo). */
  shown: number;
  stage: Stage;
  /** Durata della fase in corso (ms): le animazioni ci si adattano. */
  ms: number;
  /** Vista in piccolo (chi guarda). */
  small: boolean;
  /** Tiri veloci col conto che scorre. */
  quick: boolean;
  /** Ogni fase ha un numero suo: le animazioni ripartono quando cambia. */
  tick: number;
}

/** Armate dopo il tiro `k` (-1: prima del primo). */
export function armiesAfter(eng: Engagement, k: number): { a: number; d: number } {
  let a = eng.a.armies;
  let d = eng.d.armies;
  for (let i = 0; i <= k && i < eng.rolls.length; i++) {
    a -= eng.rolls[i]!.aLoss;
    d -= eng.rolls[i]!.dLoss;
  }
  return { a, d };
}

/** Coppie di dadi confrontate: per ognuna chi vince (true: l'attaccante). */
export function pairs(r: Roll): boolean[] {
  const n = Math.min(r.attack.length, r.defense.length);
  return Array.from({ length: n }, (_, i) => r.attack[i]! > r.defense[i]!);
}

// ---------------------------------------------------------------- tempi

/** Ingresso (la camera vola sui territori) e uscita (torna indietro). */
const INTRO_MS = 1100;
const OUTRO_MS = 600;

function throwMs(k: number, quick: boolean) {
  return quick ? 280 : k === 0 ? 900 : 620;
}
function resolveMs(k: number, quick: boolean, tanks: boolean, shots: number) {
  // coi carri il confronto è la sparatoria: un colpo per coppia di dadi, uno dopo l'altro
  if (tanks) return quick ? 520 : (k === 0 ? 700 : 560) + shots * (k === 0 ? 520 : 420);
  return quick ? 180 : k === 0 ? 760 : 520;
}

/** Colpi della sparatoria dei carri: quando parte ognuno e quando arriva (ms dall'inizio del confronto). */
export function shotTimes(ms: number, shots: number): { fire: number; hit: number }[] {
  const flight = Math.min(300, ms * 0.35);
  const gap = shots > 1 ? Math.min(520, (ms - 260 - flight - 220) / (shots - 1)) : 0;
  return Array.from({ length: shots }, (_, i) => {
    const fire = 200 + i * Math.max(0, gap);
    return { fire, hit: fire + flight };
  });
}
/** Pausa dopo l'ultimo tiro arrivato: chi attacca ha il tempo di tirare ancora. */
function holdMs(role: Role) {
  return role === 'attacker' ? 2400 : role === 'defender' ? 1300 : 900;
}
const END_MS = 1700;

/** Passo dell'attacco continuo: quanto dura un tiro nella scena (poco meno, per non farla aspettare). */
const BLITZ_STEP: Record<BlitzMode, number> = { tiri: 1000, conto: 380 };

// ---------------------------------------------------------------- stato

interface BattleState {
  blitzMode: BlitzMode;
  watch: Watch;
  playing: Playing | null;
  queue: Engagement[];
  setOptions(patch: Partial<Pick<BattleState, 'blitzMode' | 'watch'>>): void;
  /** Clic sulla scena: salta al risultato, o chiude. */
  skip(): void;
  /** Esc: chiude subito. */
  close(): void;
}

export const useBattle = create<BattleState>((set, get) => ({
  blitzMode: 'tiri',
  watch: 'piccola',
  playing: null,
  queue: [],
  setOptions(patch) {
    set(patch);
    const s = get();
    setBlitzStep(BLITZ_STEP[s.blitzMode]);
  },
  skip() {
    const p = get().playing;
    if (!p) return;
    if (p.stage === 'hold' || p.stage === 'end' || p.stage === 'outro') return outro();
    // al risultato dell'ultimo tiro arrivato, subito
    const last = p.eng.rolls.length - 1;
    if (last < 0) return outro();
    put({ shown: last, stage: 'resolve', ms: 120 });
    schedule(140, afterResolve);
  },
  close() {
    const p = get().playing;
    if (p && p.stage !== 'outro') outro();
  },
}));

setBlitzStep(BLITZ_STEP[useBattle.getState().blitzMode]);

let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
let lastClosed: { key: string; at: number } | null = null;

function schedule(ms: number, fn: () => void) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(fn, ms);
}

function put(patch: Partial<Playing>) {
  const p = useBattle.getState().playing;
  if (p) useBattle.setState({ playing: { ...p, ...patch, tick: p.tick + 1 } });
}

const keyOf = (e: Engagement) => `${e.a.territory}>${e.d.territory}`;

function gainOf(p: Playing) {
  return p.eng.role === 'spectator' ? (p.small ? 0.35 : 0.6) : 1;
}
function play(name: SoundName, delay = 0) {
  const p = useBattle.getState().playing;
  if (p) sfx.play(name, delay, gainOf(p));
}

/** "Fino in fondo" in corso per questo scontro. */
function blitzOn(eng: Engagement): boolean {
  if (eng.demo) return eng.demo.blitz;
  if (eng.role !== 'attacker') return false;
  const d = useSession.getState().draft;
  return d.blitz && d.selected === eng.a.territory && d.target === eng.d.territory;
}

function enqueue(eng: Engagement) {
  const s = useBattle.getState();
  const p = s.playing;
  // chi guarda vede solo l'ultima; e lascia subito il posto a chi combatte
  if (p && p.eng.role === 'spectator' && (eng.role !== 'spectator' || p.small)) {
    useBattle.setState({ playing: null, queue: s.queue.filter((e) => e.role !== 'spectator') });
    return start(eng);
  }
  if (!p) return start(eng);
  const queue = eng.role === 'spectator' ? [...s.queue.filter((e) => e.role !== 'spectator'), eng] : [...s.queue, eng];
  useBattle.setState({ queue });
}

function start(eng: Engagement) {
  const s = useBattle.getState();
  const small = eng.role === 'spectator' && s.watch === 'piccola';
  const quick = false;
  const intro = small ? 120 : Math.round(INTRO_MS * (eng.again ? 0.45 : 1));
  useBattle.setState({ playing: { eng, shown: -1, stage: 'intro', ms: intro, small, quick, tick: 0 } });
  if (!small && !eng.again) play('whoosh');
  schedule(intro, nextRoll);
}

function nextRoll() {
  const p = useBattle.getState().playing;
  if (!p) return;
  const k = p.shown + 1;
  if (k >= p.eng.rolls.length) return p.eng.over ? end() : hold();
  // "conto" veloce: dal secondo tiro di un fino in fondo; e se i tiri si accumulano, si accelera
  const behind = p.eng.rolls.length - 1 - k;
  const quick = (useBattle.getState().blitzMode === 'conto' && k > 0 && (blitzOn(p.eng) || behind > 0)) || behind > 2;
  const speed = p.small ? 0.55 : behind > 0 && !quick ? 0.7 : 1;
  const ms = Math.round(throwMs(k, quick) * speed);
  put({ shown: k, stage: 'throw', ms, quick });
  play('dice');
  schedule(ms, resolve);
}

function resolve() {
  const p = useBattle.getState().playing;
  if (!p) return;
  const roll = p.eng.rolls[p.shown]!;
  const speed = p.small ? 0.55 : 1;
  const shots = pairs(roll).length;
  const tanks = !p.small;
  const ms = Math.round(resolveMs(p.shown, p.quick, tanks, shots) * speed);
  put({ stage: 'resolve', ms });
  if (tanks) {
    // cannonata alla partenza, esplosione all'arrivo
    for (const t of shotTimes(ms, shots)) {
      play('cannon', t.fire / 1000);
      play('kill', t.hit / 1000);
    }
  } else if (p.quick) play('hit');
  else pairs(roll).forEach((_, i) => play('hit', 0.12 + i * 0.13));
  schedule(ms, afterResolve);
}

function afterResolve() {
  const p = useBattle.getState().playing;
  if (!p) return;
  if (p.shown < p.eng.rolls.length - 1) return nextRoll();
  if (p.eng.over) return end();
  hold();
}

function hold() {
  const p = useBattle.getState().playing;
  if (!p) return;
  const ms = p.small ? 1600 : holdMs(p.eng.role);
  put({ stage: 'hold', ms });
  const wait = () => {
    const cur = useBattle.getState().playing;
    if (!cur || cur.stage !== 'hold') return;
    // fino in fondo: si resta qui finché arriva il prossimo tiro
    if (blitzOn(cur.eng)) return schedule(150, wait);
    outro();
  };
  schedule(ms, wait);
}

function end() {
  const p = useBattle.getState().playing;
  if (!p) return;
  const ms = p.small ? 1800 : END_MS;
  put({ stage: 'end', ms });
  const last = p.eng.rolls.at(-1);
  if (last?.conquered) play(p.eng.role === 'defender' ? 'loss' : 'capture', 0.05);
  else play(p.eng.role === 'attacker' ? 'loss' : 'ready', 0.05);
  schedule(ms, outro);
}

function outro() {
  const s = useBattle.getState();
  const p = s.playing;
  if (!p) return;
  const ms = p.small ? 200 : OUTRO_MS;
  put({ stage: 'outro', ms });
  schedule(ms, finish);
}

function finish() {
  const s = useBattle.getState();
  if (s.playing) lastClosed = { key: keyOf(s.playing.eng), at: performance.now() };
  const [next, ...rest] = s.queue;
  useBattle.setState({ playing: null, queue: rest });
  if (next) start(next);
}

/** Un tiro nuovo: si aggiunge allo scontro in corso sugli stessi territori, o ne apre uno. */
export function feedRoll(base: Omit<Engagement, 'id' | 'rolls' | 'over' | 'again'>, roll: Roll, aAfter: number) {
  const s = useBattle.getState();
  const key = `${base.a.territory}>${base.d.territory}`;
  const over = roll.conquered || aAfter < 2;
  const p = s.playing;
  if (p && p.stage !== 'outro' && keyOf(p.eng) === key && !p.eng.over) {
    const eng = { ...p.eng, rolls: [...p.eng.rolls, roll], over };
    useBattle.setState({ playing: { ...p, eng } });
    if (p.stage === 'hold') nextRoll();
    return;
  }
  const queued = s.queue.find((e) => keyOf(e) === key && !e.over);
  if (queued) {
    useBattle.setState({ queue: s.queue.map((e) => (e === queued ? { ...e, rolls: [...e.rolls, roll], over } : e)) });
    return;
  }
  const again = Boolean(lastClosed && lastClosed.key === key && performance.now() - lastClosed.at < 5000);
  enqueue({ ...base, id: nextId++, rolls: [roll], over, again });
}

// ---------------------------------------------------------------- dal gioco

type BattleEvent = Extract<LoggedEvent['event'], { type: 'battle' }>;

/** Le battaglie di un messaggio con le armate di prima: si torna indietro dalla partita aggiornata. */
function withArmiesBefore(view: GameView, events: LoggedEvent[]) {
  const cur = new Map<string, number>();
  const get = (id: string) => cur.get(id) ?? view.territories[id]?.armies ?? 0;
  const out: { e: BattleEvent; a: number; d: number }[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!.event;
    if (e.type === 'battle') {
      const a = get(e.from) + e.attackerLosses;
      const d = get(e.to) + e.defenderLosses;
      cur.set(e.from, a);
      cur.set(e.to, d);
      out.unshift({ e, a, d });
    } else if (e.type === 'occupy' || e.type === 'fortify') {
      cur.set(e.from, get(e.from) + e.armies);
      cur.set(e.to, get(e.to) - e.armies);
    } else if (e.type === 'reinforce') {
      for (const [t, n] of Object.entries(e.placements)) cur.set(t, get(t) - n);
    }
  }
  return out;
}

export function fighter(view: GameView, player: string, territory: string, armies: number): Fighter {
  const board = useSession.getState().board!;
  const p = view.players.find((x) => x.id === player);
  return {
    player,
    name: p?.name ?? player,
    color: styleColor(useLook.getState().style, p?.color ?? '#888888'),
    territory,
    place: territoryName(board, territory),
    armies,
  };
}

function roleOf(me: string | null, e: { player: string; defender: string }): Role {
  return e.player === me ? 'attacker' : e.defender === me ? 'defender' : 'spectator';
}

/** Collega il regista alla partita: ogni messaggio con battaglie nuove le passa alla scena. */
export function connectBattleFeed(): () => void {
  let seen: unknown = useSession.getState().fresh;
  return useSession.subscribe((s) => {
    if (s.fresh === seen) return;
    seen = s.fresh;
    if (!s.fresh || !s.view || !s.board) return;
    const me = s.online.me;
    for (const { e, a, d } of withArmiesBefore(s.view, s.fresh.events)) {
      const role = roleOf(me, e);
      if (role === 'spectator' && useBattle.getState().watch === 'niente') continue;
      const roll: Roll = { attack: e.attack, defense: e.defense, aLoss: e.attackerLosses, dLoss: e.defenderLosses, conquered: e.conquered };
      feedRoll({ role, a: fighter(s.view, e.player, e.from, a), d: fighter(s.view, e.defender, e.to, d), demo: null }, roll, a - e.attackerLosses);
    }
  });
}
