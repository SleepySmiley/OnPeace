# OnPeace — Documento di progetto (v0.2)

Gioco di conquista a turni, da browser desktop, per partite dal vivo tra amici (da 2 a 8 giocatori).
Le meccaniche sono quelle dei giochi di conquista da tavolo: rinforzi, attacchi coi dadi, carte da combinare in tris, obiettivi segreti. Nome, tabellone, nomi dei territori e grafica sono nostri; la geografia è quella vera.

Fino al 13 novembre 2026 OnPeace era un altro gioco, a turni simultanei in stile atWar (paesi, città, unità, economia, diplomazia). Il 14 novembre si è cambiato genere: server, sala d'attesa, salvataggi, serata col tunnel, suoni e mappa del mondo sono rimasti, il resto è stato tolto. Quel motore, i suoi dati e la ricerca su atWar stanno nella storia di git (ultimo commit che li contiene: `0509a90`).

Cosa resta da fare: [roadmap.md](roadmap.md).

---

## 1. Decisioni prese

| Tema | Decisione |
|---|---|
| Scopo | Partite tra amici; il gioco evolve nel tempo |
| Piattaforma | Solo browser desktop |
| Genere | Gioco di conquista (dal 14/11/2026); niente nome, tabellone o grafica di giochi esistenti |
| Ritmo | Solo partite dal vivo: un giocatore alla volta, 3 minuti a turno di base |
| Giocatori | Da 2 a 8; gli obiettivi segreti da 3 in su |
| Tabellone | Il mondo di oggi diviso in 47 territori e 6 continenti, costruito dai dati di Natural Earth |
| Regole | Ogni numero sta in `data/conquista/regole.json`, mai nel codice |
| Tabelloni e regole nuove | File JSON scritti da Claude su richiesta; niente editor nel gioco |
| Accesso | Nickname + link d'invito, token di rientro salvato nel browser; niente account |
| Hosting | Server sul PC di uno di noi, gli altri entrano tramite Cloudflare Tunnel |
| Stack | TypeScript ovunque: Node.js + WebSocket, React + Canvas 2D per il tabellone |
| Fuori per ora | Avversari automatici veri (il server gioca solo al posto di chi esce), partita sullo stesso PC, mobile |

---

## 2. Regole

Tutti i valori qui sotto sono quelli di `data/conquista/regole.json` e si cambiano lì.

### 2.1 Inizio della partita
1. **Sala d'attesa.** Chi crea la partita ne è l'host e sceglie: tabellone, modalità (obiettivi segreti o conquista del mondo), come si dividono i territori (scelti a turno o a caso), come si piazzano le armate iniziali (a giri o tutti insieme), la durata del turno (da 30 secondi a 15 minuti) e i dadi: combattimento a coppie o a colpi e, a coppie, che cosa succede ai pari e quanti dadi tira la difesa (§2.2). Gli altri entrano dal link con un nickname e un colore. L'ordine di gioco viene estratto a caso.
2. **Obiettivo.** Ognuno legge il suo obiettivo segreto (30 secondi); si parte quando l'hanno chiuso tutti.
3. **Territori.**
   - *Scelti a turno* (predefinito): in ordine di gioco ognuno prende un territorio libero e ci mette un'armata, finché sono tutti presi; 15 secondi per scelta, poi sceglie il server, vicino ai suoi territori se può.
   - *A caso*: distribuiti a giro con un'armata ciascuno.
4. **Armate iniziali.** Le armate che restano si piazzano sui propri territori:
   - *a giri* (predefinito): in ordine di gioco, 3 per volta, 45 secondi per giro;
   - *tutti insieme*: ognuno le piazza tutte alla cieca e si scoprono insieme quando hanno confermato tutti.

Armate iniziali per numero di giocatori: 2 → 45, 3 → 38, 4 → 32, 5 → 27, 6 → 23, 7 → 20, 8 → 18.

