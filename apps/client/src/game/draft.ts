/**
 * Ordini di movimento in preparazione (trascinando una pila o dopo "Sbarca…"):
 * la freccia non esce mai dal raggio, le tappe (Maiusc) accorciano il raggio rimasto,
 * e si dice in parole che cosa succederà al rilascio.
 */
import {
  SAME_POINT,
  checkMove,
  checkUnload,
  distance,
  groupRange,
  pathLength,
  routeLeg,
  routePath,
  snapToCity,
  type Action,
  type Arrival,
  type GameState,
  type PlanPreview,
  type PlayerId,
  type Point,
  type StackState,
  type UnitSelection,
  type UnitState,
} from '@onpeace/engine';
import { cityName, placeOf, playerName } from './describe';
import { ctx, nav, type MoveDraft, type UnitPick } from './store';
import type { DraftMarker } from './viewModel';

/** Margine (unità mappa) per restare appena dentro il raggio. */
const INSIDE = 0.05;

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Il punto più lontano verso `p` entro `left` da `anchor`. Se cade vicino a una città fuori portata
 * (che lo "aggancerebbe" allungando il percorso) ci si ferma prima, fuori dal suo raggio d'aggancio.
 */
export function reachablePoint(anchor: Point, p: Point, left: number): Point {
  const r = Math.max(0, left - INSIDE);
  const d = distance(anchor, p);
  const q = d <= r ? p : lerp(anchor, p, r / d);
  for (let t = 1; t > 0; t -= 0.02) {
    const c = lerp(anchor, q, t);
    const city = snapToCity(ctx, c);
    if (!city || distance(anchor, city.pos) <= left) return c;
  }
  return anchor;
}

const domainOf = (draft: MoveDraft) => ctx.catalog.unit(draft.units[0]!.type).domain;

/**
 * Da dove riparte la freccia (ultima tappa) e quanto raggio resta, in unità mappa.
 * Le tappe contano con le eventuali deviazioni per stretti e canali.
 */
export function legOf(draft: MoveDraft): { anchor: Point; left: number } {
  if (draft.mode === 'unload') return { anchor: draft.sourcePos, left: draft.range };
  const anchor = draft.waypoints[draft.waypoints.length - 1] ?? draft.sourcePos;
  const route = routePath(ctx, nav, domainOf(draft), draft.sourcePos, draft.waypoints) ?? draft.waypoints;
  return { anchor, left: Math.max(0, draft.range - pathLength(draft.sourcePos, route)) };
}

export interface DraftEval {
  marker: DraftMarker;
  action: Action | null;
  errors: string[];
  /** Raggio rimasto dall'ultima tappa, in unità mappa. */
  left: number;
  /** Esito previsto (solo se l'ordine è valido). */
  arrival: Arrival | null;
  /** Città d'arrivo e proprietario della pila attaccata, per descrivere l'esito. */
  endCity: string | null;
  targetOwner: string | null;
  end: Point | null;
  /** La freccia torna sulla pila di partenza: rilasciare non dà nessun ordine. */
  idle: boolean;
}

/** Costruisce l'ordine dal percorso in preparazione (verso `point`) e lo verifica sull'anteprima. */
export function evaluateDraft(
  draft: MoveDraft,
  preview: PlanPreview,
  planner: PlayerId,
  point: Point | null,
  hitStack: string | null,
): DraftEval {
  const { anchor, left } = legOf(draft);
  const marker: DraftMarker = { points: [draft.sourcePos, ...draft.waypoints], ok: false, attack: false, center: anchor, range: left };
  const result: DraftEval = {
    marker,
    action: null,
    errors: [],
    left,
    arrival: null,
    endCity: null,
    targetOwner: null,
    end: null,
    idle: false,
  };
  if (!point) return result;

  if (draft.mode === 'unload') {
    const to = reachablePoint(anchor, point, left);
    const action: Action = { kind: 'unload', from: draft.from, units: draft.units, to };
    const check = checkUnload(preview.state, ctx, nav, planner, action);
    marker.points = [draft.sourcePos, check.ok ? check.plan.end : to];
    marker.ok = check.ok;
    if (!check.ok) return { ...result, errors: check.errors, end: to };
    marker.attack = check.plan.arrival === 'attack_city';
    return {
      ...result,
      action,
      arrival: check.plan.arrival,
      endCity: check.plan.endCity?.id ?? null,
      end: check.plan.end,
    };
  }

  // pila sotto il cursore, se raggiungibile: nemica = attacco, propria = ci si unisce
  const stack = hitStack ? preview.state.stacks.find((s) => s.id === hitStack) : undefined;
  const reached = stack && distance(anchor, stack.pos) <= left ? stack : undefined;
  const enemy = reached && reached.owner !== planner ? reached : undefined;
  const end = reached ? reached.pos : reachablePoint(anchor, point, left);
  if (draft.waypoints.length === 0 && distance(end, draft.sourcePos) <= SAME_POINT) {
    marker.points = [];
    return { ...result, idle: true };
  }
  const action: Action = {
    kind: 'move',
    from: draft.from,
    units: draft.units,
    path: [...draft.waypoints, end],
    ...(enemy ? { target: enemy.id } : {}),
  };
  const check = checkMove(preview.state, ctx, nav, planner, action, preview.moved);
  // percorso vero: passa da solo per stretti e canali quando dritto non si può
  marker.points = check.ok ? [draft.sourcePos, ...check.plan.path] : [draft.sourcePos, ...draft.waypoints, end];
  marker.ok = check.ok;
  if (!check.ok) return { ...result, errors: check.errors, end };
  const { plan } = check;
  marker.attack = plan.arrival === 'attack_city' || plan.arrival === 'attack_stack';
  return {
    ...result,
    action,
    arrival: plan.arrival,
    endCity: plan.endCity?.id ?? null,
    targetOwner: plan.target?.owner ?? null,
    end: plan.end,
  };
}

