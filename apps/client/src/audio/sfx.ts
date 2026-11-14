/**
 * Suoni del gioco, sintetizzati al momento con la Web Audio API: nessun file da scaricare,
 * niente licenze, peso trascurabile. Brevi e discreti: accompagnano le azioni, non le coprono.
 *
 * I browser non suonano finché l'utente non ha interagito con la pagina: il contesto audio
 * nasce (o riparte) al primo clic o tasto (`unlock`). Volume e muto restano nel browser.
 */

export type SoundName =
  | 'select'
  | 'pickup'
  | 'waypoint'
  | 'move'
  | 'attack'
  | 'error'
  | 'buy'
  | 'build'
  | 'embark'
  | 'remove'
  | 'ready'
  | 'unready'
  | 'turn'
  | 'warn'
  | 'tick'
  | 'battle'
  | 'capture'
  | 'loss'
  | 'chat'
  | 'yourPick'
  | 'join'
  | 'victory'
  | 'defeat'
  | 'hit'
  | 'crit'
  | 'kill'
  | 'dice'
  | 'whoosh'
  | 'cannon'
  | 'deal'
  | 'flip';

type Synth = (ac: BaseAudioContext, out: AudioNode, t: number, noise: AudioBuffer) => void;

// ------------------------------------------------------------------ mattoni

/** Inviluppo: attacco lineare, poi decadimento esponenziale fino al silenzio. */
function envelope(p: AudioParam, t: number, attack: number, peak: number, decay: number) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Frequenza finale (glissando esponenziale). */
  to?: number;
  dur: number;
  gain: number;
  attack?: number;
  lowpass?: number;
}

function tone(ac: BaseAudioContext, out: AudioNode, t: number, o: ToneOpts) {
  const attack = o.attack ?? 0.004;
  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + attack + o.dur);
  const g = ac.createGain();
  envelope(g.gain, t, attack, o.gain, o.dur);
  if (o.lowpass) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    osc.connect(f).connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(out);
  osc.start(t);
  osc.stop(t + attack + o.dur + 0.05);
}

interface NoiseOpts {
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  attack?: number;
}

function noise(ac: BaseAudioContext, out: AudioNode, t: number, buffer: AudioBuffer, o: NoiseOpts) {
  const attack = o.attack ?? 0.002;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const f = ac.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + attack + o.dur);
  f.Q.value = o.q ?? 0.8;
  const g = ac.createGain();
  envelope(g.gain, t, attack, o.gain, o.dur);
  src.connect(f).connect(g).connect(out);
  // ogni colpo parte da un punto diverso del rumore: due suoni uguali non sono mai identici
  src.start(t, Math.random() * (buffer.duration - o.dur - attack - 0.1));
  src.stop(t + attack + o.dur + 0.05);
}

/** Nota MIDI → frequenza (69 = La4 = 440 Hz). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Campanella: fondamentale più due parziali che svaniscono prima. */
function bell(ac: BaseAudioContext, out: AudioNode, t: number, midi: number, gain: number, dur: number) {
  const f = hz(midi);
  tone(ac, out, t, { freq: f, dur, gain, attack: 0.006 });
  tone(ac, out, t, { freq: f * 2.01, dur: dur * 0.45, gain: gain * 0.22, attack: 0.004 });
  tone(ac, out, t, { freq: f * 3.02, dur: dur * 0.2, gain: gain * 0.08, attack: 0.003 });
}

/** Ottone leggero: dente di sega addolcito da un passa-basso. */
function brass(ac: BaseAudioContext, out: AudioNode, t: number, midi: number, gain: number, dur: number) {
  tone(ac, out, t, { type: 'sawtooth', freq: hz(midi), dur, gain, attack: 0.025, lowpass: 1900 });
  tone(ac, out, t, { type: 'triangle', freq: hz(midi), dur, gain: gain * 0.6, attack: 0.02 });
}

// ------------------------------------------------------------------ i suoni