### 2.2 Il turno
Si gioca uno alla volta, in ordine. Ogni turno ha tre fasi:
1. **Rinforzi.** Un'armata ogni 3 territori (mai meno di 3), più il bonus di ogni continente posseduto per intero (Nord America 5, Sud America 2, Europa 5, Africa 3, Asia 7, Oceania 2), più i tris giocati. Si piazzano sui propri territori.
2. **Attacchi**, quanti se ne vuole, da un proprio territorio a uno nemico confinante, per terra o via mare. Chi attacca ha sempre bisogno di un'armata in più dei dadi che tira. I dadi si giocano in due modi, a scelta dell'host:
   - **A coppie** (predefinito): l'attaccante tira da 1 a 3 dadi, il difensore uno per armata fino a 3 (o fino a 2, se l'host lo sceglie). Si confrontano in ordine dal più alto: per ogni coppia perde un'armata chi ha il dado più basso. Ai pari, a scelta: vince il difensore (predefinito), vince l'attaccante, si ritirano solo i due dadi pari, o si ritira tutto il lancio; ritirando si rifà finché il pari non c'è più. Se il territorio resta vuoto è conquistato e ci si spostano da tante armate quanti erano i dadi a tutte meno una.
   - **A colpi**: l'attaccante tira fino a 9 dadi, il difensore uno per armata fino a 9. Ogni dado con 4, 5 o 6 è un colpo e toglie un'armata all'altro, da tutte e due le parti insieme; l'attaccante perde al massimo le armate che ha mandato. Se cadono tutti da tutte e due le parti, il territorio resta al difensore con un'armata. Conquistato il territorio, ci entrano almeno le armate che hanno tirato e sono sopravvissute. Il numero del colpo e i dadi massimi stanno in `regole.json` (`dice.hits`).
3. **Spostamento.** Uno solo, tra due propri territori confinanti, lasciando almeno un'armata.

A fine turno, chi ha conquistato almeno un territorio pesca una carta.

### 2.3 Carte e tris
- Il mazzo ha una carta per territorio (fanteria, cavalleria o artiglieria, in parti quasi uguali) più 2 jolly. Finito il mazzo, si rimescolano gli scarti.
- Nei rinforzi si giocano i tris: tre artiglierie 4 armate, tre fanterie 6, tre cavallerie 8, una per tipo 10, jolly più due uguali 12. Ogni carta del tris che mostra un proprio territorio dà 2 armate in più.
- Chi elimina un giocatore ne prende le carte.

### 2.4 Obiettivi e vittoria
- **Obiettivi segreti** (predefinita, da 3 giocatori): vince chi completa il suo obiettivo durante il proprio turno. Per il mondo ce ne sono 10 (`data/conquista/obiettivi/mondo.json`): conquistare un certo numero di territori (anche con un minimo di armate in ciascuno), conquistare due o tre continenti (a volte uno a scelta), eliminare un giocatore (se lo elimina un altro prima, si passa a conquistare 26 territori).
- **Conquista del mondo**: vince chi resta solo.
- In tutte e due vince chi resta l'ultimo in gioco.
- **Nessuna eliminazione nei primi 4 giri**: finché non sono finiti non si può attaccare l'ultimo territorio di un giocatore.
- Ognuno vede tutto il tabellone ma, degli altri, solo quante carte hanno; gli obiettivi si scoprono a fine partita.

