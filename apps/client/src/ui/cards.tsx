/** Schede (a comparsa) di unità ed edifici: cosa fanno, quanto costano, i numeri che contano. */
import type { AuraEffect, BuildingDef, UnitDef, UnitTarget } from '@onpeace/engine';
import { ctx } from '../game/store';

const fmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const signed = (v: number) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);
const names = (ids: readonly string[]) =>
  ids.map((id) => ctx.catalog.units.get(id)?.name ?? ctx.catalog.buildings.get(id)?.name ?? id).join(', ');

const DOMAIN = { land: 'Unità di terra', naval: 'Nave', air: 'Aereo' } as const;
const DOMAIN_PLURAL = { land: 'unità di terra', naval: 'navi', air: 'aerei' } as const;
const ROLE: Partial<Record<string, string>> = { general: 'Generale', commander: 'comandanti' };

function targetText(t: UnitTarget): string {
  if (t.all) return 'tutte le unità';
  const parts = [
    ...(t.units ? [names(t.units)] : []),
    ...(t.domains ?? []).map((d) => DOMAIN_PLURAL[d]),
    ...(t.roles ?? []).map((r) => ROLE[r] ?? r),
  ];
  return parts.join(', ');
}

function auraText(a: AuraEffect): string {
  const parts = [
    a.attack && `${signed(a.attack)} attacco`,
    a.defence && `${signed(a.defence)} difesa`,
    a.crit && `${signed(a.crit)}% critico`,
    a.hp && `${signed(a.hp)} vita`,
    a.move && `${signed(a.move)} movimento`,
    a.view && `${signed(a.view)} vista`,
    a.upkeep && `${signed(a.upkeep)} mantenimento`,
  ].filter(Boolean);
  return `${parts.join(', ')} a ${targetText(a.target)} della sua pila`;
}

/** Un numero della griglia, con la differenza dovuta alla strategia (se c'è). */
function Stat({ label, value, base, suffix = '' }: { label: string; value: number; base?: number; suffix?: string }) {
  const delta = base === undefined ? 0 : value - base;
  return (
    <div>
      <dt>{label}</dt>
      <dd className="num">
        {fmt.format(value)}
        {suffix}
        {delta !== 0 && (
          <span className="tip-delta" title="Effetto della tua strategia">
            {signed(delta)}
          </span>
        )}
      </dd>
    </div>
  );
}

function Head({ name, cost, kind }: { name: string; cost: number | null; kind: string }) {
  return (
    <>
      <div className="tip-head">
        <span className="tip-title">{name}</span>
        {cost !== null && <span className="tip-cost num">{fmt.format(cost)}</span>}
      </div>
      <div className="tip-kind">{kind}</div>
    </>
  );
}

interface UnitCardProps {
  /** Valori dell'unità per chi guarda (con la sua strategia). */
  def: UnitDef;
  /** Valori base, per mostrare cosa cambia la strategia. */
  base?: UnitDef;
  /** Bonus di comando della pila (Generale, comandanti), già in parole. */
  bonus?: string[];
  /** Mostra il prezzo (nel negozio). */
  showCost?: boolean;
}