export const SOUNDS: Record<SoundName, Synth> = {
  /** Scelta di una pila o di una città: un tocco leggero. */
  select: (ac, out, t) => {
    tone(ac, out, t, { freq: 1320, to: 990, dur: 0.05, gain: 0.11 });
  },
  /** Si afferra una pila. */
  pickup: (ac, out, t, n) => {
    tone(ac, out, t, { type: 'triangle', freq: 392, to: 587, dur: 0.08, gain: 0.13 });
    noise(ac, out, t, n, { dur: 0.04, gain: 0.04, filter: 'highpass', freq: 3500 });
  },
  /** Tappa intermedia. */
  waypoint: (ac, out, t) => {
    tone(ac, out, t, { freq: 1568, dur: 0.045, gain: 0.09 });
    tone(ac, out, t + 0.045, { freq: 2093, dur: 0.05, gain: 0.07 });
  },
  /** Ordine di movimento: passo pesante e fruscio. */
  move: (ac, out, t, n) => {
    tone(ac, out, t, { freq: 160, to: 85, dur: 0.12, gain: 0.32 });
    noise(ac, out, t, n, { dur: 0.16, gain: 0.16, filter: 'lowpass', freq: 1200, to: 300 });
  },
  /** Ordine d'attacco: due colpi di tamburo e uno squillo breve. */
  attack: (ac, out, t, n) => {
    tone(ac, out, t, { freq: 115, to: 50, dur: 0.18, gain: 0.42 });
    noise(ac, out, t, n, { dur: 0.05, gain: 0.12, filter: 'bandpass', freq: 1800, q: 1 });
    tone(ac, out, t + 0.12, { freq: 125, to: 52, dur: 0.26, gain: 0.5 });
    noise(ac, out, t + 0.12, n, { dur: 0.07, gain: 0.15, filter: 'bandpass', freq: 1600, q: 1 });
    brass(ac, out, t + 0.12, 55, 0.05, 0.22);
  },
  /** Non si può: due toni bassi che scendono. */
  error: (ac, out, t) => {
    tone(ac, out, t, { type: 'triangle', freq: 311, dur: 0.08, gain: 0.15, lowpass: 1400 });
    tone(ac, out, t + 0.1, { type: 'triangle', freq: 233, dur: 0.15, gain: 0.15, lowpass: 1400 });
  },
  /** Acquisto: monete. */
  buy: (ac, out, t) => {
    [2093, 2637, 3136].forEach((f, k) => {
      tone(ac, out, t + k * 0.055, { freq: f, dur: 0.13, gain: 0.07 });
      tone(ac, out, t + k * 0.055, { freq: f * 2.76, dur: 0.05, gain: 0.02 });
    });
  },
  /** Costruzione: due colpi di martello. */
  build: (ac, out, t, n) => {
    for (const d of [0, 0.13]) {
      noise(ac, out, t + d, n, { dur: 0.05, gain: 0.14, filter: 'bandpass', freq: 2600, q: 5 });
      tone(ac, out, t + d, { type: 'triangle', freq: 784, to: 700, dur: 0.07, gain: 0.07 });
    }
  },
  /** Imbarco: un colpo sul legno e l'acqua. */
  embark: (ac, out, t, n) => {
    tone(ac, out, t, { freq: 230, to: 170, dur: 0.09, gain: 0.25 });
    noise(ac, out, t + 0.05, n, { dur: 0.35, gain: 0.1, filter: 'lowpass', freq: 1400, to: 380, attack: 0.04 });
  },
  /** Ordine tolto. */
  remove: (ac, out, t) => {
    tone(ac, out, t, { freq: 700, to: 420, dur: 0.07, gain: 0.1 });
  },
  /** Fine turno: due note che salgono. */
  ready: (ac, out, t) => {
    bell(ac, out, t, 72, 0.11, 0.2);
    bell(ac, out, t + 0.09, 79, 0.11, 0.3);
  },
  /** Riprendi il turno: le stesse due note al contrario. */
  unready: (ac, out, t) => {
    bell(ac, out, t, 79, 0.1, 0.18);
    bell(ac, out, t + 0.09, 72, 0.1, 0.25);
  },
  /** Nuovo turno: un accordo di campane. */
  turn: (ac, out, t) => {
    tone(ac, out, t, { freq: hz(48), dur: 0.9, gain: 0.06, attack: 0.02 });
    bell(ac, out, t, 72, 0.075, 1.1);
    bell(ac, out, t + 0.07, 76, 0.065, 1.0);
    bell(ac, out, t + 0.14, 79, 0.065, 1.0);
  },
  /** Mancano 30 secondi. */
  warn: (ac, out, t) => {
    tone(ac, out, t, { freq: 988, dur: 0.07, gain: 0.1 });
    tone(ac, out, t + 0.14, { freq: 988, dur: 0.09, gain: 0.1 });
  },
  /** Ultimi secondi: un legnetto. */
  tick: (ac, out, t, n) => {
    noise(ac, out, t, n, { dur: 0.025, gain: 0.13, filter: 'bandpass', freq: 2200, q: 4 });
    tone(ac, out, t, { freq: 1800, dur: 0.02, gain: 0.035 });
  },
  /** Ci sono state battaglie: cannonate lontane. */
  battle: (ac, out, t, n) => {
    tone(ac, out, t, { freq: 72, to: 38, dur: 0.5, gain: 0.32 });
    noise(ac, out, t, n, { dur: 0.85, gain: 0.3, filter: 'lowpass', freq: 650, to: 140, attack: 0.004 });
    tone(ac, out, t + 0.33, { freq: 66, to: 36, dur: 0.4, gain: 0.18 });
    noise(ac, out, t + 0.33, n, { dur: 0.6, gain: 0.15, filter: 'lowpass', freq: 500, to: 120 });
  },
  /** Città conquistata: breve fanfara. */
  capture: (ac, out, t) => {
    const notes = [67, 72, 76, 79];
    notes.forEach((m, k) => brass(ac, out, t + k * 0.09, m, 0.055, k === notes.length - 1 ? 0.5 : 0.13));
  },
  /** Città persa: tre note che scendono. */
  loss: (ac, out, t) => {
    [64, 60, 55].forEach((m, k) =>
      tone(ac, out, t + k * 0.16, { type: 'triangle', freq: hz(m), dur: k === 2 ? 0.6 : 0.22, gain: 0.14, lowpass: 1300 }),
    );
  },
  /** Messaggio in chat. */
  chat: (ac, out, t) => {
    tone(ac, out, t, { freq: 880, to: 1320, dur: 0.06, gain: 0.08 });
    tone(ac, out, t + 0.05, { freq: 1760, dur: 0.05, gain: 0.05 });
  },
  /** Tocca a te scegliere il paese: din-don. */
  yourPick: (ac, out, t) => {
    bell(ac, out, t, 76, 0.12, 0.5);
    bell(ac, out, t + 0.22, 72, 0.12, 0.7);
  },
  /** Qualcuno entra nella sala d'attesa. */
  join: (ac, out, t) => {
    tone(ac, out, t, { freq: 523, to: 784, dur: 0.08, gain: 0.08 });
  },
  /** Vittoria. */
  victory: (ac, out, t) => {
    [60, 64, 67].forEach((m, k) => brass(ac, out, t + k * 0.12, m, 0.05, 0.14));
    for (const m of [72, 76, 79]) brass(ac, out, t + 0.38, m, 0.04, 1.3);
    bell(ac, out, t + 0.38, 84, 0.04, 1.2);
  },
  /** Sconfitta. */
  defeat: (ac, out, t) => {
    [67, 63, 60, 55].forEach((m, k) =>
      tone(ac, out, t + k * 0.28, { type: 'triangle', freq: hz(m), dur: k === 3 ? 1.1 : 0.32, gain: 0.13, lowpass: 1000, attack: 0.02 }),
    );
  },
  /** Replay: un colpo. */
  hit: (ac, out, t, n) => {
    noise(ac, out, t, n, { dur: 0.05, gain: 0.16, filter: 'bandpass', freq: 1400, q: 1.2 });
    tone(ac, out, t, { freq: 180, to: 115, dur: 0.06, gain: 0.14 });
  },
  /** Replay: colpo critico. */
  crit: (ac, out, t, n) => {
    noise(ac, out, t, n, { dur: 0.08, gain: 0.24, filter: 'bandpass', freq: 2400, q: 1 });
    tone(ac, out, t, { type: 'square', freq: 240, to: 120, dur: 0.1, gain: 0.08, lowpass: 1200 });
    tone(ac, out, t, { freq: 160, to: 70, dur: 0.12, gain: 0.2 });
  },
  /** Replay: un'unità eliminata. */
  kill: (ac, out, t, n) => {
    tone(ac, out, t, { freq: 95, to: 40, dur: 0.3, gain: 0.34 });
    noise(ac, out, t, n, { dur: 0.25, gain: 0.16, filter: 'lowpass', freq: 600, to: 200 });
  },
  /** Dadi che rotolano sul tavolo: colpetti di legno sempre più fitti e più piano, poi fermi. */
  dice: (ac, out, t, n) => {
    const hits = [0, 0.075, 0.14, 0.195, 0.245, 0.29, 0.325, 0.355, 0.38];
    hits.forEach((d, k) => {
      const g = 0.2 * (1 - k / (hits.length + 1));
      noise(ac, out, t + d, n, { dur: 0.022, gain: g, filter: 'bandpass', freq: 2600 + ((k * 733) % 1400), q: 3.5 });
      tone(ac, out, t + d, { type: 'triangle', freq: 900 + ((k * 211) % 500), dur: 0.025, gain: g * 0.35 });
    });
    tone(ac, out, t + 0.4, { freq: 210, to: 150, dur: 0.06, gain: 0.12 });
  },
  /** Colpo di cannone di un carro: lo schiocco, il botto basso e la coda. */
  cannon: (ac, out, t, n) => {
    noise(ac, out, t, n, { dur: 0.03, gain: 0.22, filter: 'bandpass', freq: 2600, q: 0.9 });
    tone(ac, out, t, { freq: 130, to: 42, dur: 0.28, gain: 0.4 });
    noise(ac, out, t + 0.01, n, { dur: 0.42, gain: 0.22, filter: 'lowpass', freq: 1400, to: 160 });
  },
  /** Ingresso della scena: un colpo d'aria che sale. */
  whoosh: (ac, out, t, n) => {
    noise(ac, out, t, n, { dur: 0.32, gain: 0.16, filter: 'bandpass', freq: 380, to: 2600, q: 1.4, attack: 0.16 });
    tone(ac, out, t + 0.3, { freq: 82, to: 46, dur: 0.35, gain: 0.22 });
  },
  /** Il mazzo arriva sul tavolo: carte che strisciano e si posano. */
  deal: (ac, out, t, n) => {
    [0, 0.05, 0.09].forEach((d, k) => {
      noise(ac, out, t + d, n, { dur: 0.09, gain: 0.12 - k * 0.025, filter: 'bandpass', freq: 3200, to: 1800, q: 1.2, attack: 0.02 });
    });
    noise(ac, out, t + 0.13, n, { dur: 0.06, gain: 0.1, filter: 'lowpass', freq: 900, to: 300 });
  },
  /** Una carta che si gira: lo schiocco del cartoncino. */
  flip: (ac, out, t, n) => {
    noise(ac, out, t, n, { dur: 0.05, gain: 0.16, filter: 'bandpass', freq: 2400, to: 5200, q: 1.6, attack: 0.012 });
    noise(ac, out, t + 0.045, n, { dur: 0.025, gain: 0.14, filter: 'highpass', freq: 3800, q: 0.7 });
    tone(ac, out, t + 0.045, { type: 'triangle', freq: 520, to: 380, dur: 0.03, gain: 0.05 });
  },
};

