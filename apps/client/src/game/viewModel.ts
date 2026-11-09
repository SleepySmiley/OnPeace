/** Dallo stato di gioco a ciò che la mappa deve disegnare. */
import {
  allUnits,
  type GameState,
  type PlannedStep,
  type Point,
  type TurnEvent,
} from '@onpeace/engine';
import { ctx, type Selected } from './store';

export type DomainIcon = 'land' | 'naval' | 'air' | 'mixed';

export interface StackMarker {
  id: string;
  pos: Point;
  owner: string | null;
  color: string;
  count: number;
  inCity: string | null;
  selected: boolean;
  moved: boolean;
  domain: DomainIcon;
  cargo: number;
  /** Fuori vista: si conosce la posizione, non la composizione. */
  fog: boolean;
  /** Nella pila c'è un Generale. */
  general: boolean;
}

export interface PathMarker {
  points: Point[];
  color: string;
  attack: boolean;
  ok: boolean;
}

export interface EventMarker {
  pos: Point;
  kind: 'battle' | 'capture';
  color: string;
}

export interface DraftMarker {
  /** Percorso: partenza, tappe, arrivo. */
  points: Point[];
  ok: boolean;
  attack: boolean;
  /** Centro del cerchio: l'ultima tappa (o la partenza). */
  center: Point;
  /** Raggio ancora percorribile dal centro, in unità mappa. */
  range: number;
  /** Solo il raggio della pila scelta, senza freccia (prima di trascinarla). */
  idle?: boolean;
}

export interface MapViewModel {
  countryOwner: Record<string, string | null>;
  cityOwner: Record<string, string | null>;
  stacks: StackMarker[];
  paths: PathMarker[];
  markers: EventMarker[];
  selectedCity: string | null;
  /** Durante la scelta: paesi ancora liberi. */
  pickable: Set<string> | null;
}

export const NEUTRAL_STACK_COLOR = '#9aa3a8';
/** Frecce degli ordini già dati. */
export const PLAN_PATH_COLOR = '#f3ecd6';

export const EMPTY_VIEW: MapViewModel = {
  countryOwner: {},
  cityOwner: {},
  stacks: [],
  paths: [],
  markers: [],
  selectedCity: null,
  pickable: null,
};

export function buildView(p: {
  state: GameState;
  selected: Selected;
  steps?: PlannedStep[];
  moved?: ReadonlySet<string>;
  events?: TurnEvent[];
  pickable?: Set<string> | null;
}): MapViewModel {
  const { state } = p;
  const color = (id: string | null) => (id ? (state.players.find((x) => x.id === id)?.color ?? null) : null);

  const countryOwner: Record<string, string | null> = {};
  for (const c of ctx.map.countries) countryOwner[c.id] = color(state.cities[c.capital]?.owner ?? null);
  const cityOwner: Record<string, string | null> = {};
  for (const c of ctx.map.cities) cityOwner[c.id] = color(state.cities[c.id]?.owner ?? null);

  const stacks: StackMarker[] = state.stacks.map((s) => {
    const domains = new Set(s.units.map((u) => ctx.catalog.unit(u.type).domain));
    const domain: DomainIcon = domains.size === 1 ? ([...domains][0] as DomainIcon) : 'mixed';
    return {
      id: s.id,
      pos: s.pos,
      owner: s.owner,
      color: color(s.owner) ?? NEUTRAL_STACK_COLOR,
      count: s.units.length,
      inCity: s.city,
      selected: p.selected?.kind === 'stack' && p.selected.id === s.id,
      moved: p.moved && s.units.length > 0 ? s.units.every((u) => p.moved!.has(u.id)) : false,
      domain,
      cargo: allUnits(s).length - s.units.length,
      fog: Boolean(s.fog),
      general: allUnits(s).some((u) => u.type === ctx.catalog.generalUnit),
    };
  });

  const paths: PathMarker[] = (p.steps ?? [])
    .filter((st) => st.path && st.path.length >= 2)
    .map((st) => ({
      points: st.path!,
      // crema, non il colore del giocatore: sul proprio paese sparirebbe
      color: PLAN_PATH_COLOR,
      attack: st.arrival === 'attack_city' || st.arrival === 'attack_stack',
      ok: st.ok,
    }));

  const markers: EventMarker[] = [];
  for (const e of p.events ?? []) {
    if (e.kind === 'battle') markers.push({ pos: e.at, kind: 'battle', color: '#ff7a3d' });
    if (e.kind === 'capture') {
      markers.push({ pos: ctx.cities.get(e.city)!.pos, kind: 'capture', color: color(e.player) ?? '#fff' });
    }
  }

  return {
    countryOwner,
    cityOwner,
    stacks,
    paths,
    markers,
    selectedCity: p.selected?.kind === 'city' ? p.selected.id : null,
    pickable: p.pickable ?? null,
  };
}
