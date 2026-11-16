/**
 * Spiegazioni delle opzioni della sala d'attesa: per ogni scelta una frase breve e una scenetta
 * fatta con i pezzi del gioco (territori nei colori dei giocatori, dadi, carta dell'obiettivo).
 * La scenetta va per fotogrammi (un fotogramma ogni tanto, le transizioni CSS fanno il resto) e
 * si ferma sull'ultimo, quello che spiega: così chi chiede meno movimento vede subito il risultato.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { PLAYER_COLORS, type LobbySettings, type RoomSettings } from '@onpeace/protocol';
import type { ConquestRules } from '@onpeace/conquista';
import { styleColor, useLook } from '../look';
import { Die } from '../play/bits';
import './explain.css';

export type OptionKey = 'mode' | 'distribution' | 'placement' | 'turnSeconds' | 'combat' | 'ties' | 'defenseDice';

export interface Choice {
  value: string | number;
  /** Nome corto, come nel menu. */
  name: string;
  /** Che cosa vuol dire, in una frase. */
  line: string;
}

export interface OptionDef {
  key: OptionKey;
  label: string;
  choices: Choice[];
}

const TURN_OPTIONS = [60, 90, 120, 180, 300, 480];
export const minutes = (s: number) => (s < 120 ? `${s} secondi` : `${s / 60} minuti`);
const short = (s: number) => (s < 120 ? `${s} s` : `${s / 60} min`);

/** Le opzioni della sala con le loro scelte, nell'ordine in cui si vedono (quelle a coppie solo a coppie). */
export function optionDefs(rules: ConquestRules, settings: RoomSettings): OptionDef[] {
  const out: OptionDef[] = [
    {
      key: 'mode',
      label: 'Come si vince',
      choices: [
        { value: 'objectives', name: 'Obiettivi segreti', line: 'Ognuno riceve un obiettivo segreto: vince chi lo completa per primo.' },
        { value: 'conquest', name: 'Conquista del mondo', line: 'Vince chi prende tutti i territori.' },
      ].filter((c) => rules.modes.includes(c.value as 'objectives' | 'conquest')),
    },
    {
      key: 'distribution',
      label: 'Territori',
      choices: [
        { value: 'draft', name: 'Scelti a turno', line: 'A turno ognuno prende un territorio libero, finché non sono finiti.' },
        { value: 'random', name: 'Distribuiti a caso', line: 'Il gioco li distribuisce a caso, uno a testa a giro: si parte subito.' },
      ],
    },
    {
      key: 'placement',
      label: 'Piazzamento iniziale',
      choices: [
        {
          value: 'rounds',
          name: `A giri, ${rules.setup.perRound} armate`,
          line: `Si piazza a turno, ${rules.setup.perRound} armate alla volta: vedi dove le mettono gli altri.`,
        },
        { value: 'simultaneous', name: 'Tutti insieme', line: 'Tutti piazzano insieme, alla cieca: le armate si scoprono quando hanno finito tutti.' },
      ],
    },
    {
      key: 'turnSeconds',
      label: 'Tempo per turno',
      choices: [...new Set([...TURN_OPTIONS, settings.turnSeconds])]
        .sort((a, b) => a - b)
        .map((s) => ({
          value: s,
          name: short(s),
          line: `Ognuno ha ${minutes(s)} per il suo turno; ogni tiro di dadi ridà ${rules.timers.battleSeconds} secondi.`,
        })),
    },
    {
      key: 'combat',
      label: 'Combattimento',
      choices: [
        { value: 'pairs', name: 'A coppie', line: `Fino a ${rules.dice.attackMax} dadi: il più alto contro il più alto, chi perde la coppia perde un'armata.` },
        { value: 'hits', name: 'A colpi', line: "Chi attacca e chi difende tirano insieme, un dado per armata: ogni scoppio toglie un'armata all'altro." },
        { value: 'alternate', name: 'A colpi, a turno', line: "Si tira uno alla volta, prima chi difende: ogni scoppio toglie subito un'armata all'altro, fino in fondo." },
      ],
    },
  ];
  if (settings.combat === 'pairs') {
    out.push(
      {
        key: 'ties',
        label: 'Dadi pari',
        choices: [
          { value: 'defender', name: 'Vince chi difende', line: 'Due dadi uguali: la coppia va a chi difende.' },
          { value: 'attacker', name: 'Vince chi attacca', line: 'Due dadi uguali: la coppia va a chi attacca.' },
          { value: 'reroll-pair', name: 'Si ritira la coppia', line: 'Due dadi uguali si ritirano, finché non sono diversi.' },
          { value: 'reroll-all', name: 'Si ritira tutto', line: "Se c'è un pari, si ritira tutto il lancio." },
        ],
      },
      {
        key: 'defenseDice',
        label: 'Dadi in difesa',
        choices: [
          { value: 3, name: 'Fino a 3', line: 'Chi difende tira un dado per armata, fino a 3.' },
          { value: 2, name: 'Fino a 2', line: 'Chi difende tira al massimo 2 dadi: attaccare diventa più facile.' },
        ],
      },
    );
  }
  return out.filter((o) => o.choices.length > 0);
}

