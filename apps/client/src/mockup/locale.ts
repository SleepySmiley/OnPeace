/**
 * Un server finto per le pagine di prova: la partita vera (il motore di conquista) gira nel
 * browser contro quattro avversari automatici, e risponde ai messaggi del client come il server
 * vero. Niente WebSocket, niente salvataggi: serve a provare l'interfaccia giocando.
 */
import boardJson from '@data/territori/mondo.json';
import rulesJson from '@data/conquista/regole.json';
import objectivesJson from '@data/conquista/obiettivi/mondo.json';
import { BoardDef } from '@onpeace/engine';
import {
  applyAction,
  createContext,
  createGame,
  eliminationAllowed,
  eventsFor,
  ownedBy,
  passFor,
  playersToAct,
  viewFor,
  type Action,
  type ActionResult,
  type GameContext,
  type GameState,
} from '@onpeace/conquista';
import { PLAYER_COLORS, type ChatLine, type ClientMsg, type LobbyInfo, type LoggedEvent, type RoomSettings, type ServerMsg } from '@onpeace/protocol';
import { buildGeometry } from '../board/geometry';
import type { Link, LinkFactory, LoadedBoard } from '../store';

const def = BoardDef.parse(boardJson);
/** Il tabellone già pronto: la pagina lo mette nella sessione, così il client non lo scarica dal server. */
export const localBoard: LoadedBoard = { id: def.id, hash: 'prova', def, geo: buildGeometry(def) };

export const ME = 'tu';
const PLAYERS = [
  { id: ME, name: 'Andrea', color: PLAYER_COLORS[0]! },
  { id: 'marco', name: 'Marco', color: PLAYER_COLORS[1]! },
  { id: 'giulia', name: 'Giulia', color: PLAYER_COLORS[2]! },
  { id: 'luca', name: 'Luca', color: PLAYER_COLORS[3]! },
  { id: 'sara', name: 'Sara', color: PLAYER_COLORS[4]! },
];

/** Da dove parte la prova: dall'inizio vero (obiettivo, scelta a turno, piazzamento) o dal primo turno. */
export type Start = 'inizio' | 'turno';

/** Pause tra le mosse degli avversari (ms): abbastanza per vederle, non tanto da annoiare. */
const BOT_MS = { pick: 260, place: 260, turn: 650, attack: 520 };
const BOT_ATTACKS = 2;

export class LocalGame {
  private readonly ctx: GameContext;
  private readonly settings: RoomSettings;
  private state: GameState;
  private log: LoggedEvent[] = [];
  private seq = 1;
  private chat: ChatLine[] = [];
  private deliver: (msg: ServerMsg) => void = () => {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private clock = '';
  private deadline: number | null = null;
  private total: number | null = null;
  private paused: number | null = null;
  private botAttacks = 0;
  private botTurn = -1;
  private closed = false;

  constructor(start: Start, seed = Date.now() % 1_000_000) {
    const rules = structuredClone(rulesJson) as typeof rulesJson;
    if (start === 'turno') {
      rules.setup.briefing = false;
      rules.setup.distribution = 'random';
      rules.setup.placement = 'simultaneous';
    }
    this.ctx = createContext(def, rules, objectivesJson);
    this.settings = {
      board: def.id,
      mode: 'objectives',
      distribution: this.ctx.rules.setup.distribution,
      placement: this.ctx.rules.setup.placement,
      turnSeconds: this.ctx.rules.timers.turnSeconds,
    };
    let state = createGame(this.ctx, PLAYERS, 'objectives', seed);
    if (start === 'turno') {
      // piazzamento iniziale fatto a caso per tutti: si parte dal primo turno
      for (const p of PLAYERS) state = passFor(this.ctx, state, p.id).state;
    }
    this.state = state;
  }

  /** Il collegamento da dare allo store (setLinkFactory). */
  readonly factory: LinkFactory = (onMessage, onStatus) => {
    this.deliver = (msg) => setTimeout(() => !this.closed && onMessage(msg), 25);
    setTimeout(() => onStatus(true), 0);
    const link: Link = {
      send: (msg) => setTimeout(() => !this.closed && this.handle(msg), 25),
      close: () => this.stop(),
    };
    return link;
  };

  stop(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private handle(msg: ClientMsg): void {
    switch (msg.t) {
      case 'create':
        this.deliver({ t: 'welcome', token: 'prova', game: 'prova', you: ME });
        this.deliver({ t: 'lobby', lobby: this.lobby() });
        this.deliver({ t: 'game', view: viewFor(this.ctx, this.state, ME), log: [], sync: true });
        this.syncClock(true);
        this.schedule();
        return;
      case 'act':
        try {
          const r = applyAction(this.ctx, this.state, ME, msg.action);
          this.commit(r, msg.n);
        } catch (err) {
          this.deliver({ t: 'error', message: err instanceof Error ? err.message : String(err), ...(msg.n === undefined ? {} : { ack: msg.n }) });
        }
        return;
      case 'chat': {
        const line = { from: ME, name: PLAYERS[0]!.name, color: PLAYERS[0]!.color, text: msg.text, at: Date.now() };
        this.chat.push(line);
        this.deliver({ t: 'chat', lines: [line] });
        return;
      }
      case 'pause':
        if (msg.paused && this.paused === null) this.paused = Math.max(0, (this.deadline ?? Date.now()) - Date.now());
        else if (!msg.paused && this.paused !== null) {
          this.deadline = Date.now() + this.paused;
          this.paused = null;
        }
        this.status();
        return;
      case 'report':
        this.deliver({ t: 'notice', message: 'Pagina di prova: la segnalazione non va da nessuna parte.' });
        return;
      default:
        return;
    }
  }

  /** Stato nuovo con i suoi eventi: registro, partita mandata, tempo, mossa degli avversari. */
  private commit(r: ActionResult, ack?: number): void {
    this.state = r.state;
    const at = Date.now();
    const added: LoggedEvent[] = [];
    for (const event of r.events) {
      for (const e of eventsFor([event], ME)) added.push({ seq: this.seq, at, event: e });
      this.seq++;
    }
    this.log.push(...added);
    this.deliver({ t: 'game', view: viewFor(this.ctx, this.state, ME), log: added, sync: false, ...(ack === undefined ? {} : { ack }) });
    this.syncClock();
    this.schedule();
  }

  // ---------------------------------------------------------------- tempo (si vede, ma non scade)
  private syncClock(force = false): void {
    const s = this.state;
    const key = `${s.phase}:${s.turn?.number ?? 0}:${s.setupPlayer ?? ''}`;
    if (!force && key === this.clock) return;
    this.clock = key;
    const t = this.ctx.rules.timers;
    const seconds =
      s.phase === 'briefing' ? t.briefingSeconds : s.phase === 'draft' ? t.pickSeconds : s.phase === 'setup' ? t.setupSeconds : t.turnSeconds;
    this.total = seconds * 1000;
    this.deadline = Date.now() + this.total;
    this.status();
  }

  private status(): void {
    this.deliver({
      t: 'status',
      deadline: this.paused === null ? this.deadline : null,
      paused: this.paused === null ? null : { reason: 'host', remainingMs: this.paused },
      total: this.total,
      now: Date.now(),
    });
  }

  // ---------------------------------------------------------------- avversari
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.state.phase === 'over') return;
    const due = playersToAct(this.ctx, this.state).filter((id) => id !== ME);
    if (due.length === 0) return;
    const phase = this.state.phase;
    const ms = phase === 'briefing' ? 1500 : phase === 'draft' ? BOT_MS.pick : phase === 'setup' ? BOT_MS.place : phase === 'attack' && this.botAttacks > 0 ? BOT_MS.attack : BOT_MS.turn;
    this.timer = setTimeout(() => this.botStep(due[0]!), ms);
  }

