# OnPeace — Documento di progetto (v0.1)

Gioco di strategia multiplayer a turni simultanei, da browser desktop, per partite dal vivo tra amici (5–8 giocatori).
Le meccaniche riprendono quelle di atWar (ricerca completa in [ricerca/](ricerca/)); nome, grafica, mappe, nomi di strategie e unità rare sono nostri.

---

## 1. Decisioni prese

| Tema | Decisione |
|---|---|
| Scopo | Partite tra amici; il gioco evolverà nel tempo |
| Piattaforma | Solo browser desktop |
| Regole | Fedeli ad atWar, poi ritocchiamo. Ogni numero sta in file di configurazione |
| Ritmo | Solo partite dal vivo, turni da 1 a 12 minuti |
| Giocatori | Di solito 5–8; mappa media |
| Contenuti v1 | Base + strategie + edifici + unità rare |
| Fuori dalla v1 | Bot/IA, progressione persistente, partite lunghe, editor in gioco, account, mobile |
| Mappe | File JSON creati e modificati da Claude su richiesta |
| Accesso | Nickname + link d'invito, codice di rientro salvato nel browser |
| Hosting | Server sul PC di uno di noi, gli altri entrano tramite tunnel |
| Stack | TypeScript: Node.js + WebSocket, PixiJS per la mappa, React per i pannelli |
| Tema e nome della mappa base | Da decidere dopo il prototipo |

---

## 2. Regole della v1

Riferimenti tra parentesi quadre: `[R1 §x]` = [ricerca/01-regole-core.md](ricerca/01-regole-core.md), `[R2 §x]` = [ricerca/02-unita-combattimento.md](ricerca/02-unita-combattimento.md), `[R3 §x]` = [ricerca/03-multiplayer-meta.md](ricerca/03-multiplayer-meta.md).

### 2.1 Flusso della partita
1. **Sala d'attesa**: chi crea la partita sceglie le opzioni (§2.11) e condivide il link. Gli altri entrano con un nickname, scelgono il colore e premono "Pronto".
2. **Selezione paesi**: a rotazione, 30 s per scelta. Ogni paese costa il suo "valore" e si paga con i fondi iniziali. Il primo paese scelto è il **paese natale**. Qui si sceglie anche la **strategia**, che resta fissa per tutta la partita. [R1 §1.3]
3. **Turni**: tutti pianificano in contemporanea. Il turno finisce allo scadere del timer o quando tutti hanno premuto "Fine turno". [R1 §1.4]
4. **Risoluzione** delle azioni (§2.2), poi la lista dei combattimenti con il replay.
5. **Fine partita** (§2.10), con schermata riepilogativa e grafici.

Al turno 1 tutti sono in pace tra loro; i paesi neutrali sono attaccabili da subito. [R1 §7.2]

### 2.2 Risoluzione del turno (fedele ad atWar) [R1 §1.5–1.6]
- **Inizio turno**, in quest'ordine:
  1. risposte alle proposte diplomatiche;
  2. rilevamento delle unità stealth;
  3. incasso del reddito e pagamento del mantenimento;
  4. ogni 4 turni, ricarica dei rinforzi.
- **Pianificazione**: ogni giocatore produce una lista **ordinata** di azioni (acquisti, movimenti/attacchi, carico e scarico, diplomazia, invio di denaro, cessione di città). Tutti gli acquisti fatti in una stessa città contano come una sola azione.
- **Esecuzione**: il server estrae a caso un giocatore che ha ancora azioni ed esegue la sua prossima azione; ripete finché le liste sono vuote. Il caso usa un RNG con seme registrato, così ogni turno è riproducibile.
- **Intercettazione (turnblock)**: se l'attacco viene risolto prima che la pila bersaglio si sposti, la pila resta bloccata. Si usa la formula di Dave (2021):
  - una pila con 3 unità o meno resta sempre bloccata;
  - altrimenti scappa se `rand() > (unità attaccanti / unità bersaglio) × 2`;
  - le unità caricate sui trasporti non contano;
  - le linee difensive proteggono dal blocco.
- Se il blocco fallisce e l'attaccante ha ancora raggio sufficiente, insegue e combatte; altrimenti si ferma come in un movimento normale.

