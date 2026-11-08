/**
 * Messaggi tra browser e server (JSON su WebSocket).
 * I messaggi del client sono validati con zod dal server: non ci si fida mai del client.
 */
import { z } from 'zod';
import type { Action, GameSettings, GameState, PlayerId, TurnEvent } from '@onpeace/engine';

/** Colori dei giocatori (client e server usano la stessa tavolozza). */
export const PLAYER_COLORS = ['#e05a4f', '#3f86e0', '#e6a632', '#3fae6e', '#a066d6', '#22b3b3', '#e0679f', '#8fa3b3'];

const Id = z.string().min(1).max(64);
const Point = z.tuple([z.number(), z.number()]);
const UnitSelection = z.array(z.object({ type: Id, count: z.number().int().min(1).max(1000) })).max(40);
const StackRef = z.union([z.object({ stack: Id }), z.object({ city: Id }), z.object({ at: Point })]);

export const ActionS = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('buy'),
    order: z.object({ city: Id, units: UnitSelection, buildings: z.array(Id).max(10) }),
  }),
  z.object({
    kind: z.literal('move'),
    from: StackRef,
    units: UnitSelection.min(1),
    path: z.array(Point).min(1).max(20),
    target: Id.optional(),
  }),
  z.object({ kind: z.literal('load'), from: StackRef, units: UnitSelection.min(1) }),
  z.object({ kind: z.literal('unload'), from: StackRef, units: UnitSelection.min(1), to: Point }),
  z.object({ kind: z.literal('diplomacy'), to: Id, proposal: z.enum(['peace', 'alliance', 'war']) }),
  z.object({ kind: z.literal('respond'), proposal: Id, accept: z.boolean() }),
  z.object({ kind: z.literal('send_money'), to: Id, amount: z.number().int().min(1).max(10_000_000) }),
  z.object({ kind: z.literal('give_city'), city: Id, to: Id }),
]);

export const PlanS = z.array(ActionS).max(400);

/** Opzioni che l'host può scegliere nella sala d'attesa. */
export const SettingsS = z
  .object({
    turnSeconds: z.number().int().min(30).max(720),
    startingFunds: z.number().int().min(0).max(1_000_000),
    maxTurns: z.number().int().min(5).max(500),
    initialCountries: z.number().int().min(1).max(5),
    victory: z.enum(['annihilation', 'homeland', 'turns']),
    maxAlliances: z.number().int().min(0).max(10),
  })
  .partial();
export type LobbySettings = z.infer<typeof SettingsS>;

const Name = z.string().trim().min(1).max(18);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ClientMsgS = z.discriminatedUnion('t', [
  /** Primo messaggio: con il token si rientra nella propria partita. */
  z.object({ t: z.literal('hello'), token: z.string().max(100).optional() }),
  z.object({ t: z.literal('create'), name: Name, color: Color, settings: SettingsS }),
  z.object({ t: z.literal('join'), game: Id, name: Name, color: Color.optional() }),
  z.object({ t: z.literal('color'), color: Color }),
  z.object({ t: z.literal('settings'), settings: SettingsS }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('pick'), country: Id }),
  z.object({ t: z.literal('plan'), actions: PlanS }),
  z.object({ t: z.literal('ready'), done: z.boolean() }),
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(300) }),
  z.object({ t: z.literal('kick'), player: Id }),
  z.object({ t: z.literal('leave') }),
]);
export type ClientMsg = z.infer<typeof ClientMsgS>;

export type RoomPhase = 'lobby' | 'selection' | 'playing' | 'ended';

export interface LobbyPlayer {
  id: PlayerId;
  name: string;
  color: string;
  connected: boolean;
  /** Turni consecutivi senza ordini né "fine turno". */
  inactiveTurns: number;
}

export interface LobbyInfo {
  id: string;
  hostId: PlayerId;
  phase: RoomPhase;
  mapName: string;
  players: LobbyPlayer[];
  settings: Partial<GameSettings>;
}

export interface ChatLine {
  from: PlayerId;
  name: string;
  color: string;
  text: string;
  at: number;
}

export type ServerMsg =
  | { t: 'welcome'; token: string; game: string; you: PlayerId }
  | { t: 'lobby'; lobby: LobbyInfo }
  | {
      t: 'game';
      /** Lo stato come lo vede questo giocatore (nebbia di guerra applicata). */
      view: GameState;
      /** Il piano già inviato per questo turno (per riprendere dopo una disconnessione). */
      plan: Action[];
      /** Eventi dell'ultimo turno risolto che il giocatore può conoscere. */
      events: TurnEvent[];
      eventsTurn: number;
    }
  | {
      t: 'status';
      /** Scadenza del turno o della scelta in corso (ms epoch), o null. */
      deadline: number | null;
      /** Chi non ha ancora finito il turno. */
      waiting: PlayerId[];
      /** Durante la scelta: chi deve scegliere ora. */
      picker: PlayerId | null;
      /** Ora del server, per correggere l'orologio del client. */
      now: number;
    }
  | { t: 'chat'; lines: ChatLine[] }
  | { t: 'error'; message: string }
  | { t: 'kicked'; reason: string };

export function parseClientMsg(raw: string): ClientMsg | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: 'Messaggio non valido' };
  }
  const r = ClientMsgS.safeParse(data);
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Messaggio non valido' };
  return r.data;
}

/** Le azioni validate da zod hanno la stessa forma di quelle del motore. */
export const asActions = (plan: z.infer<typeof PlanS>): Action[] => plan as Action[];

/** Il piano del motore nel formato del messaggio (differiscono solo per i readonly). */
export const toWirePlan = (actions: readonly Action[]) => actions as unknown as z.infer<typeof PlanS>;