/** La scelta in vigore di un'opzione. */
export const currentOf = (o: OptionDef, settings: RoomSettings) => o.choices.find((c) => c.value === settings[o.key]) ?? o.choices[0]!;

/** Il cambio da mandare al server per una scelta. */
export const patchFor = (key: OptionKey, value: string | number): LobbySettings => ({ [key]: value }) as LobbySettings;

// ---------------------------------------------------------------- fotogrammi

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Fotogramma della scenetta: da 0 a `count - 1`, uno ogni `ms`, poi l'ultimo resta per `hold`
 * giri e si ricomincia; con `once` fa un giro solo. Ferma (o con meno movimento) resta su `rest`,
 * il fotogramma che spiega di più.
 */
function useFrame(count: number, ms: number, playing: boolean, once: boolean, rest = count - 1, hold = 3): number {
  const [f, setF] = useState(rest);
  useEffect(() => {
    if (!playing || reducedMotion()) {
      setF(rest);
      return;
    }
    let k = 0;
    setF(0);
    const id = setInterval(() => {
      k++;
      if (once && k >= count + hold) {
        clearInterval(id);
        setF(rest);
        return;
      }
      setF(k % (count + hold));
    }, ms);
    return () => clearInterval(id);
  }, [playing, once, count, ms, rest, hold]);
  return Math.min(f, count - 1);
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function Tile({ c, n, cls = '', children }: { c: string | null; n?: number | string | null; cls?: string; children?: ReactNode }) {
  return (
    // il colore va anche diretto: con solo var(--c) la transizione a volte resta sul colore di prima
    <span className={`vg-tile${c ? '' : ' free'} ${cls}`} style={c ? ({ '--c': c, backgroundColor: c } as Vars) : undefined}>
      {n !== undefined && n !== null && <b className="vg-n num">{n}</b>}
      {children}
    </span>
  );
}

function D({
  v,
  side,
  rolling,
  state,
  hitOn,
}: {
  v: number;
  side: 'attack' | 'defense';
  rolling?: boolean;
  state?: 'win' | 'lose' | 'hit' | 'miss' | 'tie' | null;
  /** Dado a colpi: colpo da questa faccia in su, sennò a vuoto. */
  hitOn?: number;
}) {
  return (
    <span className={`vg-die${rolling ? ' rolling' : ''}${state ? ` ${state}` : ''}`}>
      <Die value={v} side={side} size={24} hitOn={hitOn} />
    </span>
  );
}

// ---------------------------------------------------------------- le scenette

interface ArtProps {
  f: number;
  p: [string, string, string];
  rules: ConquestRules;
  settings: RoomSettings;
  value: string | number;
}

function Objectives({ f }: ArtProps) {
  return (
    <div className="vg-row">
      <span className={`vg-card${f >= 1 ? ' open' : ''}`}>
        <span className="vg-card-back" />
        <span className="vg-card-front">
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.6" className="dot" />
          </svg>
        </span>
      </span>
      <span className="vg-map">
        {[0, 1, 2, 3].map((i) => (
          <Tile key={i} c={null} cls={f >= 2 && (i === 0 || i === 3) ? 'goal' : ''} />
        ))}
      </span>
    </div>
  );
}

function Conquest({ f, p }: ArtProps) {
  const start = [p[1], p[0], p[2], p[1], p[2], p[1]];
  const order = [2, 0, 5, 3, 4, 1];
  return (
    <div className="vg-grid">
      {start.map((c, i) => (
        <Tile key={i} c={order.indexOf(i) < f ? p[0] : c} cls={order.indexOf(i) === f - 1 ? 'pop' : ''} />
      ))}
    </div>
  );
}

function Draft({ f, p }: ArtProps) {
  // a turno: il primo, il secondo, il terzo giocatore, e di nuovo
  const order = [4, 0, 2, 5, 1, 3];
  return (
    <div className="vg-grid">
      {Array.from({ length: 6 }, (_, i) => {
        const k = order.indexOf(i);
        return <Tile key={i} c={k < f ? p[k % 3]! : null} cls={k === f - 1 ? 'pop' : ''} />;
      })}
    </div>
  );
}

function Random({ f, p }: ArtProps) {
  const dealt = [p[1], p[0], p[2], p[2], p[1], p[0]];
  return (
    <div className="vg-grid">
      {dealt.map((c, i) => (
        <Tile key={i} c={f >= 1 ? c : null} cls={f === 1 ? 'pop' : ''} />
      ))}
    </div>
  );
}

function Rounds({ f, p, rules }: ArtProps) {
  const k = rules.setup.perRound;
  const a = 1 + Math.ceil(f / 2) * k;
  const b = 1 + Math.floor(f / 2) * k;
  const who = f === 0 ? null : f % 2 === 1 ? 0 : 1;
  return (
    <div className="vg-row">
      <Tile c={p[0]} n={a} cls={who === 0 ? 'pop' : ''}>
        {who === 0 && <i className="vg-plus num" key={f}>+{k}</i>}
      </Tile>
      <Tile c={p[1]} n={b} cls={who === 1 ? 'pop' : ''}>
        {who === 1 && <i className="vg-plus num" key={f}>+{k}</i>}
      </Tile>
    </div>
  );
}

function Simultaneous({ f, p }: ArtProps) {
  // 0: prima; 1: tutti piazzano coperti; 2: si scopre tutto insieme
  return (
    <div className="vg-row">
      {[p[0], p[1]].map((c, i) => (
        <Tile key={i} c={c} n={f === 0 ? 1 : f === 1 ? '?' : i === 0 ? 7 : 5} cls={f === 1 ? 'covered' : f === 2 ? 'pop' : ''} />
      ))}
    </div>
  );
}

function Clock({ f, rules, value }: ArtProps) {
  // il tempo scende; al quarto fotogramma un tiro di dadi ne ridà un po'
  const left = [1, 0.84, 0.68, 0.52, 0.64, 0.48, 0.32][f]!;
  return (
    <div className="vg-row">
      <span className="vg-clock" style={{ '--left': left } as Vars}>
        <b className="num">{short(Number(value))}</b>
      </span>
      <span className={`vg-bonus${f === 4 ? ' on' : ''}`}>
        <D v={5} side="attack" rolling={f === 3} />
        <i className="num">+{rules.timers.battleSeconds} s</i>
      </span>
    </div>
  );
}

/** A coppie: ogni coppia in colonna, chi attacca sopra e chi difende sotto; la freccia va verso chi perde. */
function Pairs({ f, settings, value }: ArtProps & { ties?: string }) {
  const nD = Number(settings.defenseDice);
  const attack = [6, 4, 2];
  const defense = [5, 4, 1].slice(0, nD);
  const ties = typeof value === 'string' && value !== 'pairs' && value !== 'hits' ? value : settings.ties;
  const rolling = f === 0;
  return (
    <div className="vg-pairs">
      {attack.map((a, i) => {
        const d = defense[i];
        const shown = f >= 2;
        const aWins = d === undefined ? null : a > d || (a === d && ties === 'attacker');
        return (
          <span key={i} className="vg-pair">
            <D v={a} side="attack" rolling={rolling} state={shown && aWins !== null ? (aWins ? 'win' : 'lose') : null} />
            {d !== undefined ? (
              <>
                <i className={`vg-vs${shown ? ' on' : ''}`}>{shown ? (aWins ? '↓' : '↑') : ''}</i>
                <D v={d} side="defense" rolling={rolling} state={shown ? (aWins ? 'lose' : 'win') : null} />
              </>
            ) : (
              <i className="vg-vs" />
            )}
          </span>
        );
      })}
    </div>
  );
}

function Hits({ f, rules }: ArtProps) {
  const attack = [6, 5, 3, 2];
  const defense = [4, 4, 1];
  const on = rules.dice.hits.attackOn;
  const rolling = f === 0;
  const state = (v: number) => (f >= 2 ? (v >= on ? 'hit' : 'miss') : null);
  const count = (d: number[]) => d.filter((v) => v >= on).length;
  return (
    <div className="vg-hits">
      <span className="vg-line">
        {attack.map((v, i) => (
          <D key={i} v={v} side="attack" rolling={rolling} state={state(v)} hitOn={on} />
        ))}
        <i className={`vg-count${f >= 2 ? ' on' : ''} num`}>{count(attack)} colpi</i>
      </span>
      <span className="vg-line">
        {defense.map((v, i) => (
          <D key={i} v={v} side="defense" rolling={rolling} state={state(v)} hitOn={on} />
        ))}
        <i className={`vg-count${f >= 2 ? ' on' : ''} num`}>{count(defense)} colpi</i>
      </span>
    </div>
  );
}

/**
 * A turno, una battaglia intera: tira chi difende (un colpo), poi chi attacca con chi resta (due
 * colpi), poi di nuovo chi difende (a vuoto) e chi attacca prende il territorio.
 */
const VOLLEYS: { by: 'defense' | 'attack'; dice: number[] }[] = [
  { by: 'defense', dice: [5, 2, 1] },
  { by: 'attack', dice: [6, 4, 1] },
  { by: 'defense', dice: [3] },
  { by: 'attack', dice: [4, 2, 1] },
];

function Alternate({ f, p, rules }: ArtProps) {
  const on = rules.dice.hits.attackOn;
  // fotogrammi: per ogni tiro, prima rotola (2k) e poi colpisce (2k+1); l'ultimo è la conquista
  const k = Math.min(Math.floor(f / 2), VOLLEYS.length - 1);
  const landed = f % 2 === 1 || f >= VOLLEYS.length * 2;
  let a = 4;
  let d = 3;
  for (let i = 0; i < VOLLEYS.length; i++) {
    if (i > k || (i === k && !landed)) break;
    const h = VOLLEYS[i]!.dice.filter((v) => v >= on).length;
    if (VOLLEYS[i]!.by === 'defense') a -= Math.min(h, a);
    else d -= Math.min(h, d);
  }
  const v = VOLLEYS[k]!;
  const taken = f >= VOLLEYS.length * 2;
  return (
    <div className="vg-alt">
      <Tile c={p[0]} n={a} cls={v.by === 'attack' && !taken ? 'turn' : ''} />
      <span className="vg-line mid">
        {!taken &&
          v.dice.map((x, i) => <D key={`${k}-${i}`} v={x} side={v.by} rolling={!landed} state={landed ? (x >= on ? 'hit' : 'miss') : null} hitOn={on} />)}
        {taken && <i className="vg-taken">preso</i>}
      </span>
      <Tile c={taken ? p[0] : p[1]} n={taken ? null : d} cls={taken ? 'pop' : v.by === 'defense' ? 'turn' : ''} />
    </div>
  );
}

function Ties({ f, value }: ArtProps) {
  // un pari nella seconda coppia; come finisce dipende dalla regola
  const reroll = value === 'reroll-pair' || value === 'reroll-all';
  const first = { a: [6, 4], d: [5, 4] };
  const again = value === 'reroll-pair' ? { a: [6, 5], d: [5, 2] } : { a: [5, 3], d: [6, 2] };
  const cur = reroll && f >= 3 ? again : first;
  const rolling = f === 0 || (reroll && f === 2);
  const rolls = (i: number) => rolling && (f === 0 || value === 'reroll-all' || i === 1);
  const decided = reroll ? f >= 3 : f >= 2;
  return (
    <div className="vg-pairs">
      {[0, 1].map((i) => {
        const a = cur.a[i]!;
        const d = cur.d[i]!;
        const tie = a === d;
        const aWins = a > d || (tie && value === 'attacker');
        const st = (side: 'a' | 'd') => (decided ? ((side === 'a') === aWins ? 'win' : 'lose') : f >= 1 && tie ? 'tie' : null);
        return (
          <span key={i} className="vg-pair">
            <D v={a} side="attack" rolling={rolls(i)} state={st('a')} />
            <i className={`vg-vs${decided || (f >= 1 && tie) ? ' on' : ''}`}>{decided ? (aWins ? '↓' : '↑') : f >= 1 && tie ? '=' : ''}</i>
            <D v={d} side="defense" rolling={rolls(i)} state={st('d')} />
          </span>
        );
      })}
    </div>
  );
}

function DefenseDice({ f, value }: ArtProps) {
  const n = Number(value);
  return (
    <div className="vg-hits">
      <span className="vg-line">
        {[6, 4, 2].map((v, i) => (
          <D key={i} v={v} side="attack" rolling={f === 0} />
        ))}
      </span>
      <span className="vg-line">
        {[5, 3, 1].slice(0, n).map((v, i) => (
          <D key={i} v={v} side="defense" rolling={f === 0} />
        ))}
        {n < 3 && <span className="vg-die ghost" />}
      </span>
    </div>
  );
}

/**
 * Quanti fotogrammi ha ogni scenetta, quanto dura ognuno e quale si vede da ferma (se non è l'ultimo):
 * scelti a turno a metà scelta (sennò sembrerebbe a caso), a giri il primo giro, alla cieca le armate
 * coperte, il tempo quando un tiro ne ridà, a turno il primo tiro di chi difende.
 */
function framesOf(key: OptionKey, value: string | number): { count: number; ms: number; rest?: number; Art: (p: ArtProps) => ReactNode } {
  switch (key) {
    case 'mode':
      return value === 'objectives' ? { count: 3, ms: 800, Art: Objectives } : { count: 7, ms: 420, Art: Conquest };
    case 'distribution':
      return value === 'draft' ? { count: 7, ms: 420, rest: 4, Art: Draft } : { count: 3, ms: 700, Art: Random };
    case 'placement':
      return value === 'rounds' ? { count: 5, ms: 650, rest: 1, Art: Rounds } : { count: 3, ms: 900, rest: 1, Art: Simultaneous };
    case 'turnSeconds':
      return { count: 7, ms: 600, rest: 4, Art: Clock };
    case 'combat':
      return value === 'pairs'
        ? { count: 3, ms: 800, Art: Pairs }
        : value === 'hits'
          ? { count: 3, ms: 800, Art: Hits }
          : { count: VOLLEYS.length * 2 + 1, ms: 700, rest: 1, Art: Alternate };
    case 'ties':
      return value === 'reroll-pair' || value === 'reroll-all' ? { count: 4, ms: 750, Art: Ties } : { count: 3, ms: 800, Art: Ties };
    case 'defenseDice':
      return { count: 2, ms: 900, Art: DefenseDice };
  }
}

/**
 * La scenetta di una scelta. `playing`: si muove, di continuo o per un giro solo (`once`: si muove da
 * sola, e un movimento che parte da solo non deve durare); ferma resta sul fotogramma che spiega.
 */
export function Vignette({
  option,
  value,
  rules,
  settings,
  playing,
  once = false,
  scale = 1,
}: {
  option: OptionKey;
  value: string | number;
  rules: ConquestRules;
  settings: RoomSettings;
  playing: boolean;
  once?: boolean;
  scale?: number;
}) {
  const style = useLook((s) => s.style);
  const { count, ms, rest, Art } = framesOf(option, value);
  const f = useFrame(count, ms, playing, once, rest);
  const p = [styleColor(style, PLAYER_COLORS[0]!), styleColor(style, PLAYER_COLORS[1]!), styleColor(style, PLAYER_COLORS[2]!)] as [string, string, string];
  return (
    <span className={`vg vg-${option}`} style={{ '--u': `${scale}` } as Vars} aria-hidden>
      <Art f={f} p={p} rules={rules} settings={settings} value={value} />
    </span>
  );
}
