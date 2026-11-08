/**
 * Linee difensive (ricerca 01 §4.4): due pile vicine dello stesso giocatore formano
 * un "muro" che i nemici in guerra non attraversano senza attaccare.
 * Terra con terra, navi (non invisibili) con navi. Gli aerei passano sopra.
 */
import type { GameContext } from './context';
import { canAttack } from './diplomacy';
import { distance, type Point } from './geometry';
import type { GameState, PlayerId, StackState } from './state';

export type Segment = readonly [Point, Point];

/** Parametro t (0..1) sul segmento a1→a2 dove incrocia b1→b2, oppure null. */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): number | null {
  const rx = a2[0] - a1[0];
  const ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0];
  const sy = b2[1] - b1[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = b1[0] - a1[0];
  const qy = b1[1] - a1[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function lineKinds(ctx: GameContext, stack: StackState): { land: boolean; naval: boolean } {
  let land = false;
  let naval = false;
  for (const u of stack.units) {
    const def = ctx.catalog.unit(u.type);
    if (def.domain === 'land') land = true;
    if (def.domain === 'naval' && !def.stealth) naval = true;
  }
  return { land, naval };
}

export function defenceLines(state: GameState, ctx: GameContext, owner: PlayerId): Segment[] {
  const max = ctx.rules.movement.defenceLineMaxDistance * ctx.map.rangeScale;
  const mine = state.stacks.filter((s) => s.owner === owner).map((s) => ({ s, k: lineKinds(ctx, s) }));
  const out: Segment[] = [];
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      const a = mine[i]!;
      const b = mine[j]!;
      const sameKind = (a.k.land && b.k.land) || (a.k.naval && b.k.naval);
      if (sameKind && distance(a.s.pos, b.s.pos) <= max) out.push([a.s.pos, b.s.pos]);
    }
  }
  return out;
}

/** Primo muro nemico incrociato dal segmento from→to (t sul segmento), oppure null. */
export function firstWallCrossing(
  state: GameState,
  ctx: GameContext,
  player: PlayerId,
  from: Point,
  to: Point,
): { t: number; point: Point } | null {
  let best: number | null = null;
  for (const other of state.players) {
    if (other.id === player || other.status !== 'active' || !canAttack(state, ctx, player, other.id)) continue;
    for (const [w1, w2] of defenceLines(state, ctx, other.id)) {
      // partire o arrivare esattamente su un estremo del muro non è un attraversamento
      if (distance(from, w1) < 1 || distance(from, w2) < 1 || distance(to, w1) < 1 || distance(to, w2) < 1) continue;
      const t = segmentIntersection(from, to, w1, w2);
      if (t !== null && (best === null || t < best)) best = t;
    }
  }
  if (best === null) return null;
  return { t: best, point: [from[0] + (to[0] - from[0]) * best, from[1] + (to[1] - from[1]) * best] };
}