### 2.3 Economia [R1 §2]
- **Reddito**: arriva solo dalle città, più un bonus del 20% per chi possiede un paese intero.
- **Città "tue"**: sono le città di un paese di cui controlli la capitale.
  - Dopo la conquista rendono il 50%, poi salgono del 25% a turno fino al 100%.
  - Oltre il 100% salgono del 2% a turno, fino al 150%.
- **Città "straniere"**: sono quelle di un paese di cui non controlli la capitale.
  - Partono dal 10% e salgono del 5% a turno fino al 50%.
  - Non producono unità.
- A ogni cambio di proprietario il reddito della città **riparte da capo**.
- Reddito e rinforzi sono proporzionali alla **popolazione** della città. Gli attacchi la riducono con il danno collaterale.
- **Mantenimento**: ogni unità costa 1/10 del suo prezzo a ogni turno. Le unità rare non pagano mantenimento.
- Il denaro si può inviare solo agli alleati.

### 2.4 Produzione [R1 §3]
- Si compra solo nelle città di paesi di cui si controlla la capitale; le unità navali solo nei porti.
- **Doppio vincolo**: servono denaro e "rinforzi" disponibili in città. Ogni unità comprata consuma un rinforzo.
  - I rinforzi dipendono dalla popolazione, fino a un massimo di 7 per città.
  - Si ricaricano a inizio partita e poi ogni 4 turni.
- Le unità comprate compaiono subito e possono muoversi nello stesso turno. Un'unità non ancora mossa si può rivendere entro il turno.
- Chi conquista una città riceve subito **Milizie gratuite**, tante quanti i rinforzi di quella città.
- Edifici: al massimo uno per tipo in ogni città (§2.9).

### 2.5 Mappa e movimento [R1 §4, R2 §3]
- La mappa è fatta di **paesi**, ognuno con una **capitale** e più città. Il movimento è **libero entro un raggio**, senza griglia.
- Si può spezzare il percorso in più tratti, purché resti raggio disponibile.
- Se in una pila ci sono unità con raggi diversi, la pila usa la **media** dei raggi.
- Terra, mare e aria si muovono come gruppi separati.
- Le unità di terra non entrano in mare senza trasporto; quelle navali stanno in mare o nei porti.
- **Zone invalicabili**: solo gli aerei le attraversano, e non possono fermarcisi dentro.
- **Scorciatoie**: brevi tratti di mare attraversabili da truppe di terra, o di terra attraversabili dalle navi.
- **Linee difensive**: due pile di terra (o due navali non stealth) vicine tra loro formano un muro.
  - Un nemico in guerra non può attraversarlo senza attaccare.
  - In pace e tra alleati si passa liberamente.
- In guerra si possono attraversare le pile nemiche fuori dalle città, salvo quelle che formano un muro.
- **Conquista**: si entra in una città nemica o neutrale e si vince la battaglia.
  - Gli aerei non conquistano: distruggono le unità e restano accanto alla città.
  - I sottomarini non conquistano senza truppe a bordo.

### 2.6 Combattimento [R2 §4]
- **Attacco e difesa** sono il danno **massimo** di un colpo. Ogni colpo è un tiro da 1 a quel valore.
- **Critico**: con probabilità pari a Crit% (di solito 5%) si aggiunge al tiro il valore massimo.
- **Ordine di combattimento**:
  - nell'attaccante colpisce per prima l'unità con l'attacco più alto;
  - nel difensore incassa per prima l'unità con la difesa più alta;
  - il danno in eccesso passa all'unità successiva.
- **Scambi**: i colpi sono simultanei e si continua fino a eliminare una delle due parti. Se le ultime due unità si distruggono a vicenda, vince il difensore. A fine battaglia i superstiti tornano a pieni HP.
- **Vantaggio della pila più forte** (formula ricostruita dalla community):
  - Rapporto di forza: `D = (att totale + n attaccanti) / (dif totale + n difensori + bonus)`, ricalcolato a ogni scambio.
  - Il lato più debole tira con un riduttore: se D > 1 il riduttore del difensore è `(D+1)/(2D)`; altrimenti quello dell'attaccante è `(D+1)/2`.
  - Il tiro col riduttore segue una distribuzione geometrica troncata che favorisce i valori bassi.