  private botStep(id: string): void {
    if (this.closed) return;
    const s = this.state;
    if (s.turn && s.turn.number !== this.botTurn) {
      this.botTurn = s.turn.number;
      this.botAttacks = 0;
    }
    let r: ActionResult;
    try {
      r = s.phase === 'reinforce' || s.phase === 'attack' ? this.botTurnStep(id) : passFor(this.ctx, s, id);
    } catch {
      r = passFor(this.ctx, s, id);
    }
    this.commit(r);
  }

  /** Un passo del turno di un avversario: tutto su un confine, qualche attacco se conviene, poi passa. */
  private botTurnStep(id: string): ActionResult {
    const s = this.state;
    const act = (action: Action) => applyAction(this.ctx, s, id, action);
    const mine = ownedBy(s, id);
    const enemyNear = (t: string) => (this.ctx.neighbours.get(t) ?? []).some((n) => s.territories[n]?.owner !== id);
    if (s.phase === 'reinforce') {
      const front = mine.filter(enemyNear).sort((a, b) => s.territories[b]!.armies - s.territories[a]!.armies)[0] ?? mine[0]!;
      return act({ kind: 'reinforce', placements: { [front]: s.turn!.reinforcements } });
    }
    const occ = s.turn!.occupation;
    if (occ) return act({ kind: 'occupy', armies: occ.max });
    if (this.botAttacks < BOT_ATTACKS) {
      const free = eliminationAllowed(this.ctx, s);
      let best: { from: string; to: string; edge: number } | null = null;
      for (const from of mine) {
        const a = s.territories[from]!.armies;
        if (a < 3) continue;
        for (const to of this.ctx.neighbours.get(from) ?? []) {
          const t = s.territories[to]!;
          if (t.owner === id) continue;
          if (!free && ownedBy(s, t.owner).length <= 1) continue;
          const edge = a - t.armies;
          if (edge >= 2 && (!best || edge > best.edge)) best = { from, to, edge };
        }
      }
      if (best) {
        this.botAttacks++;
        const dice = Math.min(this.ctx.rules.dice.attackMax, s.territories[best.from]!.armies - 1);
        return act({ kind: 'attack', from: best.from, to: best.to, dice });
      }
    }
    return act({ kind: 'end-turn' });
  }

  // ---------------------------------------------------------------- sala
  private lobby(): LobbyInfo {
    const summary = {
      id: def.id,
      name: def.name,
      description: def.description,
      territories: def.territories.length,
      continents: def.continents.length,
    };
    return {
      id: 'prova',
      hostId: ME,
      phase: 'playing',
      board: { ...summary, hash: localBoard.hash },
      boards: [summary],
      players: PLAYERS.map((p) => ({ ...p, connected: true, left: false, idleTurns: 0 })),
      settings: this.settings,
      rules: this.ctx.rules,
      kickAfterIdle: 2,
    };
  }
}
