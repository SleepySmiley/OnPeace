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
npm run serata         # serata tra amici: compila, avvia server e tunnel, apre il browser (vedi sotto)
npm run prova          # prova generale: giocatori simulati fanno una partita intera su un server di prova
npm start              # solo il server di produzione: gioco completo su http://localhost:3210
npm run tunnel         # solo il tunnel Cloudflare verso il server già acceso
npm test               # test (motore, server, validità dei dati)
npm run lint           # ESLint
npm run typecheck      # controllo dei tipi su tutto il progetto
npm run data:check     # verifica regole e mappe in data/
npm run data:schema    # rigenera i JSON Schema in data/schema/
npm run mondo:scarica  # scarica una volta i dati geografici (Natural Earth) in .cache/
npm run mondo          # ricostruisce le mappe reali da data/mondo/ (oppure: npm run mondo -- europa)
npm run mondo:anteprima -- europa anteprima.svg   # disegna una mappa in SVG per controllarla
npm run map:generate -- [seme] [nome]   # genera una mappa inventata in data/maps/<nome>.json
```

## Giocare online tra amici (server sul tuo PC)

Il server gira sul PC di chi ospita; gli amici entrano dal browser con il link d'invito.
Cloudflare Tunnel rende il server raggiungibile da Internet senza aprire porte sul router.

Una volta sola: installa `cloudflared` con `winget install --id Cloudflare.cloudflared` (Windows), oppure scaricalo da developers.cloudflare.com.

Per ogni serata:

1. `npm run serata` e lascia la finestra aperta. Il comando compila il client se serve, avvia server e tunnel e apre il gioco nel browser.
2. Quando compare «OnPeace è pronto», crea la partita. Il link d'invito della sala d'attesa usa già l'indirizzo pubblico, anche se tu giochi da `localhost`.
3. Manda il link agli amici. Per chiudere tutto: `Ctrl+C` (le partite restano salvate).

Opzioni: `npm run serata -- --locale` (senza tunnel, solo questo PC), `--build` (ricompila comunque), `--no-open` (non apre il browser).

Durante la serata:
- Se il server cade, `npm run serata` lo riavvia: la partita riprende dai salvataggi in `games/` e i browser si ricollegano da soli.
- Se il motore va in errore risolvendo un turno, si perdono al massimo gli ordini di quel turno di un giocatore, e lui viene avvisato.
- L'host può fermare il tempo con **Pausa**. Ognuno ha la **Guida** («Come si gioca») e il pulsante **Segnala** in alto.
- Chi chiude il browser rientra riaprendo il link: il browser ricorda il suo posto.
- L'indirizzo `trycloudflare.com` cambia a ogni avvio del tunnel. Per un indirizzo fisso serve un tunnel con nome e un dominio su Cloudflare.

Prima della serata conviene lanciare `npm run prova`. Da 2 a 8 giocatori simulati giocano una partita intera su un server di prova, passando per dottrine, battaglie, trasporti, cadute e rientri; il comando esce con errore se qualcosa va storto. Con `--url` gira contro un server già acceso, anche dal tunnel: `npm run prova -- --url https://…trycloudflare.com --giocatori 6 --turni 25`.

Dopo la serata, per le correzioni:

| File | Contenuto |
|---|---|
| `logs/server-AAAA-MM-GG.log` | Registro: partite, giocatori, turni con i tempi di risoluzione, errori |
| `logs/segnalazioni.jsonl` | Segnalazioni dei giocatori (pulsante Segnala) ed errori dei browser, con il contesto |
| `logs/errori/` | Stato della partita da cui riprodurre ogni errore del motore e ogni segnalazione |

## Struttura

| Cartella | Contenuto |
|---|---|
| `packages/engine` | Regole del gioco in TypeScript puro: schemi dei dati, geometria, combattimento, turno, nebbia di guerra |
| `packages/protocol` | Messaggi tra browser e server (validati con zod) |
| `apps/server` | Server Node: stanze, timer, salvataggi, registro, WebSocket su `/ws` |
| `apps/client` | Interfaccia: React per i pannelli, PixiJS per la mappa |
| `data/rules` | Unità, edifici e parametri delle regole (ogni numero del gioco sta qui) |
| `data/maps` | Mappe in JSON: paesi (forme), città, zone invalicabili, scorciatoie |
| `data/mondo` | Configurazione delle mappe reali: inquadratura, paesi, città, montagne, passaggi |
| `data/schema` | JSON Schema generati: danno autocompletamento e controllo in VS Code |
| `tools` | Costruzione delle mappe reali (`tools/mondo`), generatore di mappe inventate, verifica dati, generazione schemi, avvio della serata, prova generale |

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

### Mappe reali

Il mondo e i continenti (`mondo`, `europa`, `asia`, `africa`, `nordamerica`, `sudamerica`, `oceania`) si costruiscono dai dati di [Natural Earth](https://www.naturalearthdata.com/) (pubblico dominio). Questi file in `data/maps/` non si ritoccano a mano: si cambia la configurazione e si ricostruisce.

| File | Contenuto |
|---|---|
| `data/mondo/mappe.json` | Per ogni mappa: proiezione e inquadratura, km per punto di raggio, quante città, distanza minima; in cima le formule di popolazione e reddito |
| `data/mondo/paesi.json` | Paesi esclusi, uniti (es. Somaliland con la Somalia), divisi (Alaska, Hawaii, Guyana francese), nomi |
| `data/mondo/citta.json` | Capitali scelte a mano, nomi, città escluse o sempre incluse |
| `data/mondo/geografia.json` | Zone invalicabili e passaggi (tunnel, ponti, canali, stretti) in longitudine e latitudine |

```bash
npm run mondo:scarica   # solo la prima volta
npm run mondo           # ricostruisce tutte le mappe e le controlla
npm test
```

Il server legge le mappe all'avvio: dopo averle ricostruite va riavviato.
