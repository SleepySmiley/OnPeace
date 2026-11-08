/** Testi per strategie, Generale e schede delle unità. */
import { isPurchasable, type Doctrine, type GameState, type PlayerId, type UnitDef } from '@onpeace/engine';
import { ctx } from './store';

export const NO_DOCTRINE: Doctrine = { strategy: null, general: [] };

export const strategyName = (id: string | null | undefined) =>
  id ? (ctx.catalog.strategies.get(id)?.name ?? id) : 'Nessuna strategia';

export const upgradeName = (id: string) => ctx.catalog.generalUpgrades.get(id)?.name ?? id;

const unitName = (id: string) => ctx.catalog.units.get(id)?.name ?? id;

/** La dottrina di un giocatore come la conosce chi guarda. */
export function doctrineOf(game: GameState, player: PlayerId): Doctrine {
  const p = game.players.find((x) => x.id === player);
  return p ? { strategy: p.strategy, general: p.generalUpgrades ?? [] } : NO_DOCTRINE;
}

const signed = (v: number) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);

/** Statistiche essenziali di un'unità in una riga. */
export function statsLine(u: UnitDef): string {
  const parts = [`att ${u.attack}`, `dif ${u.defence}`, `HP ${u.hp}`, `mov ${u.move}`, `vista ${u.view}`];
  if (u.crit !== 5) parts.push(`crit ${u.crit}%`);
  if (u.cargo) parts.push(`carico ${u.cargo.capacity}`);
  return parts.join(' · ');
}

/** Scheda di un'unità per i suggerimenti (title): descrizione, statistiche, capacità speciali. */
export function unitTooltip(u: UnitDef): string {
  const lines = [u.description, statsLine(u)];
  const extra: string[] = [];
  if (u.stealth) extra.push('invisibile');
  if (u.oneShot) extra.push('uso singolo');
  if (u.cityDefence) extra.push(`${signed(u.cityDefence)} dif. in città`);
  if (u.lineDefence) extra.push(`${signed(u.lineDefence)} dif. in linea`);
  for (const b of u.defenceBonus) extra.push(`${signed(b.value)} dif. contro ${b.vs.map(unitName).join(', ')}`);
  if (extra.length > 0) lines.push(extra.join(' · '));
  return lines.join('\n');
}

const FIELDS: [keyof UnitDef & string, string][] = [
  ['attack', 'att'],
  ['defence', 'dif'],
  ['crit', 'crit'],
  ['hp', 'HP'],
  ['move', 'mov'],
  ['view', 'vista'],
  ['cost', 'costo'],
  ['cityDefence', 'dif. in città'],
  ['lineDefence', 'dif. in linea'],
];

export interface StrategyChange {
  name: string;
  changes: string[];
}

/** Cosa cambia una strategia rispetto ai valori base, unità per unità (ed edifici). */
export function strategyChanges(strategyId: string): StrategyChange[] {
  const out: StrategyChange[] = [];
  for (const base of ctx.catalog.units.values()) {
    if (!isPurchasable(base)) continue;
    const mod = ctx.catalog.unitFor(base.id, strategyId);
    const changes: string[] = [];
    for (const [key, label] of FIELDS) {
      const a = base[key] as number;
      const b = mod[key] as number;
      if (a === b) continue;
      changes.push(key === 'cityDefence' || key === 'lineDefence' ? `${signed(b - a)} ${label}` : `${label} ${a}→${b}`);
    }
    if (base.cargo && mod.cargo && base.cargo.capacity !== mod.cargo.capacity) {
      changes.push(`carico ${base.cargo.capacity}→${mod.cargo.capacity}`);
    }
    for (const b of mod.defenceBonus.slice(base.defenceBonus.length)) {
      changes.push(`${signed(b.value)} dif. contro ${b.vs.map(unitName).join(', ')}`);
    }
    if (changes.length > 0) out.push({ name: base.name, changes });
  }
  for (const base of ctx.catalog.buildings.values()) {
    const mod = ctx.catalog.buildingFor(base.id, strategyId);
    const changes: string[] = [];
    if (base.cost !== mod.cost) changes.push(`costo ${base.cost}→${mod.cost}`);
    if (base.crit !== mod.crit) changes.push(`crit ${base.crit}→${mod.crit}`);
    if (base.defence !== mod.defence) changes.push(`dif ${base.defence}→${mod.defence}`);
    if (changes.length > 0) out.push({ name: base.name, changes });
  }
  return out;
}
