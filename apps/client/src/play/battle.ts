/**
 * Regista della scena della battaglia: raccoglie i tiri che arrivano dal gioco, li raggruppa per
 * scontro (stesso attacco ripetuto o "fino in fondo") e decide i tempi di ogni momento: ingresso
 * (la camera vola sui due territori), lancio dei dadi, sparatoria dei carri, attesa, esito, uscita.
 * Chi guarda una battaglia degli altri la vede in piccolo (o intera, o niente: è un'opzione).
 */
import { create } from 'zustand';
import { pairWins, type GameView, type Reroll, type Volley } from '@onpeace/conquista';
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
  /** Primo lancio, dal più alto. */
  attack: number[];
  defense: number[];
  /** A coppie: lanci rifatti per i pari, in ordine. */
  rerolls?: Reroll[];
  /** A coppie: per ogni coppia, se l'ha vinta chi attacca (dopo i pari ritirati). */
  won: boolean[];
  /** A colpi: quanti colpi ha fatto ognuno (i primi dadi, i più alti). */
  hits?: { attack: number; defense: number };
  /** A colpi, a turno: chi tira (l'altro non tira e i suoi dadi sono vuoti). */
  volley?: 'attack' | 'defense';
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

/** `tie`: i dadi pari si illuminano; `reroll`: si ritirano (a coppie, se le regole lo dicono). */
export type Stage = 'intro' | 'throw' | 'tie' | 'reroll' | 'resolve' | 'hold' | 'end' | 'outro';

export interface Playing {
  eng: Engagement;
  /** Tiro mostrato (-1 prima del primo). */
  shown: number;
  /** Lanci rifatti già mostrati nel tiro in corso. */
  rr: number;
  stage: Stage;
  /** Durata della fase in corso (ms): le animazioni ci si adattano. */
  ms: number;
  /** Vista in piccolo (chi guarda). */
  small: boolean;
  /** Ritmo del tiro in corso ('quick': tiri veloci col conto che scorre). */
  pace: Pace;
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

/**
 * I colpi della sparatoria, in ordine (true: spara chi attacca). A coppie uno per coppia, lo spara
 * chi la vince; a colpi uno per ogni armata persa, alternando le due parti.
 */
export function shotsOf(r: Roll): boolean[] {
  if (!r.hits) return r.won;
  const out: boolean[] = [];
  for (let k = 0; k < Math.max(r.aLoss, r.dLoss); k++) {
    if (k < r.dLoss) out.push(true);
    if (k < r.aLoss) out.push(false);
  }
  return out;
}

// ---------------------------------------------------------------- tempi

/** Ingresso (la camera vola sui territori) e uscita (torna indietro). */
const INTRO_MS = 1100;
const OUTRO_MS = 600;

/**
 * Ritmo di un tiro: normale; svelto per i tiri di un "fino in fondo" dopo il primo (stanno nel passo
 * dell'attacco continuo, così la scena non resta indietro); veloce col conto che scorre.
 */
export type Pace = 'normal' | 'blitz' | 'quick';

/**
 * Ritmo del tiro `k` quando ne sono arrivati `arrived`: veloce se i tiri si accumulano, e per un "fino
 * in fondo" (dal secondo tiro) col conto veloce o quando la scena è rimasta indietro di un tiro.
 */
export function paceOf(k: number, arrived: number, blitz: boolean, mode: BlitzMode): Pace {
  const behind = arrived - 1 - k;
  if (behind > 2) return 'quick';
  if (k === 0) return 'normal';
  if (mode === 'conto' && (blitz || behind > 0)) return 'quick';
  if (blitz) return behind > 0 ? 'quick' : 'blitz';
  return 'normal';
}

/**
 * A turno i tiri di una battaglia arrivano tutti insieme: i primi due (uno per parte) con calma,
 * poi svelti come in un "fino in fondo"; in una battaglia lunga quelli di mezzo sono veloci.
 */
export function volleyPace(k: number, total: number): Pace {
  if (k < 2) return 'normal';
  if (total > 12 && k < total - 4) return 'quick';
  return 'blitz';
}

export function throwMs(k: number, pace: Pace) {
  return pace === 'quick' ? 280 : k === 0 ? 900 : pace === 'blitz' ? 440 : 620;
}
export function resolveMs(k: number, pace: Pace, tanks: boolean, shots: number) {
  // coi carri il confronto è la sparatoria: un colpo per coppia di dadi, uno dopo l'altro
  // (a colpi possono essere tanti: oltre sei si spara più fitto, la scena non si allunga;
  // nel "fino in fondo" già oltre tre)
  if (tanks) {
    if (pace === 'quick') return 520;
    if (pace === 'blitz') return 380 + Math.min(shots, 3) * 160;
    return (k === 0 ? 700 : 560) + Math.min(shots, 6) * (k === 0 ? 520 : 420);
  }
  return pace === 'quick' ? 180 : k === 0 ? 760 : 520;
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
/** Pari: i dadi pari si illuminano, poi si ritirano. */
const TIE_MS = 650;
const REROLL_MS = 640;

/**
 * Passo dell'attacco continuo: quanto dura un tiro nella scena (poco meno, per non farla aspettare).
 * Tiro per tiro: un tiro svelto con due colpi; se la scena resta indietro di un tiro, il successivo è
 * veloce e la riporta in pari. Col conto veloce: un tiro veloce.
 */
export const BLITZ_STEP: Record<BlitzMode, number> = {
  tiri: throwMs(1, 'blitz') + resolveMs(1, 'blitz', true, 2) - 140,
  conto: throwMs(1, 'quick') + resolveMs(1, 'quick', true, 2) - 40,
};

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
    // l'uscita è già partita: un clic in più non la rifà da capo
    if (!p || p.stage === 'outro') return;
    if (p.stage === 'hold' || p.stage === 'end') return outro();
    // al risultato dell'ultimo tiro arrivato, subito: i colpi già in programma si zittiscono
    const last = p.eng.rolls.length - 1;
    if (last < 0) return outro();
    silence();
    put({ shown: last, rr: p.eng.rolls[last]!.rerolls?.length ?? 0, stage: 'resolve', ms: 120 });
    schedule(140, afterResolve);
  },
  close() {
    const p = get().playing;
    if (!p || p.stage === 'outro') return;
    silence();
    outro();
  },
}));

