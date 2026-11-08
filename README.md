# OnPeace

Gioco di strategia multiplayer a turni simultanei, da browser, per partite dal vivo tra amici.
Progetto, regole e piano di sviluppo: [docs/progetto.md](docs/progetto.md). Ricerca di riferimento: [docs/ricerca/](docs/ricerca/).

## Requisiti

- Node.js 22 o superiore (sviluppato con Node 24)

## Comandi

```bash
npm install            # dipendenze
npm run dev            # client in sviluppo su http://localhost:5173
npm test               # test (motore e validità dei dati)
npm run lint           # ESLint
npm run typecheck      # controllo dei tipi su tutto il progetto
npm run data:check     # verifica regole e mappe in data/
npm run data:schema    # rigenera i JSON Schema in data/schema/
npm run map:generate -- [seme] [nome]   # genera una mappa inventata in data/maps/<nome>.json
```

## Struttura

| Cartella | Contenuto |
|---|---|
| `packages/engine` | Regole del gioco in TypeScript puro: schemi dei dati, geometria, RNG con seme |
| `apps/client` | Interfaccia: React per i pannelli, PixiJS per la mappa |
| `data/rules` | Unità, edifici e parametri delle regole (ogni numero del gioco sta qui) |
| `data/maps` | Mappe in JSON: paesi (forme), città, zone invalicabili, scorciatoie |
| `data/schema` | JSON Schema generati: danno autocompletamento e controllo in VS Code |
| `tools` | Generatore di mappe, verifica dati, generazione schemi |

## Modificare regole e mappe

Le regole e le mappe sono file JSON. Dopo ogni modifica:

```bash
npm run data:check
```

Il comando controlla il formato (schema) e la coerenza: città dentro il proprio paese, capitali valide, porti vicini al mare, città non in montagna, distanze minime.
