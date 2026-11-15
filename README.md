# OnPeace

Gioco di conquista a turni sul mondo vero, da browser, per partite dal vivo tra amici (da 2 a 8 giocatori).
Regole, decisioni e architettura: [docs/progetto.md](docs/progetto.md). Cosa resta da fare: [docs/roadmap.md](docs/roadmap.md).

## Requisiti

- Node.js 22 o superiore (sviluppato con Node 24)

## Comandi

```bash
npm install            # dipendenze, più cloudflared per il tunnel se sul PC non c'è già
npm run dev            # server di gioco (porta 3210) + client in sviluppo su http://localhost:5173
npm run build          # compila il client
npm run serata         # serata tra amici: compila, avvia server e tunnel, apre il browser (vedi sotto)
npm run prova          # prova generale: giocatori simulati fanno una partita intera su un server di prova
npm start              # solo il server di produzione: gioco completo su http://localhost:3210
npm run tunnel         # solo il tunnel Cloudflare verso il server già acceso
npm test               # test (motore, server, client, tabellone)
npm run lint           # ESLint
npm run typecheck      # controllo dei tipi su tutto il progetto
npm run data:check     # verifica tabelloni, regole e obiettivi in data/
npm run data:schema    # rigenera i JSON Schema in data/schema/
npm run mondo:scarica  # scarica una volta i dati geografici (Natural Earth) in .cache/
npm run mondo          # ricostruisce i tabelloni da data/mondo/ (oppure: npm run mondo -- mondo)
npm run mondo:anteprima -- mondo anteprima.html   # disegna un tabellone in una pagina HTML per controllarlo
```

Con `npm run dev` si apre anche `http://localhost:5173/prova.html`: una partita vera nel browser contro quattro avversari automatici, senza server (`?da=inizio` parte dall'obiettivo, `?stile=vetro` usa l'altro tema).

## Giocare online tra amici (server sul tuo PC)

Il server gira sul PC di chi ospita; gli amici entrano dal browser con il link d'invito.
Cloudflare Tunnel rende il server raggiungibile da Internet senza aprire porte sul router.

Non serve installare altro: se sul PC non c'è già `cloudflared` (il programma del tunnel), `npm install` lo scarica in `.cache/cloudflared/`, prendendo l'ultima versione ufficiale da GitHub controllata con lo SHA256 pubblicato. Se in quel momento manca Internet, ci riprova `npm run serata`. Per aggiornarlo basta cancellare `.cache/cloudflared/`.

Per ogni serata:

1. `npm run serata` e lascia la finestra aperta. Il comando compila il client se serve, avvia server e tunnel e apre il gioco nel browser.
2. Quando compare «OnPeace è pronto», crea la partita. Il link d'invito della sala d'attesa usa già l'indirizzo pubblico, anche se tu giochi da `localhost`.
3. Manda il link agli amici. Per chiudere tutto: `Ctrl+C` (le partite restano salvate).

Opzioni: `npm run serata -- --locale` (senza tunnel, solo questo PC), `--build` (ricompila comunque), `--no-open` (non apre il browser).

