import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// il regista della battaglia senza browser: sessione, aspetto e suoni finti
const h = vi.hoisted(() => ({
  draft: { blitz: false, selected: null as string | null, target: null as string | null },
  sounds: [] as { name: string; bus: unknown }[],
  muted: [] as unknown[],
  buses: 0,
}));

vi.mock('../src/store', () => ({
  setBlitzStep: () => {},
  territoryName: (_board: unknown, id: string) => id,
  useSession: { getState: () => ({ draft: h.draft }), subscribe: () => () => {} },
}));
vi.mock('../src/look', () => ({
  styleColor: (_style: unknown, color: string) => color,
  useLook: { getState: () => ({ style: null }) },
}));
vi.mock('../src/audio/sfx', () => ({
  sfx: {
    play: (name: string, _delay: number, _gain: number, bus: unknown) => h.sounds.push({ name, bus }),
    bus: () => ({ id: ++h.buses }),
    mute: (bus: unknown) => h.muted.push(bus),
  },
}));

import {
  BLITZ_STEP,
  feedRoll,
  fightingOn,
  nextOf,
  paceOf,
  queueWith,
  resetBattle,
  resolveMs,
  throwMs,
  useBattle,
  volleyPace,
  volleyRolls,
  type Engagement,
  type Role,
  type Roll,
} from '../src/play/battle';

const battle = () => useBattle.getState();
const playing = () => battle().playing;
const keyOf = (e: Engagement | undefined) => (e ? `${e.a.territory}>${e.d.territory}` : null);
const now = () => Date.now();

function base(role: Role, a: string, d: string, demo: Engagement['demo'] = null) {
  const fighter = (territory: string, player: string) => ({ player, name: player, color: '#888888', territory, place: territory, armies: 30 });
  return { role, a: fighter(a, 'x'), d: fighter(d, 'y'), demo };
}

/** Un tiro a coppie con `shots` coppie, tutte vinte da chi attacca. */
function roll(shots = 2, conquered = false): Roll {
  return { attack: [6, 6, 6].slice(0, shots), defense: [1, 1, 1].slice(0, shots), won: Array<boolean>(shots).fill(true), aLoss: 0, dLoss: shots, conquered };
}

function feed(role: Role, a: string, d: string, r: Roll = roll(), demo: Engagement['demo'] = null) {
  feedRoll(base(role, a, d, demo), r, 30);
}

/** Quando parte ogni scontro (ms dall'inizio) e quando si chiude l'ultima scena. */
function track() {
  const t0 = now();
  const starts: { key: string | null; at: number }[] = [];
  const shown: number[] = [];
  let closed = -1;
  let id = -1;
  const off = useBattle.subscribe((s) => {
    const p = s.playing;
    if (p && p.eng.id !== id) starts.push({ key: keyOf(p.eng), at: now() - t0 });
    if (p && p.stage === 'throw' && shown[p.shown] === undefined) shown[p.shown] = now() - t0;
    if (!p && s.queue.length === 0) closed = now() - t0;
    id = p?.eng.id ?? -1;
  });
  return { starts, shown, closed: () => closed, off };
}

const eng = (role: Role, a: string, d: string, id: number): Engagement => ({ ...base(role, a, d), id, rolls: [], over: false, again: false });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  resetBattle();
  battle().setOptions({ blitzMode: 'tiri', watch: 'piccola' });
  h.draft = { blitz: false, selected: null, target: null };
  h.sounds = [];
  h.muted = [];
});

afterEach(() => {
  resetBattle();
  vi.useRealTimers();
});

