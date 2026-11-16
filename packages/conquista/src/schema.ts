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

/**
 * Che cosa succede quando due dadi confrontati sono pari: vince chi difende (come al tavolo), vince
 * chi attacca, si ritirano solo quei due dadi, o si ritira tutto il lancio. Ritirando si rifà finché
 * il pari non c'è più.
 */
export const TieRule = z.enum(['defender', 'attacker', 'reroll-pair', 'reroll-all']);
export type TieRule = z.infer<typeof TieRule>;

/**
 * Come si combatte. A coppie: fino a 3 dadi per parte, confrontati dal più alto, chi perde la
 * coppia perde un'armata. A colpi: un dado per armata (fino a `hits.max`), ogni dado alto è un
 * colpo e ogni colpo toglie un'armata all'altro, da tutte e due le parti insieme. A colpi, a turno
 * (`alternate`): si tira uno alla volta, prima chi difende, con gli stessi dadi e colpi; ogni parte
 * tira con le armate che le restano, e la battaglia va fino in fondo (vedi fightAlternate).
 */
export const CombatRule = z.enum(['pairs', 'hits', 'alternate']);
export type CombatRule = z.infer<typeof CombatRule>;

/** Dadi massimi per tiro che le regole possono chiedere (a colpi e a turno, `hits.max`). */
export const MAX_DICE = 20;

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
    /** Come si combatte: a coppie (dadi confrontati dal più alto) o a colpi (vedi CombatRule). */
    combat: CombatRule,
    /** A coppie: dadi massimi di chi attacca e di chi difende. */
    attackMax: Int.min(1).max(5),
    defenseMax: Int.min(1).max(5),
    /** A coppie: dadi pari, chi vince o si ritirano (vedi TieRule). */
    tiesTo: TieRule,
    hits: z.strictObject({
      /**
       * A colpi: dadi massimi per parte (chi attacca ne tira al massimo uno in meno delle armate).
       * A turno: dadi massimi di ogni tiro, chi attacca o difende con più armate ne tira solo tanti.
       */
      max: Int.min(1).max(MAX_DICE),
      /** Un dado di chi attacca colpisce da questo numero in su (4: con 4, 5 o 6). */
      attackOn: Int.min(1).max(6),
      /** Lo stesso per chi difende. */
      defenseOn: Int.min(1).max(6),
    }),
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
    /** Secondi restituiti a chi attacca per ogni tiro di dadi: il tempo per guardare la battaglia. */
    battleSeconds: Int.min(0),
    /** Al massimo tanti secondi restituiti in un turno. */
    battleMaxSeconds: Int.min(0),
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
