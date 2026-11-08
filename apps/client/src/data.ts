import mapJson from '@data/maps/prova.json';
import unitsJson from '@data/rules/units.json';
import buildingsJson from '@data/rules/buildings.json';
import defaultsJson from '@data/rules/defaults.json';
import strategiesJson from '@data/rules/strategies.json';
import generalJson from '@data/rules/general.json';
import { MapDef, parseRules } from '@onpeace/engine';

/** Regole e mappa validate all'avvio: un errore nei dati si vede subito. */
export const rules = parseRules({
  units: unitsJson,
  buildings: buildingsJson,
  defaults: defaultsJson,
  strategies: strategiesJson,
  general: generalJson,
});
export const testMap = MapDef.parse(mapJson);
