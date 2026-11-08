import type { UnitSelection, UnitState } from '@onpeace/engine';

export function summarizeUnits(units: readonly UnitState[]): UnitSelection {
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, count }));
}