describe('coda delle scene', () => {
  it('chi combatte passa davanti a chi guarda; di chi guarda resta solo l’ultimo', () => {
    const s1 = eng('spectator', 'c', 'd', 1);
    const s2 = eng('spectator', 'g', 'h', 2);
    const o1 = eng('defender', 'e', 'f', 3);
    const o2 = eng('attacker', 'i', 'j', 4);
    expect(queueWith([s1], o1)).toEqual([o1, s1]);
    expect(queueWith([o1, s1], o2)).toEqual([o1, o2, s1]);
    expect(queueWith([o1, s1], s2)).toEqual([o1, s2]);
    expect(nextOf([s1, o1])).toEqual({ next: o1, rest: [s1] });
    expect(nextOf([s1])).toEqual({ next: s1, rest: [] });
    expect(nextOf([])).toEqual({ next: undefined, rest: [] });
  });

  it('ti attaccano di nuovo mentre guardi: il tuo scontro non aspetta quello degli altri', () => {
    const t = track();
    feed('defender', 'a', 'b');
    vi.advanceTimersByTime(500);
    feed('spectator', 'c', 'd');
    vi.advanceTimersByTime(500);
    feed('defender', 'e', 'f');
    expect(battle().queue.map(keyOf)).toEqual(['e>f', 'c>d']);
    vi.advanceTimersByTime(30_000);
    t.off();
    expect(t.starts.map((s) => s.key)).toEqual(['a>b', 'e>f', 'c>d']);
    // con un tuo scontro in coda la pausa dopo l'ultimo tiro è breve
    expect(t.starts[1]!.at).toBeLessThan(4800);
  });

  it('una battaglia degli altri in piccolo lascia subito il posto alla tua', () => {
    feed('spectator', 'c', 'd');
    expect(playing()?.small).toBe(true);
    vi.advanceTimersByTime(300);
    feed('defender', 'a', 'b');
    expect(keyOf(playing()?.eng)).toBe('a>b');
    expect(playing()?.small).toBe(false);
    // in piccolo chi guarda vede solo l'ultima
    resetBattle();
    feed('spectator', 'c', 'd');
    vi.advanceTimersByTime(300);
    feed('spectator', 'g', 'h');
    expect(keyOf(playing()?.eng)).toBe('g>h');
  });

  it('attacchi tre territori di fila: ogni scena dopo la prima parte senza la pausa lunga', () => {
    const t = track();
    feed('attacker', 'a', 'b');
    vi.advanceTimersByTime(1000);
    feed('attacker', 'c', 'd');
    vi.advanceTimersByTime(1000);
    feed('attacker', 'e', 'f');
    vi.advanceTimersByTime(30_000);
    t.off();
    expect(t.starts.map((s) => s.key)).toEqual(['a>b', 'c>d', 'e>f']);
    expect(t.starts[2]!.at).toBeLessThan(9500);
    // prima l'ultima scena si chiudeva dopo più di 20 secondi
    expect(t.closed()).toBeLessThan(16_500);
  });

  it('un tuo scontro nuovo durante la pausa di quello prima: la scena esce subito', () => {
    feed('attacker', 'a', 'b');
    vi.advanceTimersByTime(3800);
    expect(playing()?.stage).toBe('hold');
    feed('attacker', 'c', 'd');
    expect(playing()?.stage).toBe('outro');
    vi.advanceTimersByTime(600);
    expect(keyOf(playing()?.eng)).toBe('c>d');
  });
});