- **Bonus "contro X"** (es. contraerea +8 contro aerei): si sommano alla difesa massima e alla formula di D. *Provvisorio.*
- **Attacco reciproco**: se due pile si attaccano a vicenda, le unità si alternano tra attacco e difesa.
- **Città**: nelle proprie città si difende sempre.
- **Trasporti**: il carico non combatte e muore se il trasporto viene distrutto.

### 2.7 Visibilità [R1 §5]
- Ogni unità ha un raggio visivo; le città vedono attorno a sé.
- Fuori dal raggio visivo si vede l'icona di una pila nemica, ma non quante unità contiene né di che tipo. Città e proprietari sono sempre visibili. *Provvisorio, facile da cambiare.*
- **Unità stealth**:
  - sono invisibili finché non vengono rilevate a inizio turno o finché non combattono;
  - dopo una battaglia tornano invisibili solo rientrando in una propria città.
- Gli alleati vedono tutto ciò che vedono gli altri alleati.
- Il server invia a ogni giocatore **solo** ciò che quel giocatore può vedere: niente informazioni nascoste nel client.

### 2.8 Diplomazia [R1 §7]
- I rapporti possibili sono guerra, pace e alleanza.
- Pace e alleanza richiedono il consenso dell'altro giocatore, che risponde a inizio turno; l'alleanza si chiede solo partendo dalla pace.
- Per tornare in guerra serve preavviso: 1 turno dalla pace, 2 turni dall'alleanza.
- Tra alleati si condivide la visione, si invia denaro, ci si cede città vuote e si può vincere insieme.
- Nelle partite a squadre le alleanze sono fisse.
- Opzione "massimo alleanze" per giocatore (default 3; 0 = diplomazia disattivata).

### 2.9 Contenuti
- **Unità base**: si usano le statistiche di atWar ([R2 §2]: attacco, difesa, critico, HP, movimento, vista, costo, capacità, collaterale, bonus), con nomi italiani:

  | Gruppo | Unità |
  |---|---|
  | Terra | Milizia, Fanteria, Carri, Incursori (stealth), Contraerea |
  | Mare | Sottomarino (stealth), Trasporto, Cacciatorpediniere |
  | Aria | Bombardiere, Elicottero, Caccia stealth, Ricognitore, Trasporto aereo |

  Senza progressione persistente, tutte le unità sono disponibili da subito.
- **Edifici**: Banca, Centro di reclutamento, Radar, Batteria costiera, Difese antiaeree, Fortificazioni [R2 §2.5].
- **Strategie** (`data/rules/strategies.json`): una per giocatore, nomi militari realistici, valori di partenza da [R2 §5]. Sono 10: Assalto a oltranza, Difesa in profondità, Guerra lampo, Supremazia navale, Supremazia aerea, Operazioni speciali, Mobilitazione di massa, Guerriglia, Potenza industriale, Logistica avanzata. Modificano solo le unità acquistabili e gli edifici, non le rare né il Generale.
- **Generale** (`data/rules/general.json`): uno per giocatore, compare nella capitale del paese natale al turno 1. È 1/1 con 1 HP: da solo è debolissimo e, se muore, è perso. Dà alla sua pila 3 potenziamenti scelti a inizio partita tra 11, ispirati agli upgrade di atWar [R2 §3.8]; i posti lasciati vuoti si riempiono con Difesa, Fortuna in battaglia e Ricognizione.
- **Unità rare** (in `units.json`, `"rare": true`): 30 tipi ispirati a [R2 §3.9], con nomi nostri, nucleari comprese. Si trovano conquistando le città (probabilità impostabile), estratte per peso (`rareWeight`): la testata nucleare è la più rara. Le navi compaiono solo nei porti. Non pagano mantenimento e non si comprano.

### 2.10 Vittoria e uscita [R1 §6]
- **Condizioni** (impostazione della partita):
  - annientamento totale: si è eliminati quando si perdono tutte le città;
  - conquista del paese natale o della capitale;
  - limite di turni (default 50), allo scadere del quale vince chi ha più punti.