Durante la serata:
- Se il server cade, `npm run serata` lo riavvia: la partita riprende dai salvataggi in `games/` e i browser si ricollegano da soli.
- Chi chiude il browser rientra riaprendo il link: il browser ricorda il suo posto. Finché è fuori, il server gioca al posto suo.
- Se il tunnel si riapre con un indirizzo nuovo, il server scrive nella finestra di `npm run serata` il link nuovo di ogni partita aperta: gli amici rientrano da lì con lo stesso nome (il posto si libera 20 secondi dopo che si sono scollegati). Se non resta nessuno collegato, la partita si ferma finché qualcuno non torna.
- Se il motore va in errore la partita si ferma invece di cadere: l'errore finisce nel registro e l'host (o chiunque sia in partita, se l'host è scollegato) può riprovare con **Riprova**.
- L'host può fermare il tempo con **Pausa**; se si scollega a tempo fermo, chiunque sia ancora in partita può farlo ripartire. In partita l'host può togliere chi ha saltato 2 turni di fila. Ognuno ha la **Guida** («Come si gioca») e il pulsante **Segnala** in alto.
- L'indirizzo `trycloudflare.com` cambia a ogni avvio del tunnel. Per un indirizzo fisso serve un tunnel con nome e un dominio su Cloudflare.

Prima della serata conviene lanciare `npm run prova`. Da 2 a 8 giocatori simulati giocano una partita intera su un server di prova: piazzano, giocano i tris, attaccano, spostano, chattano, mandano mosse sbagliate apposta, cadono e rientrano, e uno esce a metà. Il comando esce con errore se qualcosa va storto. Opzioni: `--giocatori 4 --giri 40 --seme 1 --modo objectives|conquest --territori draft|random --piazzamento rounds|simultaneous --combattimento pairs|hits --pari defender|attacker|reroll-pair|reroll-all --difesa 2|3`. Con `--url` gira contro un server già acceso, anche dal tunnel: `npm run prova -- --url https://…trycloudflare.com --giocatori 6`.

Dopo la serata, per le correzioni:

| File | Contenuto |
|---|---|
| `logs/server-AAAA-MM-GG.log` | Registro: partite che cominciano e finiscono, chi esce o viene tolto, pause, errori |
| `logs/segnalazioni.jsonl` | Segnalazioni dei giocatori (pulsante Segnala) ed errori dei browser, con il contesto |
| `logs/errori/` | Stato della partita da cui riprodurre ogni errore del motore e ogni segnalazione |

## Struttura

| Cartella | Contenuto |
|---|---|
| `packages/engine` | Formato e controlli del tabellone, errori delle regole, numeri casuali |
| `packages/conquista` | Il motore del gioco: preparazione, turni, dadi, carte, obiettivi, vista di ogni giocatore |
| `packages/protocol` | Messaggi tra browser e server (validati con zod) |
| `apps/server` | Server Node: sale, timer, salvataggi, registro, WebSocket su `/ws` |
| `apps/client` | Il gioco nel browser: React per l'interfaccia, Canvas 2D per il tabellone |
| `data/territori` | Tabelloni (generati da `npm run mondo`) |
| `data/conquista` | Regole e obiettivi segreti |
| `data/mondo` | Configurazione dei tabelloni |
| `data/schema` | JSON Schema generati: danno autocompletamento e controllo in VS Code |
| `tools` | Costruzione dei tabelloni (`tools/mondo`), verifica dei dati, generazione degli schemi, avvio della serata, prova generale |

## Modificare regole, obiettivi e tabelloni

Sono tutti file JSON:

| File | Contenuto |
|---|---|
| `data/conquista/regole.json` | Ogni numero del gioco: armate iniziali, rinforzi, dadi, tris, spostamenti, tempi, regola dei primi giri, modalità |
| `data/conquista/obiettivi/<tabellone>.json` | Obiettivi segreti di un tabellone |
| `data/mondo/territori.json` | Tabelloni: inquadratura, continenti col bonus, territori (quali paesi contiene ognuno), collegamenti via mare, confini da togliere |
| `data/mondo/paesi.json` | Paesi esclusi, uniti (es. Somaliland con la Somalia), divisi (Alaska, Hawaii, Guyana francese), nomi |
| `data/mondo/regioni.json` | Paesi grandi divisi in regioni (gruppi di stati e province, per codice ISO 3166-2) e territori riassegnati (Crimea all'Ucraina) |

Dopo una modifica a regole o obiettivi:

```bash
npm run data:check
```

Il comando controlla formato e coerenza: tabellone valido (territori collegati e raggiungibili), abbastanza territori per i giocatori, obiettivi possibili su quel tabellone (continenti esistenti, numeri raggiungibili, obiettivo di riserva valido).

I tabelloni in `data/territori/` non si ritoccano a mano: si cambia la configurazione in `data/mondo/` e si ricostruiscono dai dati di [Natural Earth](https://www.naturalearthdata.com/) (pubblico dominio).

```bash
npm run mondo:scarica   # solo la prima volta
npm run mondo           # ricostruisce i tabelloni e li controlla
npm test
```

Il server legge tabelloni e regole all'avvio: dopo averli cambiati va riavviato.