export function UnitCard({ def, base, bonus = [], showCost = false }: UnitCardProps) {
  const notes: string[] = [];
  if (def.stealth) notes.push('Invisibile al nemico finché non viene scoperta');
  if (def.cargo) {
    notes.push(
      def.cargo.carries === 'any_land'
        ? `Trasporta fino a ${def.cargo.capacity} unità di terra`
        : `Trasporta fino a ${def.cargo.capacity}: ${names(def.cargo.carries)}`,
    );
  }
  if (def.transportable) notes.push('Si imbarca sui trasporti');
  if (def.collateral > 0) notes.push('Attaccando una città ne riduce la popolazione');
  if (def.cityDefence) notes.push(`${signed(def.cityDefence)} difesa nelle proprie città`);
  if (def.lineDefence) notes.push(`${signed(def.lineDefence)} difesa in linea difensiva`);
  for (const b of def.defenceBonus) notes.push(`${signed(b.value)} difesa contro ${names(b.vs)}`);
  for (const a of def.aura) notes.push(auraText(a));
  if (def.hunts.length > 0) notes.push(`Colpisce per primi: ${def.hunts.map((r) => ROLE[r] ?? r).join(', ')}`);
  if (def.oneShot) notes.push("Si consuma dopo l'attacco");
  const upkeep = def.rare ? 0 : def.cost / ctx.rules.economy.upkeepDivisor;
  const kind = [DOMAIN[def.domain], def.canTakeCities ? 'conquista città' : 'non conquista città'].join(' · ');

  return (
    <>
      <Head name={def.name} cost={showCost ? def.cost : null} kind={def.rare ? `${kind} · rara` : kind} />
      {def.description && <p className="tip-desc">{def.description}</p>}
      <dl className="tip-stats">
        <Stat label="Attacco" value={def.attack} base={base?.attack} />
        <Stat label="Difesa" value={def.defence} base={base?.defence} />
        <Stat label="Vita" value={def.hp} base={base?.hp} />
        <Stat label="Movimento" value={def.move} base={base?.move} />
        <Stat label="Vista" value={def.view} base={base?.view} />
        <Stat label="Critico" value={def.crit} base={base?.crit} suffix="%" />
      </dl>
      {notes.length > 0 && (
        <ul className="tip-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {bonus.length > 0 && <p className="tip-bonus">Bonus di comando in questa pila: {bonus.join(' · ')}</p>}
      <div className="tip-foot">
        {def.rare ? 'Nessun mantenimento' : <>Mantenimento <b className="num">{fmt.format(upkeep)}</b> a turno</>}
        {showCost && base && def.cost !== base.cost && <span className="dim"> · prezzo base {fmt.format(base.cost)}</span>}
      </div>
      <div className="tip-legend">Attacco e difesa: danno massimo per colpo.</div>
    </>
  );
}

export function BuildingCard({ def, base, built }: { def: BuildingDef; base?: BuildingDef; built: boolean }) {
  const effects: string[] = [];
  const e = def.effects;
  if (e.extraReinforcements) effects.push(`+${e.extraReinforcements} rinforzi a ogni ricarica di questa città`);
  if (e.upkeepReduction) effects.push(`−${e.upkeepReduction} di mantenimento per ogni unità comprata qui`);
  if (e.cityDefenceBonus) effects.push(`+${e.cityDefenceBonus} difesa a ogni unità che difende la città`);
  for (const b of def.defenceBonus) effects.push(`${signed(b.value)} difesa contro ${names(b.vs)}`);
  if (def.view > ctx.rules.vision.cityView) effects.push(`Vede fino a ${fmt.format(def.view)} di raggio (la città da sola ${ctx.rules.vision.cityView})`);
  const upkeep = def.cost / ctx.rules.economy.upkeepDivisor;

  return (
    <>
      <Head
        name={def.name}
        cost={def.cost}
        kind={[built ? 'Già costruito qui' : 'Edificio', def.portOnly ? 'solo nei porti' : null].filter(Boolean).join(' · ')}
      />
      {def.description && <p className="tip-desc">{def.description}</p>}
      {effects.length > 0 && (
        <ul className="tip-notes strong">
          {effects.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <dl className="tip-stats">
        <Stat label="Difesa" value={def.defence} base={base?.defence} />
        <Stat label="Vita" value={def.hp} base={base?.hp} />
        <Stat label="Critico" value={def.crit} base={base?.crit} suffix="%" />
      </dl>
      <div className="tip-foot">
        Mantenimento <b className="num">{fmt.format(upkeep)}</b> a turno
      </div>
      <div className="tip-legend">Combatte con i difensori della città e può essere distrutto.</div>
    </>
  );
}