describe('fino in fondo', () => {
  it('ritmo: veloce se i tiri si accumulano, svelto dal secondo tiro, veloce se resta indietro', () => {
    expect(paceOf(0, 1, true, 'tiri')).toBe('normal');
    expect(paceOf(1, 2, true, 'tiri')).toBe('blitz');
    expect(paceOf(1, 3, true, 'tiri')).toBe('quick');
    expect(paceOf(1, 3, false, 'tiri')).toBe('normal');
    expect(paceOf(0, 4, false, 'tiri')).toBe('quick');
    expect(paceOf(1, 2, true, 'conto')).toBe('quick');
    expect(paceOf(1, 2, false, 'conto')).toBe('normal');
  });

  it('il passo dell’attacco continuo è poco meno di un tiro nella scena', () => {
    const blitzRoll = throwMs(1, 'blitz') + resolveMs(1, 'blitz', true, 2);
    expect(BLITZ_STEP.tiri).toBeLessThan(blitzRoll);
    expect(BLITZ_STEP.tiri).toBeGreaterThan(blitzRoll - 200);
    const quickRoll = throwMs(1, 'quick') + resolveMs(1, 'quick', true, 2);
    expect(BLITZ_STEP.conto).toBeLessThan(quickRoll);
    expect(BLITZ_STEP.conto).toBeGreaterThan(quickRoll - 100);
    // un tiro veloce recupera: sta dentro il passo
    expect(Math.round(throwMs(1, 'quick') * 0.7) + resolveMs(1, 'quick', true, 3)).toBeLessThan(BLITZ_STEP.conto);
  });

  /** Dodici tiri, uno ogni passo più il viaggio dal server; il ritardo della scena sull'ultimo tiro e quando si chiude. */
  function blitz(mode: 'tiri' | 'conto', shots: number) {
    battle().setOptions({ blitzMode: mode });
    const t = track();
    const demo = { blitz: true };
    const every = BLITZ_STEP[mode] + 60;
    const n = 12;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (i === n - 1) demo.blitz = false;
        feed('attacker', 'a', 'b', roll(shots, i === n - 1), demo);
      }, i * every);
    }
    vi.advanceTimersByTime(60_000);
    t.off();
    const lags = t.shown.map((at, k) => at - k * every);
    return { lags, afterLast: t.closed() - (n - 1) * every };
  }

  // il primo tiro si vede intero dopo l'ingresso: da lì la scena è indietro e deve recuperare, non perdere altro
  it('tiro per tiro: la scena recupera e chiude poco dopo l’ultimo tiro (due e tre colpi a tiro)', () => {
    for (const shots of [2, 3]) {
      const { lags, afterLast } = blitz('tiri', shots);
      expect(lags).toHaveLength(12);
      expect(lags.at(-1)!).toBeLessThan(lags[1]!);
      // prima l'ultimo tiro si vedeva 5 secondi dopo e la scena si chiudeva dopo più di 9
      expect(lags.at(-1)!).toBeLessThan(1500);
      // l'ultimo tiro (il fino in fondo è finito) si vede col passo pieno, poi l'esito e l'uscita
      expect(afterLast).toBeLessThan(6500);
      resetBattle();
    }
  });

  it('col conto veloce il ritardo cala a ogni tiro invece di crescere', () => {
    const { lags, afterLast } = blitz('conto', 2);
    expect(lags).toHaveLength(12);
    for (let k = 2; k < lags.length; k++) expect(lags[k]!).toBeLessThanOrEqual(lags[k - 1]!);
    // prima l'ultimo tiro si vedeva quasi 7 secondi dopo e la scena si chiudeva dopo 11
    expect(lags.at(-1)!).toBeLessThan(2000);
    expect(afterLast).toBeLessThan(6500);
  });
});

describe('clic, Esc e suoni', () => {
  it('i clic durante l’uscita non la rifanno da capo', () => {
    feed('attacker', 'a', 'b');
    vi.advanceTimersByTime(3800);
    battle().skip();
    expect(playing()?.stage).toBe('outro');
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(140);
      battle().skip();
    }
    expect(playing()?.stage).toBe('outro');
    vi.advanceTimersByTime(40);
    expect(playing()).toBeNull();
  });

  it('saltando al risultato i colpi già in programma si zittiscono; il tiro dopo suona su un’uscita nuova', () => {
    feed('attacker', 'a', 'b');
    vi.advanceTimersByTime(2050);
    expect(playing()?.stage).toBe('resolve');
    const scene = h.sounds.find((s) => s.name === 'cannon')!.bus;
    expect(h.sounds.every((s) => s.bus === scene)).toBe(true);
    battle().skip();
    expect(h.muted).toEqual([scene]);
    vi.advanceTimersByTime(200);
    expect(playing()?.stage).toBe('hold');
    feed('attacker', 'a', 'b');
    const next = h.sounds.at(-1)!;
    expect(next.name).toBe('dice');
    expect(next.bus).not.toBe(scene);
  });

  it('Esc (close) e la fine della scena zittiscono i suoni rimasti', () => {
    feed('attacker', 'a', 'b');
    vi.advanceTimersByTime(2050);
    battle().close();
    expect(h.muted).toHaveLength(1);
    expect(playing()?.stage).toBe('outro');
    // Esc durante l'uscita non fa niente
    battle().close();
    expect(h.muted).toHaveLength(1);
    vi.advanceTimersByTime(600);
    expect(playing()).toBeNull();
  });

  it('lasciando la partita le scene finiscono e non suonano più', () => {
    feed('defender', 'a', 'b');
    feed('defender', 'c', 'd');
    vi.advanceTimersByTime(1500);
    expect(playing()).not.toBeNull();
    resetBattle();
    expect(playing()).toBeNull();
    expect(battle().queue).toEqual([]);
    const before = h.sounds.length;
    vi.advanceTimersByTime(30_000);
    expect(h.sounds.length).toBe(before);
    expect(playing()).toBeNull();
  });
});