- **Punti in partita**: valore delle unità distrutte e delle città conquistate. Servono solo come spareggio, non c'è progressione tra partite.
- **Uscita**:
  - la resa è possibile;
  - chi si disconnette ha 10 minuti per rientrare, poi è considerato assente: le sue unità restano ferme, reddito e mantenimento continuano;
  - l'host può espellere chi è assente da almeno 3 turni, e i suoi territori diventano neutrali. *Provvisorio.*

### 2.11 Opzioni di creazione partita (v1)
- Mappa;
- giocatori massimi;
- durata del turno (1–12 min);
- fondi iniziali;
- paesi iniziali per giocatore;
- durata della partita in turni;
- condizione di vittoria;
- massimo alleanze;
- tutti contro tutti oppure 2–4 squadre;
- probabilità di unità rare (nessuna, 2, 5, 10 o 20%);
- strategie attive o disattivate;
- Generale sì o no;
- ingresso tardivo fino al turno N.

### 2.12 Lacune della ricerca → decisioni provvisorie
Dove atWar non è documentato decidiamo noi. Tutti i valori qui sotto sono parametri in `data/rules/`.

| Lacuna | Decisione provvisoria |
|---|---|
| Tetto del reddito: 150% o 200%? | 150% (valore della FAQ ufficiale) |
| Saldo negativo | Il mantenimento può portare il saldo sotto zero; con il saldo negativo non si compra |
| Rinforzi non usati | Non si accumulano: a ogni ricarica si torna al valore della città |
| Banca: −1 o −10? | −1 sul mantenimento delle unità prodotte in quella città (è il valore misurato in gioco) |
| Battaglie con 3 o più pile | Non servono regole apposite: ogni azione genera scontri a due in ordine di esecuzione; più pile difensive nella stessa città si fondono |
| Neutrali | Passivi. Difesi da Milizie (pari ai rinforzi) e da Fanteria nei paesi ricchi; nessun rinforzo |
| Danno collaterale | Popolazione persa per battaglia = somma dei collaterali degli attaccanti, in punti %, con un tetto del 50%; recupero del 2% a turno |
| Nebbia di guerra | Vedi §2.7 |

### 2.13 Decisioni prese costruendo il motore (M1)
Tutte provvisorie; i numeri sono in `data/rules/defaults.json`.

| Tema | Decisione |
|---|---|
| Ordini di movimento | Le unità si scelgono per tipo e quantità, come i cursori di atWar. La pila si indica per id, città o posizione, così si muovono anche le unità appena comprate |
| Edifici | Sono unità immobili da 20 HP che difendono la città; incassa per primo chi ha la difesa più alta contro l'attaccante, quindi la Batteria costiera protegge dalle navi. Se la città cade, sono distrutti |
| Attacco reciproco | Una sola battaglia, in cui chi attacca e chi difende si scambiano a ogni colpo |
| Fuga dall'intercettazione | La pila che scappa esegue subito il suo movimento; l'attaccante la insegue se ha raggio, altrimenti fa un movimento normale |
| Rottura dell'alleanza | Pace dal turno dopo, guerra dopo 2 turni |
| Proposte diplomatiche | Si possono accettare o rifiutare nel turno successivo, poi scadono |
| Eliminazione | Le città tornano neutrali, le truppe nelle città diventano presidi neutrali, le altre si sciolgono |
| Muri | Bloccano terra e mare, non gli aerei; partire o arrivare su un estremo del muro non conta come attraversamento |
| Invisibilità | Per ora si perde solo combattendo e si recupera rientrando in una città propria. Il rilevamento col raggio visivo arriva con la nebbia di guerra (M3) |
| Punteggio | Costo delle unità distrutte × 0,1, +10 per città conquistata, +25 per capitale |
| Neutrali | Milizie pari ai rinforzi della città, più 1 Fanteria per città nei paesi con reddito ≥ 500 |
| Scelta dei paesi | Valore = reddito nominale + rinforzi × 10; fondi iniziali 2500 |

### 2.14 Decisioni prese con i contenuti (M5)
Tutte provvisorie, nei file di `data/rules/`.