/**
 * Mixaggio: livello di ogni suono, misurato (RMS su 50 ms, pesato come lo sentono orecchio e
 * casse piccole) e portato su tre fasce: tocchi d'interfaccia intorno a -31 dB, azioni intorno
 * a -25 dB, eventi della partita intorno a -22 dB. Così un clic non copre una battaglia e una
 * cannonata non spaventa.
 */
export const MIX: Record<SoundName, number> = {
  select: 1,
  pickup: 1.3,
  waypoint: 1,
  move: 0.49,
  attack: 0.34,
  error: 1,
  buy: 1.5,
  build: 2.8,
  embark: 0.73,
  remove: 1,
  ready: 1,
  unready: 1.1,
  turn: 1.2,
  warn: 1.85,
  tick: 2.2,
  battle: 1,
  capture: 2,
  loss: 1,
  chat: 1.35,
  yourPick: 1,
  join: 1.25,
  victory: 1.4,
  defeat: 1,
  hit: 1,
  crit: 0.65,
  kill: 0.6,
  dice: 1,
  whoosh: 0.9,
  cannon: 0.8,
  deal: 1.2,
  flip: 1.1,
};

/** Suona `name` al tempo `t` dentro `out`, al suo livello di mixaggio. */
export function render(name: SoundName, ac: BaseAudioContext, out: AudioNode, t: number, noise: AudioBuffer): void {
  const level = ac.createGain();
  level.gain.value = MIX[name];
  level.connect(out);
  SOUNDS[name](ac, level, t, noise);
}

