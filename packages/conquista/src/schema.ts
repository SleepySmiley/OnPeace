/**
 * Formato dei dati del gioco di conquista: regole (data/conquista/regole.json) e obiettivi
 * segreti di ogni tabellone (data/conquista/obiettivi/<tabellone>.json). Tutti i numeri delle
 * regole stanno qui, non nel codice.
 */
import { z } from 'zod';

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/);
const Int = z.number().int();

export const CardSymbol = z.enum(['infantry', 'cavalry', 'artillery']);
export type CardSymbol = z.infer<typeof CardSymbol>;

export const GameMode = z.enum(['objectives', 'conquest']);
export type GameMode = z.infer<typeof GameMode>;

export const ConquestRules = z.strictObject({
  $schema: z.string().optional(),
  players: z.strictObject({
    min: Int.min(2),
    max: Int.min(2).max(8),
    /** Giocatori minimi con gli obiettivi segreti: in pochi si parte con l'obiettivo quasi fatto. */
    objectivesMin: Int.min(2),
  }),
  /** Armate iniziali per numero di giocatori ("3": 38). */
  initialArmies: z.record(z.string().regex(/^\d$/), Int.positive()),
  setup: z.strictObject({
    /** Prima di tutto ognuno legge il suo obiettivo: si comincia quando hanno chiuso tutti (o scade il tempo). */
    briefing: z.boolean(),
    /**
     * Come si dividono i territori: scelti a turno uno alla volta in ordine di gioco (ognuno ci
     * mette un'armata delle sue), o distribuiti a caso a giro.
     */
    distribution: z.enum(['draft', 'random']),
    /** Armate rimaste dopo i territori: a giri come al tavolo (in ordine di gioco, poche per volta) o tutti insieme. */
    placement: z.enum(['rounds', 'simultaneous']),
    /** Armate per giro (solo a giri). */
    perRound: Int.min(1),
  }),
  reinforcements: z.strictObject({
    /** Un'armata ogni `divisor` territori... */
    divisor: Int.positive(),
    /** ...ma mai meno di `minimum`. */
    minimum: Int.min(0),
  }),
  dice: z.strictObject({
    attackMax: Int.min(1).max(5),
    defenseMax: Int.min(1).max(5),
    /** Chi vince quando i dadi sono pari. */
    tiesTo: z.enum(['defender', 'attacker']),
  }),
  fortify: z.strictObject({
    /** Spostamenti a fine turno (0 = nessuno). */
    moves: Int.min(0),
    /** Solo tra territori confinanti, o anche lungo una catena di territori propri. */
    reach: z.enum(['adjacent', 'connected']),
  }),
  cards: z.strictObject({
    jokers: Int.min(0),
    sets: z.strictObject({
      threeOfAKind: z.strictObject({ infantry: Int.min(0), cavalry: Int.min(0), artillery: Int.min(0) }),
      oneOfEach: Int.min(0),
      jokerPlusPair: Int.min(0),
    }),
    /** Armate in più per ogni carta del tris che mostra un territorio tuo. */
    ownedTerritoryBonus: Int.min(0),
    /** Chi elimina un giocatore ne prende le carte. */
    inheritOnElimination: z.boolean(),
  }),
  elimination: z.strictObject({
    /** Nessuno può essere eliminato prima della fine di questo giro (regola Prestige: 4; 0 = mai protetti). */
    protectedRounds: Int.min(0),
  }),
  timers: z.strictObject({
    turnSeconds: Int.min(10),
    /** Tempo per ogni giro di piazzamento (a giri) o per tutto il piazzamento (tutti insieme). */
    setupSeconds: Int.min(10),
    /** Tempo per leggere l'obiettivo all'inizio. */
    briefingSeconds: Int.min(5),
    /** Tempo per ogni territorio scelto a turno (scaduto, sceglie il server). */
    pickSeconds: Int.min(5),
  }),
  modes: z.array(GameMode).min(1),
});
export type ConquestRules = z.infer<typeof ConquestRules>;

export const ObjectiveDef = z.discriminatedUnion('kind', [
  z.strictObject({
    id: Id,
    kind: z.literal('territories'),
    count: Int.positive(),
    /** Se presente, contano solo i territori con almeno tante armate. */
    minArmies: Int.min(1).optional(),
    text: z.string().min(1),
  }),
  z.strictObject({
    id: Id,
    kind: z.literal('continents'),
    continents: z.array(Id).min(1),
    /** Continenti in più a scelta del giocatore, oltre a quelli elencati. */
    plusAny: Int.min(0).optional(),
    text: z.string().min(1),
  }),
  z.strictObject({
    id: Id,
    kind: z.literal('eliminate'),
    /** Obiettivo che prende il posto di questo se il bersaglio lo elimina qualcun altro. */
    fallback: Id,
    /** Testo con {giocatore} al posto del nome del bersaglio. */
    text: z.string().min(1),
  }),
]);
export type ObjectiveDef = z.infer<typeof ObjectiveDef>;

export const ObjectivesFile = z.strictObject({
  $schema: z.string().optional(),
  board: Id,
  objectives: z.array(ObjectiveDef).min(1),
});
export type ObjectivesFile = z.infer<typeof ObjectivesFile>;