setBlitzStep(BLITZ_STEP[useBattle.getState().blitzMode]);

/**
 * Una mia battaglia d'attacco è sulla scena prima del risultato, o aspetta in coda il suo turno:
 * la barra dei comandi non svela come finisce e Invio non occupa ancora.
 */
export function fightingOn(b: { playing: Playing | null; queue: Engagement[] }): boolean {
  const p = b.playing;
  if (p && !p.small && p.eng.role === 'attacker' && p.stage !== 'end' && p.stage !== 'outro') return true;
  return b.queue.some((e) => e.role === 'attacker');
}

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

/** Uscita dei suoni della scena: i colpi sono in programma in anticipo, saltando o chiudendo si zittiscono. */
let bus: GainNode | null = null;
function silence() {
  if (bus) sfx.mute(bus);
  bus = null;
}
function play(name: SoundName, delay = 0) {
  const p = useBattle.getState().playing;
  if (!p) return;
  bus ??= sfx.bus();
  sfx.play(name, delay, gainOf(p), bus ?? undefined);
}

/** "Fino in fondo" in corso per questo scontro. */
function blitzOn(eng: Engagement): boolean {
  if (eng.demo) return eng.demo.blitz;
  if (eng.role !== 'attacker') return false;
  const d = useSession.getState().draft;
  return d.blitz && d.selected === eng.a.territory && d.target === eng.d.territory;
}

/** La coda con uno scontro in più: chi combatte passa davanti a chi guarda, e di chi guarda resta solo l'ultimo. */
export function queueWith(queue: Engagement[], eng: Engagement): Engagement[] {
  if (eng.role === 'spectator') return [...queue.filter((e) => e.role !== 'spectator'), eng];
  const i = queue.findIndex((e) => e.role === 'spectator');
  return i < 0 ? [...queue, eng] : [...queue.slice(0, i), eng, ...queue.slice(i)];
}

/** Il prossimo scontro da mostrare (prima chi combatte, poi chi guarda) e la coda che resta. */
export function nextOf(queue: Engagement[]): { next: Engagement | undefined; rest: Engagement[] } {
  const i = Math.max(0, queue.findIndex((e) => e.role !== 'spectator'));
  return { next: queue[i], rest: queue.filter((_, k) => k !== i) };
}