// ------------------------------------------------------------------ motore

export interface SoundSettings {
  /** 0–1. */
  volume: number;
  muted: boolean;
}

const KEY = 'onpeace.audio';
const DEFAULTS: SoundSettings = { volume: 0.6, muted: false };

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULTS.volume,
      muted: s.muted === true,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Rumore bianco (due secondi), condiviso da tutti i suoni. */
export function makeNoise(ac: BaseAudioContext): AudioBuffer {
  const buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Catena d'uscita: guadagno generale e un compressore leggero che tiene i livelli uniformi. */
export function makeOutput(ac: BaseAudioContext): { input: GainNode; gain: AudioParam } {
  const input = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  input.connect(comp).connect(ac.destination);
  return { input, gain: input.gain };
}

/** Il volume si sente in modo più naturale con una curva al quadrato. */
const gainFor = (s: SoundSettings) => (s.muted ? 0 : s.volume * s.volume);

/** Stesso suono troppo ravvicinato: si sente una volta sola. */
const MIN_GAP = 0.06;

class Sfx {
  private ac: AudioContext | null = null;
  private out: { input: GainNode; gain: AudioParam } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  private listeners = new Set<() => void>();
  settings: SoundSettings = loadSettings();

  /** Al primo gesto dell'utente: crea (o fa ripartire) il contesto audio. */
  unlock(): void {
    try {
      if (!this.ac) {
        this.ac = new AudioContext();
        this.out = makeOutput(this.ac);
        this.out.gain.value = gainFor(this.settings);
        this.noiseBuffer = makeNoise(this.ac);
      }
      if (this.ac.state === 'suspended') void this.ac.resume();
    } catch {
      // niente audio in questo browser: il gioco funziona lo stesso
    }
  }

  /** Suona `name` tra `delay` secondi (se l'audio è attivo), a volume `gain` (1 = il suo livello). */
  play(name: SoundName, delay = 0, gain = 1): void {
    const ac = this.ac;
    if (!ac || !this.out || !this.noiseBuffer || ac.state !== 'running' || gainFor(this.settings) === 0) return;
    const t = ac.currentTime + 0.005 + delay;
    const prev = this.last.get(name) ?? -1;
    if (t - prev < MIN_GAP) return;
    this.last.set(name, t);
    try {
      if (gain === 1) render(name, ac, this.out.input, t, this.noiseBuffer);
      else {
        const g = ac.createGain();
        g.gain.value = gain;
        g.connect(this.out.input);
        render(name, ac, g, t, this.noiseBuffer);
      }
    } catch {
      // un suono che non parte non deve mai fermare il gioco
    }
  }

  set(patch: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // archiviazione non disponibile: vale per questa sessione
    }
    if (this.ac && this.out) this.out.gain.setTargetAtTime(gainFor(this.settings), this.ac.currentTime, 0.02);
    for (const l of this.listeners) l();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSettings = (): SoundSettings => this.settings;
}

export const sfx = new Sfx();