describe('a colpi, a turno', () => {
  it('ogni tiro toglie armate a una parte sola; l’ultimo solo quelle che restano', () => {
    // chi difende colpisce 2 volte, chi attacca 3 (ne restavano 2), poi basta: conquista
    const rolls = volleyRolls(
      [
        { by: 'defense', dice: [6, 5, 1], hits: 2 },
        { by: 'attack', dice: [6, 6, 6, 2], hits: 3 },
        { by: 'defense', dice: [4], hits: 1 },
        { by: 'attack', dice: [6, 6, 6], hits: 3 },
      ],
      { attacker: 3, defender: 3 },
      true,
    );
    expect(rolls.map((r) => [r.volley, r.aLoss, r.dLoss, r.conquered])).toEqual([
      ['defense', 2, 0, false],
      ['attack', 0, 3, false],
      ['defense', 1, 0, false],
      ['attack', 0, 0, true],
    ]);
    expect(rolls[0]).toMatchObject({ attack: [], defense: [6, 5, 1], hits: { attack: 0, defense: 2 } });
    expect(rolls[1]).toMatchObject({ attack: [6, 6, 6, 2], defense: [], hits: { attack: 3, defense: 0 } });
  });

  it('i primi due tiri con calma, poi svelti; in una battaglia lunga quelli di mezzo veloci', () => {
    expect([0, 1, 2, 3].map((k) => volleyPace(k, 4))).toEqual(['normal', 'normal', 'blitz', 'blitz']);
    expect([2, 10, 11, 15].map((k) => volleyPace(k, 16))).toEqual(['quick', 'quick', 'quick', 'blitz']);
  });

  it('tutti i tiri arrivano insieme: la scena li mostra uno dopo l’altro e chiude da sola', () => {
    const rolls = volleyRolls(
      [
        { by: 'defense', dice: [1, 1], hits: 0 },
        { by: 'attack', dice: [6, 6, 1], hits: 2 },
      ],
      { attacker: 0, defender: 2 },
      true,
    );
    const t = track();
    rolls.forEach((r, i) => feedRoll(base('attacker', 'a', 'b'), r, 30, i === rolls.length - 1));
    expect(playing()!.eng.rolls).toHaveLength(2);
    expect(playing()!.eng.over).toBe(true);
    // la barra dei comandi aspetta la fine della scena prima di dire com'è andata
    expect(fightingOn(battle())).toBe(true);
    vi.advanceTimersByTime(20_000);
    expect(t.shown).toHaveLength(2);
    expect(t.shown[1]! - t.shown[0]!).toBeGreaterThan(throwMs(0, 'normal'));
    expect(t.closed()).toBeGreaterThan(0);
    expect(fightingOn(battle())).toBe(false);
    t.off();
  });

  it('una mia battaglia in coda dietro a un’altra scena: la barra aspetta anche lei', () => {
    feed('defender', 'c', 'd');
    feedRoll(base('attacker', 'a', 'b'), roll(1, true), 30, true);
    expect(playing()!.eng.role).toBe('defender');
    expect(fightingOn(battle())).toBe(true);
  });
});