function enqueue(eng: Engagement) {
  const s = useBattle.getState();
  const p = s.playing;
  if (!p) return start(eng);
  // chi guarda vede solo l'ultima; e lascia subito il posto a chi combatte (prima a chi aspettava già)
  if (p.eng.role === 'spectator' && (eng.role !== 'spectator' || p.small)) {
    const { next, rest } = nextOf(queueWith(s.queue.filter((e) => e.role !== 'spectator'), eng));
    silence();
    useBattle.setState({ playing: null, queue: rest });
    return start(next!);
  }
  useBattle.setState({ queue: queueWith(s.queue, eng) });
  // chi combatte non aspetta la pausa della scena prima (a meno che lì vada avanti un "fino in fondo")
  if (eng.role !== 'spectator' && p.stage === 'hold' && !blitzOn(p.eng)) outro();
}

function start(eng: Engagement) {
  const s = useBattle.getState();
  const small = eng.role === 'spectator' && s.watch === 'piccola';
  const intro = small ? 120 : Math.round(INTRO_MS * (eng.again ? 0.45 : 1));
  useBattle.setState({ playing: { eng, shown: -1, rr: 0, stage: 'intro', ms: intro, small, pace: 'normal', tick: 0 } });
  if (!small && !eng.again) play('whoosh');
  schedule(intro, nextRoll);
}

function nextRoll() {
  const p = useBattle.getState().playing;
  if (!p) return;
  const k = p.shown + 1;
  if (k >= p.eng.rolls.length) return p.eng.over ? end() : hold();
  // fino in fondo: svelto dal secondo tiro, veloce col conto o se resta indietro; se i tiri si accumulano, si accelera.
  // A turno i tiri arrivano tutti insieme: non sono indietro, hanno il loro ritmo
  const volley = p.eng.rolls[k]!.volley !== undefined;
  const behind = p.eng.rolls.length - 1 - k;
  const pace = volley ? volleyPace(k, p.eng.rolls.length) : paceOf(k, p.eng.rolls.length, blitzOn(p.eng), useBattle.getState().blitzMode);
  const speed = p.small ? 0.55 : !volley && behind > 0 ? 0.7 : 1;
  const ms = Math.round(throwMs(k, pace) * speed);
  // in piccolo e col conto veloce i pari ritirati non si guardano: si vedono subito i dadi finali
  const rr = p.small || pace === 'quick' ? (p.eng.rolls[k]!.rerolls?.length ?? 0) : 0;
  put({ shown: k, rr, stage: 'throw', ms, pace });
  play('dice');
  schedule(ms, afterThrow);
}

/** Dopo un lancio: se restano pari da ritirare si mostrano, altrimenti si confronta. */
function afterThrow() {
  const p = useBattle.getState().playing;
  if (!p) return;
  if (p.rr < (p.eng.rolls[p.shown]!.rerolls?.length ?? 0)) {
    put({ stage: 'tie', ms: TIE_MS });
    return schedule(TIE_MS, reroll);
  }
  resolve();
}

function reroll() {
  const p = useBattle.getState().playing;
  if (!p) return;
  put({ stage: 'reroll', rr: p.rr + 1, ms: REROLL_MS });
  play('dice');
  schedule(REROLL_MS, afterThrow);
}

function resolve() {
  const p = useBattle.getState().playing;
  if (!p) return;
  const roll = p.eng.rolls[p.shown]!;
  const speed = p.small ? 0.55 : 1;
  const shots = shotsOf(roll).length;
  const tanks = !p.small;
  const ms = Math.round(resolveMs(p.shown, p.pace, tanks, shots) * speed);
  put({ stage: 'resolve', ms });
  if (tanks) {
    // cannonata alla partenza, esplosione all'arrivo
    for (const t of shotTimes(ms, shots)) {
      play('cannon', t.fire / 1000);
      play('kill', t.hit / 1000);
    }
  } else if (p.pace === 'quick') play('hit');
  else shotsOf(roll).slice(0, 6).forEach((_, i) => play('hit', 0.12 + i * 0.13));
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
  // se aspetta uno scontro di chi gioca, la pausa è breve (quelli in piccolo degli altri aspettano)
  const ownNext = useBattle.getState().queue.some((e) => e.role !== 'spectator');
  const ms = ownNext ? 300 : p.small ? 1600 : holdMs(p.eng.role);
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
  silence();
  const { next, rest } = nextOf(s.queue);
  useBattle.setState({ playing: null, queue: rest });
  if (next) start(next);
}