/** Tappa intermedia verso `point` (entro il raggio rimasto), o il motivo per cui non si può. */
export function waypointFor(draft: MoveDraft, point: Point): { point: Point } | { error: string } {
  const { anchor, left } = legOf(draft);
  if (left <= INSIDE * 2) return { error: 'Raggio esaurito: clicca la destinazione finale' };
  const p = reachablePoint(anchor, point, left);
  if (distance(anchor, p) <= SAME_POINT) return { error: 'Sposta il cursore per mettere una tappa' };
  const domain = domainOf(draft);
  const via = routeLeg(ctx, nav, domain, anchor, p);
  if (!via || pathLength(anchor, [...via, p]) > left) {
    if (via) return { error: 'Troppo lontano passando per lo stretto: metti la tappa più vicino' };
    return {
      error:
        domain === 'land'
          ? 'Le truppe di terra non attraversano il mare né le montagne'
          : domain === 'naval'
            ? 'Le navi restano in mare (o nei porti)'
            : 'Percorso fuori dalla mappa',
    };
  }
  return { point: p };
}

/** Che cosa succederà al rilascio, in parole. */
export function describeOutcome(game: GameState, ev: DraftEval): string {
  if (ev.errors[0]) return ev.errors[0];
  if (!ev.arrival || !ev.end) return '';
  const city = ev.endCity ? cityName(ev.endCity) : null;
  switch (ev.arrival) {
    case 'attack_city':
      return `attacca ${city}`;
    case 'attack_stack':
      return `attacca la pila di ${playerName(game, ev.targetOwner)}${city ? ` a ${city}` : ''}`;
    case 'join':
      return city ? `si unisce alle tue truppe a ${city}` : 'si unisce alla tua pila';
    case 'move':
      return `si sposta ${placeOf(ev.end).text}`;
  }
}

// ------------------------------------------------------------------ unità da muovere

/** Le unità che si muoverebbero: le prime libere di ogni tipo scelto. */
export function chosenUnits(stack: StackState, sel: UnitSelection, moved: ReadonlySet<string>): UnitState[] {
  return sel.flatMap(({ type, count }) => stack.units.filter((u) => u.type === type && !moved.has(u.id)).slice(0, count));
}

/** Tutte le unità ancora libere della pila, per tipo. */
export function freeSelection(stack: StackState, moved: ReadonlySet<string>): UnitSelection {
  const counts = new Map<string, number>();
  for (const u of stack.units) if (!moved.has(u.id)) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, count }));
}

/** La scelta fatta nel pannello per questa pila (vuota se non c'è). */
export function pickedSelection(stack: StackState, pick: UnitPick | null, moved: ReadonlySet<string>): UnitSelection {
  if (pick?.stack !== stack.id) return [];
  const free = new Map(freeSelection(stack, moved).map((s) => [s.type, s.count]));
  return Object.entries(pick.counts)
    .map(([type, n]) => ({ type, count: Math.min(n, free.get(type) ?? 0) }))
    .filter((s) => s.count > 0);
}

export interface DragUnits {
  units: UnitSelection;
  /** Raggio del gruppo, in punti di raggio (non unità mappa). */
  range: number;
  /** Si muove la scelta fatta nel pannello (altrimenti tutte le unità libere). */
  picked: boolean;
}

/** Che cosa si muove trascinando la pila: la scelta del pannello o, senza scelta, tutte le unità libere. */
export function dragUnits(
  state: GameState,
  planner: PlayerId,
  stack: StackState,
  pick: UnitPick | null,
  moved: ReadonlySet<string>,
): DragUnits | { error: string } {
  const picked = pickedSelection(stack, pick, moved);
  const units = picked.length > 0 ? picked : freeSelection(stack, moved);
  if (units.length === 0) return { error: 'Le unità di questa pila si sono già mosse in questo turno' };
  const domains = new Set(units.map((u) => ctx.catalog.unit(u.type).domain));
  if (domains.size > 1) {
    return { error: 'Terra, mare e aria si muovono separatamente: scegli nel pannello quali unità muovere' };
  }
  return { units, range: groupRange(state, ctx, planner, chosenUnits(stack, units, moved)), picked: picked.length > 0 };
}