| Tema | Decisione |
|---|---|
| Dottrina | Strategia e potenziamenti del Generale si scelgono in sala d'attesa o durante la scelta dei paesi; si bloccano al turno 1. Fino ad allora sono segrete, poi la strategia è pubblica e i potenziamenti li vedono solo gli alleati |
| Formato delle strategie | Modificatori per unità, ruolo, dominio o "tutte": prima `set` (valore fissato), poi `add` (valore sommato), più bonus di difesa contro certe unità. Gli edifici hanno modificatori propri |
| Bonus di comando | Generale e comandanti rari (Ufficiale di campo, Maresciallo dell'aria, Ammiraglio) danno bonus alle unità del loro gruppo: in attacco quelle che si muovono con loro, in difesa la loro pila. Più copie dello stesso comandante non si sommano |
| Difesa situazionale | Nuovi campi `cityDefence` e `lineDefence`: difesa extra (o malus) quando si difende in una città propria o in una linea difensiva |
| Armi a uso singolo | Missili, testata nucleare e Guastatori non subiscono danni durante il proprio attacco e si consumano alla fine; la loro perdita non dà punti al nemico. Senza questa regola, con 1 HP, morirebbero al primo scambio e "vince il difensore" lascerebbe sempre un superstite |
| Cecchini | Attaccando colpiscono per primi Generale e comandanti (`hunts`) |
| Nomi | Le rare di atWar dal nome poco adatto sono state sostituite: Guastatori al posto dell'attentatore suicida, Volontari al posto dei bambini soldato; la testata finta è stata tolta |

---

## 3. Architettura tecnica

### 3.1 Struttura del repository (monorepo con npm workspaces)
```
OnPeace/
  packages/engine/     regole pure in TypeScript: nessun I/O, RNG con seme, testabile
  packages/protocol/   tipi dei messaggi client↔server + validazione (zod)
  apps/server/         Node, WebSocket (ws), stanze, timer, salvataggi JSON
  apps/client/         Vite + React (pannelli, lobby) + PixiJS 8 (mappa)
  data/rules/          unità, edifici, parametri predefiniti (JSON); poi strategie e rare
  data/maps/           mappe (JSON)
  data/schema/         JSON Schema generati dagli schemi zod (autocompletamento in VS Code)
  tools/               generatore di mappe, verifica dei dati, generazione schemi
  docs/
```

### 3.2 Motore delle regole (`packages/engine`)
- **Stato** serializzabile in JSON: giocatori, paesi, città, pile, diplomazia, turno, seme.
- **Funzioni principali**:
  - `validateAction(state, playerId, action)`: usata sia dal client (anteprima) sia dal server (verifica);
  - `resolveTurn(state, actionsByPlayer, seed)`, che restituisce `{ state, events }`. Gli eventi descrivono tutto ciò che è successo, compresi i singoli colpi dei combattimenti: servono per il replay delle battaglie e per il registro del turno;
  - `viewFor(state, playerId)`: la proiezione con la nebbia di guerra applicata.
- **Regole guidate dai dati**: statistiche e parametri vengono da `data/rules/`, il codice non contiene numeri fissi.

### 3.3 Formato mappa (`data/maps/*.json`)
- **Contenuto**:
  - dimensioni e scala, cioè quante unità della mappa vale 1 punto di raggio;
  - paesi, con forma (multipoligono) e capitale. La terra è l'unione dei paesi: tutto il resto è mare. Il valore del paese si calcola dalle sue città;
  - città, con posizione, paese, popolazione, reddito nominale e flag porto;
  - zone invalicabili e scorciatoie.
- Validato da uno **JSON Schema**, così le modifiche fatte da Claude si controllano subito.
- **Validazione dei percorsi**: all'avvio della partita il server converte i poligoni in una griglia di navigazione (terra/mare/invalicabile) e controlla ogni tratto di percorso campionandolo.
- **Linee difensive**: segmenti calcolati tra pile alleate vicine; un percorso nemico che ne interseca uno si ferma e deve attaccare.

### 3.4 Server (`apps/server`)
- **Autoritativo**: il client invia azioni, il server le valida e le salva subito. Se un giocatore ricarica la pagina, non perde nulla.
- **Gestione del turno**: timer gestito dal server; "Fine turno" anticipato quando tutti hanno finito; risoluzione con il motore; invio a ciascuno della propria vista più gli eventi visibili.
- **Persistenza**: un file JSON per partita in `games/`, scritto in modo atomico a ogni azione (piani compresi). Se il PC si riavvia, la partita riprende. (SQLite scartato: il modulo nativo non si installa con gli script npm bloccati, e i file JSON bastano.)
- **Rete**: un solo processo e una sola porta (3210) servono sia il client compilato sia il WebSocket su `/ws`. È ciò che serve per il tunnel.
- **Accesso**: link `/p/<idPartita>` e token casuale salvato nel browser per rientrare. Chi crea la partita ne è l'host.
- **Interfaccia di attesa**: mostra in ogni momento chi ha già finito il turno e chi stiamo aspettando. È una delle lamentele principali su atWar.

### 3.5 Client (`apps/client`)
- **Mappa con PixiJS 8**, a strati:
  1. sfondo, mare e terra;
  2. confini e colori dei proprietari;
  3. città;
  4. pile;
  5. raggi di movimento e di visione;
  6. percorsi pianificati.

  Zoom e spostamento con la rotellina e il trascinamento.
- **Pannelli React** flottanti e trascinabili: Città, Muovi truppe, Combattimento (replay), Eventi, Giocatori/Diplomazia, Finanze, chat. Barra in basso con turno, saldo, timer e "Fine turno".
- **Motore condiviso**: il client lo usa per l'anteprima (raggi, costi, percorsi validi), ma decide sempre il server.

### 3.6 Hosting sul PC di casa
- Il server gira sul PC dell'host (`npm start`) e **Cloudflare Tunnel** (`npm run tunnel`) lo espone su HTTPS senza aprire porte del router. Istruzioni nel README.
- Il tunnel rapido (`cloudflared tunnel --url http://localhost:3000`) è gratuito ma cambia indirizzo a ogni avvio. Un tunnel con nome e un dominio proprio danno invece un indirizzo fisso.
- La partita esiste solo mentre il PC è acceso; grazie a SQLite riprende dopo un riavvio.

### 3.7 Test
- **Vitest sul motore**:
  - test "dorati" con tiri forzati, per esempio l'esempio ufficiale "1 Carro contro Fanteria + Milizia" [R2 §4.3];
  - simulazioni Monte Carlo per confrontare le medie con i dati della ricerca, per esempio il danno medio del Carro ≈ 4,90 [R2 §4.4];
  - test di risoluzione del turno con seme fisso.
- **Playwright** per i flussi principali: creare la partita, entrare dal link, giocare un turno.

---

## 4. Piano di sviluppo

| Tappa | Contenuto | Risultato visibile |
|---|---|---|
| **M0 Fondamenta** ✅ | Monorepo, TypeScript, lint, test; schemi JSON; dati delle unità; **mappa di prova inventata** (12 paesi, 60 città) | La mappa disegnata nel browser |
| **M1 Motore** ✅ | Economia, acquisti, movimento con validazione geometrica, linee difensive, combattimento, risoluzione del turno con turnblock, diplomazia, vittoria; test | Test verdi e simulazioni |
| **M2 Sandbox** ✅ | Client con mappa e pannelli base che usa il motore in locale (più giocatori sullo stesso PC) | Si gioca un turno completo sullo stesso PC |
| **M3 Multiplayer** ✅ | Server, link d'invito, sala d'attesa, selezione paesi, timer, nebbia filtrata, chat, riconnessione, salvataggio | Partita vera tra più browser |
| **M4 Interfaccia completa** ✅ | Replay delle battaglie, eventi, diplomazia, finanze, registro del turno, "chi stiamo aspettando", schermata di fine partita | Partita completa dall'inizio alla fine |
| **M5 Contenuti** ✅ | Strategie, Generale, unità rare (gli edifici erano già in M1) | Varietà e bilanciamento |
| **M6 Serata di prova** | Avvio sul PC con il tunnel, guida rapida per gli amici, correzioni | Prima partita tra amici |

---

## 5. Da decidere più avanti
- Tema, nome e mappa definitiva (dopo il prototipo).
- Bilanciamento di strategie, potenziamenti del Generale e rare, dopo le prime partite.
- Voto sulle impostazioni durante la partita, spettatori, replay completo dell'intera partita: tutti facili da aggiungere grazie al registro degli eventi.
- Bot che sostituiscano gli assenti (fuori dalla v1).