/** Via tutte le scene, senza uscita (si lascia la partita): non restano timer né suoni in programma. */
export function resetBattle(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  lastClosed = null;
  silence();
  useBattle.setState({ playing: null, queue: [] });
}

/**
 * Un tiro nuovo: si aggiunge allo scontro in corso sugli stessi territori, o ne apre uno. Lo scontro
 * finisce col territorio preso o quando chi attacca non può più tirare; `last` lo dice da fuori
 * (a turno la battaglia finisce all'ultimo tiro, anche se a casa restano armate).
 */
export function feedRoll(base: Omit<Engagement, 'id' | 'rolls' | 'over' | 'again'>, roll: Roll, aAfter: number, last?: boolean) {
  const s = useBattle.getState();
  const key = `${base.a.territory}>${base.d.territory}`;
  const over = last ?? (roll.conquered || aAfter < 2);
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

/**
 * I tiri della scena di una battaglia a turno: ognuno ha i dadi di chi tira e le armate che toglie
 * all'altro. Prima dell'ultimo tiro nessuno resta a zero, quindi ogni colpo toglie un'armata; l'ultimo
 * toglie quello che manca per arrivare alle perdite di tutta la battaglia (i colpi in più vanno a vuoto).
 */
export function volleyRolls(volleys: readonly Volley[], losses: { attacker: number; defender: number }, conquered: boolean): Roll[] {
  let a = 0;
  let d = 0;
  return volleys.map((v, i) => {
    const attack = v.by === 'attack';
    const last = i === volleys.length - 1;
    const loss = last ? (attack ? losses.defender - d : losses.attacker - a) : v.hits;
    if (attack) d += loss;
    else a += loss;
    return {
      attack: attack ? v.dice : [],
      defense: attack ? [] : v.dice,
      won: [],
      hits: { attack: attack ? v.hits : 0, defense: attack ? 0 : v.hits },
      volley: v.by,
      aLoss: attack ? 0 : loss,
      dLoss: attack ? loss : 0,
      conquered: conquered && last,
    };
  });
}

function roleOf(me: string | null, e: { player: string; defender: string }): Role {
  return e.player === me ? 'attacker' : e.defender === me ? 'defender' : 'spectator';
}

/** Collega il regista alla partita: ogni messaggio con battaglie nuove le passa alla scena. */
export function connectBattleFeed(): () => void {
  let seen: unknown = useSession.getState().fresh;
  const off = useSession.subscribe((s) => {
    if (s.fresh === seen) return;
    seen = s.fresh;
    if (!s.fresh || !s.view || !s.board) return;
    const me = s.online.me;
    for (const { e, a, d } of withArmiesBefore(s.view, s.fresh.events)) {
      const role = roleOf(me, e);
      if (role === 'spectator' && useBattle.getState().watch === 'niente') continue;
      const base = { role, a: fighter(s.view, e.player, e.from, a), d: fighter(s.view, e.defender, e.to, d), demo: null };
      if (e.volleys) {
        // a turno: un tiro della scena per ogni tiro della battaglia, tutti insieme
        volleyRolls(e.volleys, { attacker: e.attackerLosses, defender: e.defenderLosses }, e.conquered).forEach((roll, i, all) => feedRoll(base, roll, a, i === all.length - 1));
        continue;
      }
      const roll: Roll = {
        attack: e.attack,
        defense: e.defense,
        ...(e.rerolls ? { rerolls: e.rerolls } : {}),
        won: pairWins(e),
        ...(e.hits ? { hits: e.hits } : {}),
        aLoss: e.attackerLosses,
        dLoss: e.defenderLosses,
        conquered: e.conquered,
      };
      feedRoll(base, roll, a - e.attackerLosses);
    }
  });
  // lasciando la partita le scene finiscono qui: niente suoni sulla schermata iniziale
  return () => {
    off();
    resetBattle();
  };
}
