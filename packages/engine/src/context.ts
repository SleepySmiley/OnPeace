import { Catalog } from './catalog';
import type { CityDef, CountryDef, MapDef } from './schema/map';
import type { Rules, RulesDefaults } from './schema/rules';

/** Dati fissi di una partita: mappa e regole, con indici per l'accesso rapido. */
export interface GameContext {
  map: MapDef;
  rules: RulesDefaults;
  catalog: Catalog;
  cities: Map<string, CityDef>;
  countries: Map<string, CountryDef>;
  citiesByCountry: Map<string, CityDef[]>;
}

export function createContext(map: MapDef, rules: Rules): GameContext {
  const cities = new Map(map.cities.map((c) => [c.id, c]));
  const countries = new Map(map.countries.map((c) => [c.id, c]));
  const citiesByCountry = new Map<string, CityDef[]>(map.countries.map((c) => [c.id, []]));
  for (const city of map.cities) citiesByCountry.get(city.country)?.push(city);
  return { map, rules: rules.defaults, catalog: new Catalog(rules), cities, countries, citiesByCountry };
}

export function cityDef(ctx: GameContext, id: string): CityDef {
  const c = ctx.cities.get(id);
  if (!c) throw new Error(`città sconosciuta: ${id}`);
  return c;
}

export function countryDef(ctx: GameContext, id: string): CountryDef {
  const c = ctx.countries.get(id);
  if (!c) throw new Error(`paese sconosciuto: ${id}`);
  return c;
}