### 2.5 Tempo, assenze e pause
- Il tempo scorre solo per chi deve muoversi. Ogni tiro di dadi ridà 3 secondi a chi attacca (al massimo 60 per turno): guardare la battaglia non mangia il turno.
- A tempo scaduto il server fa quello che manca (piazza i rinforzi, decide l'occupazione) e passa al prossimo.
- Chi esce o perde la connessione resta sul tabellone e il server gioca al posto suo; riaprendo il link rientra. L'host può togliere chi ha saltato 2 turni di fila.
- L'host può fermare il tempo con **Pausa**; alla ripresa restano almeno 15 secondi.

---

## 3. Architettura tecnica

### 3.1 Struttura del repository (monorepo con npm workspaces)

| Cartella | Contenuto |
|---|---|
| `packages/engine` | Quello che hanno in comune tutti: formato e controlli del tabellone, errori delle regole, numeri casuali per test e prove |
| `packages/conquista` | Il motore del gioco: regole, carte, obiettivi, vista di ogni giocatore |
| `packages/protocol` | Messaggi tra browser e server, validati con zod |
| `apps/server` | Server Node: sale, timer, salvataggi, registro, WebSocket su `/ws` |
| `apps/client` | Il gioco nel browser: React per l'interfaccia, Canvas 2D per il tabellone |
| `data/territori` | Tabelloni (generati, non si ritoccano a mano) |
| `data/conquista` | Regole e obiettivi di ogni tabellone |
| `data/mondo` | Configurazione dei tabelloni: inquadratura, paesi, regioni, territori, collegamenti via mare |
| `data/schema` | JSON Schema generati: autocompletamento e controllo dei JSON in VS Code |
| `tools` | Costruzione dei tabelloni (`tools/mondo`), verifica dei dati, schemi, serata, prova generale |

### 3.2 Motore (`packages/conquista`)
- Funzioni pure: stato + azione → nuovo stato + eventi. Le azioni sono 10 (pronto, scelta di un territorio, piazzamento iniziale, tris, rinforzi, attacco, occupazione, fine attacchi, spostamento, fine turno); ognuna sbagliata viene rifiutata con un messaggio per il giocatore.
- Il caso usa un generatore da 128 bit (sfc32) seminato con numeri casuali veri e salvato nella partita: le partite sono riproducibili, ma da quello che si vede non si possono indovinare obiettivi, mazzo o dadi futuri.
- `passFor` e `timeout` fanno al posto di un giocatore quello che manca: le usa il server per il tempo scaduto e per chi è uscito.
- `viewFor` prepara quello che un giocatore può vedere (§2.4).

### 3.3 Tabellone (`data/territori/*.json`)
- Contiene: dimensioni, continenti (nome, bonus, dove scriverli), territori (continente, forma, dove mettere la pedina e il nome), collegamenti (via mare con la linea da disegnare, anche quella che esce da un bordo e rientra dall'altro), rosa dei venti e proiezione (Miller, per le immagini della Terra).
- Il formato e i controlli (id unici, continenti esistenti, ogni territorio collegato e raggiungibile) stanno in `packages/engine`; il motore li ripete quando carica un tabellone, insieme a regole e obiettivi.
- Si costruisce con `npm run mondo` dai dati di Natural Earth (`tools/mondo`): sistema i paesi (`data/mondo/paesi.json`), divide i paesi grandi in regioni (`data/mondo/regioni.json`), proietta e ritaglia il mondo, toglie le isolette, unisce i paesi minuscoli al vicino, poi raggruppa i paesi in territori secondo `data/mondo/territori.json`. I confini per terra si ricavano dai paesi che si toccano; quelli via mare sono scritti nella configurazione.
- `npm run mondo:anteprima` ne disegna una pagina HTML per controllarlo senza aprire il gioco.

### 3.4 Server (`apps/server`)
- **Autoritativo**: il client manda le mosse, il server le valida col motore, le salva e manda a ognuno la sua vista e gli eventi.
- **Persistenza**: un file JSON per partita in `games/`, scritto in modo atomico a ogni mossa; se il PC si riavvia la partita riprende. Un salvataggio bloccato (OneDrive, antivirus) viene ritentato.
- **Rete**: un solo processo e una sola porta (3210) servono il client compilato, i tabelloni (compressi) e il WebSocket su `/ws`.
- **Accesso**: link `/p/<codice>` e token salvato nel browser per rientrare.
- **Robustezza**: un errore su un messaggio o nel timer viene registrato e non ferma il server; tetti al numero di partite e di segnalazioni; al riavvio si cancellano le partite finite e le sale mai partite ferme da più di una settimana.
- **Registro** in `logs/`: un file al giorno, `errori/` con lo stato da cui riprodurre ogni errore, `segnalazioni.jsonl` con le segnalazioni dei giocatori.

### 3.5 Client (`apps/client`)
- **Tabellone** su Canvas 2D a due strati: quello fisso (mare, territori, confini) si ridisegna solo quando cambiano vista o padroni, quello sopra a ogni fotogramma (selezione, frecce, pedine, nomi). Contorni semplificati a seconda dello zoom; sotto, le foto della Terra (NASA) riproiettate. Due temi: Tavolo classico e Vetro.
- **Pedine**: un carro armato di lato nel colore del padrone, col numero di armate sullo scafo, girato verso il nemico più vicino. I territori su cui si può agire adesso hanno un contorno che pulsa.
- **Schermata di gioco** (una sola disposizione): giocatori in alto a sinistra; al centro della barra in alto chi gioca, le fasi del turno e il tempo; barra dei comandi in basso; carte e obiettivo in mano in basso a sinistra; registro e chat in un cassetto a destra. Una fascia annuncia il turno e le fasi, quello che fanno gli altri compare sui territori.
- **Scene**: carta dell'obiettivo all'inizio, battaglia coi carri e i dadi 3D, pesca della carta a fine turno.
- **Suoni** sintetizzati nel browser (Web Audio, nessun file).
- **Pagine di prova** (con `npm run dev`): `prova.html` è una partita vera nel browser contro 4 avversari automatici, senza server (le opzioni della sala d'attesa si danno nell'indirizzo: `?combattimento=coppie|colpi`, `?pari=difesa|attacco|coppia|tutto`, `?difesa=2|3`, `?territori=turno|caso`, `?piazzamento=giri|insieme`); `tabellone.html`, `carta.html`, `battaglia.html` e `pesca.html` mostrano un pezzo alla volta.

### 3.6 Hosting sul PC di casa
- `npm run serata` (`tools/serata.ts`) fa tutto con un comando: compila il client se serve, avvia server e Cloudflare Tunnel, passa al server l'indirizzo pubblico per il link d'invito, riavvia il server se cade e riapre il tunnel se si chiude. Istruzioni nel README.
- Il tunnel rapido è gratuito ma cambia indirizzo a ogni avvio; per un indirizzo fisso serve un tunnel con nome e un dominio.

### 3.7 Test
- **Vitest**: regole del motore (con dadi e mazzo forzati), partite casuali fino alla fine, server (sala d'attesa, turni, tempo, pausa, rientro, chi esce), controlli del tabellone, pesca delle carte nel client.
- **Prova generale** (`npm run prova`): da 2 a 8 giocatori simulati giocano una partita intera via WebSocket contro un server vero, con mosse sbagliate apposta, cadute e rientri, e uno che esce a metà.
- **Nel browser**: controlli con Playwright (`playwright-cli`) su `prova.html`.

---

## 4. Storia

| Tappa | Contenuto |
|---|---|
| **M0–M9** ✅ | Il primo gioco, in stile atWar, e l'infrastruttura che è rimasta: server con sale e salvataggi, link d'invito e rientro, serata col tunnel, guida, pausa e segnalazioni, prova generale, mappa del mondo da Natural Earth con i paesi grandi divisi in regioni, suoni. Prima serata tra amici il 9 novembre 2026 |
| **M10** ✅ | Tabellone a territori (47 territori, 6 continenti) dal mondo reale; temi Tavolo classico e Vetro |
| **M11** ✅ | Motore del gioco di conquista (`packages/conquista`): preparazione, turni, carte, obiettivi, regola dei primi giri, piazzamento alla cieca, seme a 128 bit |
| **M12** ✅ | La partita nel browser: sale sul server, schermata di gioco, tabellone senza scatti, inizio con obiettivo e territori scelti a turno, barra dei comandi, battaglia coi carri, carri sul tabellone, tempo restituito a ogni tiro, pesca delle carte, mappa leggibile, cosa fare adesso. Chiusa con la pulizia del vecchio gioco (motore, mappe e regole, strumenti, ricerca) |

---

## 5. Da decidere più avanti
- Bilanciamento dopo le prime partite: bonus dei continenti, obiettivi, armate iniziali.
- Altri tabelloni (per esempio un continente solo) o un mondo diviso in modo diverso: bastano una voce in `data/mondo/territori.json` e un file di obiettivi.
- Avversari automatici veri per giocare in pochi o da soli.
- Le cose lasciate indietro di proposito sono elencate in fondo alla [roadmap](roadmap.md).
