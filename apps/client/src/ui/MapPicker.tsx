import { useEffect, useState } from 'react';
import type { MapSummary } from '@onpeace/protocol';
import { fetchMapList, useSession } from '../game/store';

/** Mappa proposta se non se ne sceglie un'altra. */
export const DEFAULT_MAP = 'europa';

/** Elenco delle mappe del server e mappa scelta (che si vede subito sullo sfondo). */
export function useMapChoice() {
  const showMap = useSession((s) => s.showMap);
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMapList().then(
      (list) => live && setMaps(list),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const mapId = chosen ?? maps?.find((m) => m.id === DEFAULT_MAP)?.id ?? maps?.[0]?.id ?? null;
  useEffect(() => {
    if (mapId) void showMap(mapId);
  }, [mapId, showMap]);

  return { maps, mapId, setMapId: setChosen, failed };
}

interface Props {
  maps: MapSummary[] | null;
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  failed?: boolean;
}

/** Tendina delle mappe con una riga di descrizione. */
export function MapPicker({ maps, value, onChange, disabled = false, failed = false }: Props) {
  const current = maps?.find((m) => m.id === value);
  return (
    <div className="map-picker">
      <label>
        Mappa
        <select value={value ?? ''} disabled={disabled || !maps} onChange={(e) => onChange(e.target.value)}>
          {!maps && <option value="">{failed ? 'Server non raggiungibile' : 'Carico…'}</option>}
          {maps?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <p className="dim map-picker-info">
          {current.description.replace(/\s*Dati geografici:.*$/, '')} {current.countries} paesi, {current.cities} città.
        </p>
      )}
    </div>
  );
}
