# OnPeace

Gioco di strategia multiplayer a turni simultanei, da browser, per partite dal vivo tra amici.
Progetto, regole e piano di sviluppo: [docs/progetto.md](docs/progetto.md). Ricerca di riferimento: [docs/ricerca/](docs/ricerca/).

## Requisiti

- Node.js 22 o superiore (sviluppato con Node 24)

## Comandi

```bash
npm install            # dipendenze
npm run dev            # server di gioco (porta 3210) + client in sviluppo su http://localhost:5173
npm run build          # compila il client
npm start              # server di produzione: gioco completo su http://localhost:3210
npm run tunnel         # espone il server su Internet con Cloudflare Tunnel (vedi sotto)
npm test               # test (motore, server, validità dei dati)
npm run lint           # ESLint
npm run typecheck      # controllo dei tipi su tutto il progetto
npm run data:check     # verifica regole e mappe in data/
npm run data:schema    # rigenera i JSON Schema in data/schema/
npm run map:generate -- [seme] [nome]   # genera una mappa inventata in data/maps/<nome>.json
```

## Giocare online tra amici (server sul tuo PC)

Il server gira sul PC di chi ospita; gli amici entrano dal browser con il link d'invito.
Cloudflare Tunnel rende il server raggiungibile da Internet senza aprire porte sul router.

Una volta sola:

1. Installa `cloudflared`: `winget install --id Cloudflare.cloudflared` (Windows) oppure scaricalo da developers.cloudflare.com.
2. Compila il client: `npm run build`.

Per ogni serata:

1. Avvia il server: `npm start` (lascia la finestra aperta).
2. In un'altra finestra: `npm run tunnel`. Dopo qualche secondo compare un indirizzo `https://…trycloudflare.com`.
3. Apri quell'indirizzo, crea la partita e manda agli amici il link d'invito che vedi nella sala d'attesa.

Note:
- L'indirizzo `trycloudflare.com` cambia a ogni avvio del tunnel. Per un indirizzo fisso serve un tunnel con nome e un dominio su Cloudflare.
- Le partite sono salvate in `games/` a ogni azione: se il PC si riavvia, rilanci `npm start` e la partita riprende da dove era (il timer del turno riparte da almeno un minuto).
- Chi chiude il browser rientra riaprendo il link: il browser ricorda il suo posto.

## Struttura

| Cartella | Contenuto |
|---|---|
| `packages/engine` | Regole del gioco in TypeScript puro: schemi dei dati, geometria, combattimento, turno, nebbia di guerra |
| `packages/protocol` | Messaggi tra browser e server (validati con zod) |
| `apps/server` | Server Node: stanze, timer, salvataggi, WebSocket su `/ws` |
| `apps/client` | Interfaccia: React per i pannelli, PixiJS per la mappa |
| `data/rules` | Unità, edifici e parametri delle regole (ogni numero del gioco sta qui) |
| `data/maps` | Mappe in JSON: paesi (forme), città, zone invalicabili, scorciatoie |
| `data/schema` | JSON Schema generati: danno autocompletamento e controllo in VS Code |
| `tools` | Generatore di mappe, verifica dati, generazione schemi |

## Modificare regole e mappe

Le regole e le mappe sono file JSON:

| File | Contenuto |
|---|---|
| `data/rules/units.json` | Unità, compresi il Generale e le unità rare (`"rare": true`) |
| `data/rules/buildings.json` | Edifici |
| `data/rules/strategies.json` | Strategie: modificatori di unità ed edifici |
| `data/rules/general.json` | Potenziamenti del Generale e quanti se ne scelgono |
| `data/rules/defaults.json` | Tutti gli altri numeri del gioco e le opzioni predefinite |
| `data/maps/*.json` | Mappe |

Dopo ogni modifica:

```bash
npm run data:check
```

Il comando controlla il formato (schema) e la coerenza: città dentro il proprio paese, capitali valide, porti vicini al mare, città non in montagna, distanze minime.
