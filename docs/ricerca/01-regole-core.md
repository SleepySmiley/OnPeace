# 01 — Regole core di atWar (riferimento di design)

> Ricerca svolta l'8 novembre 2026 su fonti pubbliche. Serve solo come **riferimento sulle meccaniche**: nessun asset, testo o grafica di atWar va riusato nel nostro gioco.

## Come leggere questo documento

Ogni affermazione porta un'etichetta di affidabilità e un rimando a una fonte, elencata in fondo (sezione 10):

| Etichetta | Significato |
|---|---|
| **[UFFICIALE]** | FAQ ufficiale, pagine del sito, note di rilascio o post degli sviluppatori/admin (Ivan, Amok, Dave, brianwl). |
| **[COMUNITÀ]** | Guide o test di giocatori e moderatori, senza conferma degli sviluppatori. |
| **[DEDOTTO]** | Ragionamento nostro, basato sulle fonti citate. Da verificare. |
| **[INCERTO]** | Fonti in contraddizione tra loro, oppure informazione forse superata. |

**Attenzione sull'età delle fonti.** La FAQ ufficiale è ancora online nel 2026, ma il testo risale all'epoca in cui il gioco si chiamava "Afterwind" (2010-2012): lo dice il testo stesso ("Finances play an important part in Afterwind") [F-15]. Diversi valori sono stati cambiati poi nelle note di rilascio. Dove le fonti divergono lo segnalo.

---

## 0. Sintesi: i numeri chiave

| Tema | Valore | Affidabilità |
|---|---|---|
| Tipo di turno | Simultaneo: tutti pianificano in parallelo, la risoluzione avviene a fine turno | UFFICIALE [SITE-F], [F-43] |
| Durata turno, partite "Quick" | 1-12 minuti (massimo 12 min dal 2010) | UFFICIALE [F-8], [F-44], [N-9] |
| Durata turno, partite "Casual" | 12/24/48 ore | UFFICIALE [F-44] |
| Fine del turno | Allo scadere del timer, oppure quando tutti hanno premuto "end turn" | UFFICIALE per le Casual [F-44]; DEDOTTO per le Quick |
| Giocatori per partita | Fino a 40 (la stessa pagina indica anche 20) | INCERTO [SITE-F], [SITE-H] |
| Durata predefinita della partita | 50 turni, poi vince chi ha più SP | UFFICIALE [F-18], [F-10] |
| Ingresso dei ritardatari | Consentito fino al turno 10 (valore predefinito) | UFFICIALE [F-9] |
| Selezione paesi | A rotazione, 30 s per scelta, da 1 a 99 paesi | UFFICIALE [F-12] |
| Reddito iniziale di una città | 50% del nominale sul "tuo territorio", 10% su "territorio straniero" | UFFICIALE [N-11], [F-15] |
| Crescita del reddito | +25%/turno fino al 100%, poi +2%/turno fino al 150%; in territorio straniero +5%/turno fino al 50% | UFFICIALE [N-11], [F-15]; INCERTO, una guida del 2020 dice +2% fino al 200% [G-ESTUS] |
| Bonus paese completo | 20% del reddito complessivo del paese | UFFICIALE [N-89] |
| Mantenimento (upkeep) | 1/10 del prezzo d'acquisto, a ogni turno | UFFICIALE [F-13], [F-15] |
| Rinforzi (unità acquistabili) | All'inizio della partita e poi ogni 4 turni; quantità per città in base alla popolazione | UFFICIALE [F-13], [F-26] |
| Rinforzi massimi per città | 7 sulla mappa standard (2010); fino a 10 sulle mappe custom (2012) | UFFICIALE [N-9], [N-91] |
| Requisito capitale | Le città di un paese danno reddito pieno e unità solo se controlli la capitale di quel paese | UFFICIALE [F-11], [SITE-R] |
| Diplomazia | Guerra (predefinita), Pace, Alleanza. Da pace a guerra serve 1 turno, da alleanza a guerra 2 | UFFICIALE [F-16], [F-14] |
| Pace al turno 1 | Tutti partono in pace e passano in guerra al turno successivo | UFFICIALE [N-65] |
| SP a fine partita | Vittoria: tutti i tuoi SP più metà di quelli degli avversari. Sconfitta o resa: metà. Abbandono: zero | UFFICIALE [F-6], [F-18] |

---

## 1. Struttura della partita e del turno

### 1.1 Tipi di partita e timer

- Due famiglie: **Quick**, con turni da 1 a 12 minuti, e **Casual**, con turni da 12 a 48 ore. Ogni famiglia ha tre stanze nella lobby: Main, Beginners e Coalition Wars. **[UFFICIALE]** [F-8], [F-44]
- Le partite veloci durano tipicamente 30-120 minuti. Le Casual richiedono circa 5-15 minuti di collegamento al giorno. **[UFFICIALE]** [SITE-H]
- Nel 2010 la durata massima del turno è stata fissata a 12 minuti, per impedire a chi perdeva di allungare il turno a 60 minuti. **[UFFICIALE]** [N-9]
- Il timer viene risincronizzato all'inizio di ogni turno. **[UFFICIALE]** [N-13]
- Nelle Casual si muove quando si vuole entro la finestra, poi si preme "end turn" per salvare le azioni e si può chiudere il browser. Il nuovo turno parte allo scadere del timer, oppure quando tutti hanno chiuso il turno. Al cambio di turno parte una notifica via e-mail. **[UFFICIALE]** [F-44]
- La barra inferiore mostra il turno corrente (la "settimana"), il saldo con il reddito netto per turno, il tempo rimasto e i pulsanti join game, end turn e start turn. **[UFFICIALE]** [F-26]
- **Unità di tempo.** Nella FAQ un turno è una "settimana" e 4 turni sono un "mese"; i rinforzi arrivano nella prima settimana di ogni mese. **[UFFICIALE]** [F-13], [F-26] Nel dicembre 2012 gli sviluppatori hanno annunciato che "i turni sono solo turni" e hanno tolto i riferimenti alle settimane. **[UFFICIALE]** [N-88] La cadenza "rinforzi ogni 4 turni" resta comunque citata nella FAQ attuale.

### 1.2 Pre-partita: creazione e impostazioni

Opzioni documentate in fase di creazione, tutte **[UFFICIALE]** salvo indicazione diversa:

- Partita pubblica o privata (con password), a squadre o tutti contro tutti. Le squadre vanno da 2 a 4, sono **alleate in modo permanente** e non hanno altre opzioni diplomatiche. [F-10], [N-14]
- Intervallo di grado (rank) richiesto per entrare, 0-15 di default. [F-10]
- Mappa e "preset", cioè l'area giocabile: una regione più piccola dà una partita più veloce. [F-10]
- **Starting funds**: il denaro iniziale di ogni giocatore. [F-10]
- **Initial countries**: quanti paesi può scegliere ogni giocatore all'inizio (da 1 a 99). [F-10], [F-12]
- **Game duration**: il turno limite (default 50). [F-10], [F-18]
- **Allow joining until week**: oltre quel turno non si entra più (default 10). Esiste anche l'opzione "Instant joining". [F-9], [F-10]
- **Victory condition**: vedi sezione 6. [F-18], [N-8]
- Probabilità di trovare unità rare nelle città conquistate, compresa l'opzione "nessuna". [F-35]
- "Allow rejoining", cioè rientrare dopo aver perso o abbandonato, e "100 additional cities" (2010). [N-8]
- "Disable strategy" e "disable upgrades", pensate per i tornei (2013). [N-117]
- **Max Alliances**: il numero massimo di alleanze. Con 0 la diplomazia è disattivata nelle partite tutti contro tutti (2015) [N-162]; cambiarlo a partita in corso richiede l'unanimità (2013) [N-123]. Il default sarebbe 3. **[COMUNITÀ]** [FO-19850]
- L'host può tenere in sospeso l'avvio durante la selezione dei paesi, per aspettare altri giocatori (2012). [N-65]

**Modifica delle impostazioni a partita in corso.** Dal 2012 si cambia con una votazione "che tiene conto delle alleanze". Le Casual non possono più diventare Quick. **[UFFICIALE]** [N-88] Già prima il passaggio tra Quick e Casual richiedeva l'unanimità (dicembre 2012). [N-91] Secondo un utente nel 2014 si votava a maggioranza. **[COMUNITÀ]** [FO-ALLY]

### 1.3 Fase 0: selezione dei paesi

- È la prima fase della partita. I giocatori **scelgono a turno**, con **30 secondi** per scegliere e comprare un paese; scaduto il tempo, la mano passa al giocatore successivo. **[UFFICIALE]** [F-12]
- Ogni paese ha un costo, il "net worth", che dipende dal suo reddito e dalle truppe disponibili. Si paga con lo starting funds. **[UFFICIALE]** [F-12]
- Il **primo paese scelto è il "paese natale" (home country)**, segnato da una bandiera del colore del giocatore sulla capitale. Conta per alcune condizioni di vittoria. **[UFFICIALE]** [F-12]
- Qui si sceglie anche la **Strategia** (un modificatore delle unità), che poi non si può cambiare durante la partita. **[UFFICIALE]** [F-12]
- Si preme "ready" quando si ha finito; raggiunto il massimo di paesi lo stato diventa "ready" da solo. La partita parte quando tutti sono pronti. **[UFFICIALE]** [F-12]
- **Penalità per chi lascia scadere il tempo** (2012): dal secondo timeout si perde una quota dei soldi iniziali per ogni timeout, prima il 10% e poi, dal 19.06.2012, il 5%. Al **quinto timeout** si viene espulsi. **[UFFICIALE]** [N-65]

### 1.4 Il turno di gioco: fasi

Il turno è **simultaneo**: il sito parla di "simultaneous turn-based combat" e di "taking simultaneous turns" [SITE-F]. Da FAQ, note di rilascio e guide si ricostruisce questa sequenza:

1. **Inizio turno (eventi).** Si apre il menu "Events", che non si può chiudere se c'è un'azione diplomatica da confermare. [F-26] Qui succedono, in quest'ordine probabile, che resta **[DEDOTTO]**:
   - si confermano o rifiutano le proposte diplomatiche arrivate nel turno precedente [F-16];
   - si rilevano le unità stealth nel raggio di rilevamento, perché "il rilevamento avviene solo all'inizio del turno" [F-34];
   - si incassa il reddito e si paga il mantenimento. La FAQ parla di importi "per settimana", cioè per turno [F-15]; il momento esatto dell'incasso non è documentato e resta **[DEDOTTO]**;
   - nella prima settimana del mese si ricevono i rinforzi, cioè nuove unità acquistabili [F-26].
2. **Pianificazione.** Ognuno, in parallelo e senza vedere le mosse altrui, compra unità dalle città, muove le truppe e fa diplomazia. Le mosse si possono annullare finché è possibile (c'è una "x" sul percorso). [F-14] Una guida descrive due sotto-fasi, prima gli acquisti e poi i movimenti. **[COMUNITÀ]** [EXT-LPR] In realtà acquisti e mosse sono entrambi azioni ordinate (vedi 1.5).
3. **Fine turno.** Il turno finisce allo scadere del timer o quando tutti hanno premuto "end turn". [F-44]
4. **Risoluzione dei movimenti**, in ordine casuale e intercalato (dettagli in 1.5).
5. **Fase di combattimento.** Se ci sono state battaglie compare la lista, con partecipanti e luoghi, e si possono rivedere una per una, in sequenza o a velocità accelerata. Il menu Combat "compare nella fase di combattimento" e non si chiude. [F-17], [F-26] Una recensione chiama questa fase "overview". **[COMUNITÀ]** [EXT-LPR]
6. Poi inizia il turno successivo.

### 1.5 Ordine di risoluzione delle mosse (meccanica chiave)

- **Spiegazione ufficiale (FAQ 3.12).** I movimenti hanno priorità secondo **l'ordine delle azioni di ciascun giocatore**, non secondo l'orario. Se un giocatore fa la prima mossa nei primi 10 secondi e un altro all'ultimo istante, quelle due mosse hanno la stessa priorità, al 50%. Conviene quindi fare le mosse in ordine di importanza. **[UFFICIALE]** [F-43]
- **Algoritmo descritto dallo sviluppatore Dave (01.05.2021)** dopo aver studiato il codice, che dice di non aver modificato. **[UFFICIALE]** [FO-44795]:
  - Ogni giocatore ha una lista ordinata di "turn actions". Contano come azioni le mosse, gli attacchi e anche gli acquisti.
  - A fine turno il server **sceglie a caso un giocatore**, esegue la sua prossima azione e poi sceglie di nuovo a caso. Lo stesso giocatore può uscire più volte di fila.
  - Le azioni di uno stesso giocatore restano nel suo ordine; quelle di giocatori diversi si intercalano a caso. Con 6 giocatori da 3 mosse ciascuno si può avere un giro ordinato oppure un ordine scombinato, per esempio con tutte le mosse di un giocatore per prime.
  - **Acquisti**: tutte le unità comprate in una città contano come **una sola azione**, qualunque siano quantità e tipo; comprare in una seconda città è una seconda azione. Non è chiaro se l'autoproduzione conti come azione.
- **Versione più vecchia della comunità (2016):** "prima tutte le prime mosse, poi tutte le seconde". **[INCERTO]** [G-HUGO] La smentisce la spiegazione di Dave del 2021.
- **Inseguimento**: se il rapporto tra attacco totale e difesa totale di un'armata supera 1,3, l'armata non insegue il nemico attaccato dentro la città di quest'ultimo (2011). **[UFFICIALE]** [N-26]

### 1.6 Intercettazione e "turnblock"

Il turnblock è il cuore tattico del turno simultaneo: se il tuo attacco viene risolto prima che la pila nemica si muova, la pila resta bloccata e combatte.

- **Regola ufficiale del 2012** [N-61]:
  - Il turnblock funziona solo se hai **più del 50% delle unità** della pila che vuoi bloccare.
  - Probabilità = tue unità / unità avversarie, con un **massimo del 50%**. Esempi: 3 contro 10 dà il 30%; 5 contro 10 dà il 50%.
  - Se la pila avversaria ha meno di 4 unità, il blocco funziona sempre, come prima.
  - Da quel momento si può passare attraverso tutte le unità che non sono in città, salvo quelle che formano una linea difensiva.
  - Le unità dentro i trasporti non contano nel calcolo (25.05.2012). [N-62]
- **Correzione di Dave (2021)**, che contraddice in parte la regola del 2012. **[UFFICIALE]** [FO-44795]:
  - Il blocco è l'**esito predefinito**: la pila scappa solo vincendo un tiro.
  - Una pila con **3 unità o meno è sempre bloccata**.
  - Formula di fuga: la pila scappa se `Random(0..1) > (Attaccanti / Difensori) × 2`. Se l'attaccante ha almeno metà delle unità del difensore, il blocco è garantito; per esempio 5 contro 20 dà il 50% di fuga. Il "tetto del 50%" che Dave aveva dichiarato prima era sbagliato.
  - L'altro modo di sfuggire è che la pila bersaglio esca dalla portata dell'attaccante prima che l'attacco venga risolto.
- **Se il blocco fallisce**: se l'unità che intercettava ha ancora portata per raggiungere la pila nemica, la raggiunge e combatte; altrimenti resta nel punto d'intercettazione come un movimento normale. **[COMUNITÀ]** [G-ESTUS], [G-HUGO]
- I **muri** (vedi 4.4) proteggono del tutto dal turnblock. **[COMUNITÀ]** [G-HUGO], [G-CLOV-A]

### 1.7 Se un giocatore non agisce, si disconnette o abbandona

- **Non fa nulla**: le sue unità restano ferme. **[DEDOTTO]** Nessuna fonte dice che il server muova le unità di chi è inattivo. Reddito e mantenimento continuano a scorrere. **[DEDOTTO]**
- **Disconnessione**: dal 2010 la riconnessione è automatica se avviene nello stesso turno. **[UFFICIALE]** [N-13] Chi chiude il browser resta in partita "per un po'", ma se non rientra entro **10 minuti** esce dalla partita e perde tutti gli SP guadagnati. Lo stesso succede con "Exit to lobby". **[UFFICIALE]** [F-18] Dal 2021 Chrome scollega le schede in background, e lo sviluppatore precisa che non esiste un "autokicker" voluto. **[UFFICIALE]** [N-347]
- **Espulsione da parte dell'host**: possibile solo per giocatori inattivi da **almeno 3 turni** (2010). **[UFFICIALE]** [N-7] Nel 2016 la comunità parla di 3-4 turni. **[COMUNITÀ]** [FO-27944]
- **Rimozione automatica degli inattivi**, solo da fonti di giocatori. **[COMUNITÀ]** [FO-49521], [FO-40639], [FO-4613]:
  - Casual: si viene eliminati dopo circa **48 ore senza mosse**, quindi 4 turni da 12 h, 2 da 24 h o 1 da 48 h. Altri parlano di 1 turno.
  - Quick: circa 4-5 turni d'inattività.
  - Non si viene rimossi se si preme "end turn" anche senza fare mosse.
  - Chi viene espulso **non riceve SP**.
  - Secondo un giocatore nel 2023, al suo ritorno il suo impero era **diventato neutrale**.
- **Niente IA**: atWar non ha bot che prendano il posto di chi esce. Lo conferma un giocatore nel 2025, e nel 2023 Dave definiva un'IA "un incubo" ancora da fare. **[COMUNITÀ]**/**[UFFICIALE]** [FO-50295], [N-49394]
- Se il creatore della partita non gioca più, la proprietà della partita passa in automatico a un altro giocatore (2010). **[UFFICIALE]** [N-5]

---

## 2. Economia

### 2.1 Valuta e saldo

- In partita c'è **una sola valuta**, chiamata "money" o "funds", senza un nome di fantasia. Non va confusa con gli **SP** (Strategy Points, valuta tra una partita e l'altra per gli upgrade) né con i **ProtoCoins** (valuta a pagamento). **[UFFICIALE]** [F-15], [F-6], [F-42]
- La barra inferiore mostra i fondi correnti e la differenza tra entrate e uscite; il dettaglio è nel menu Finances. **[UFFICIALE]** [F-15]
- Il saldo iniziale è un'impostazione della partita (starting funds). **[UFFICIALE]** [F-10]

### 2.2 Da dove viene il reddito

- Il reddito arriva **solo dalle città**, più il **bonus per il paese completo**. **[UFFICIALE]** [F-15], [N-88], [N-89]
- Ogni città ha un **reddito nominale** ricavato da PIL e popolazione reali sulla mappa mondiale. **[UFFICIALE]** [SITE-F], [SITE-R] Esempi misurati da un giocatore nel 2014, sulla vecchia mappa. **[COMUNITÀ]** [FO-15381]:
  - reddito totale del mondo 34.825, rinforzi totali 1.943;
  - città più ricche: Tokyo 552, Mosca 438, Shanghai 436, Parigi 405, Londra 399;
  - Germania 651 + 130 di bonus, Regno Unito 600 + 120.
- **Requisito della capitale**: le città danno reddito e unità "solo se controlli la capitale del paese". Quando prendi la capitale, segnata da una stella, inizi a ricevere reddito da tutte le città che controlli in quel paese e puoi comprarvi unità. **[UFFICIALE]** [F-11] La pagina di confronto con Risk precisa che serve la capitale "per avere il **pieno** beneficio" delle città. **[UFFICIALE]** [SITE-R]

### 2.3 Formula di crescita del reddito di una città

Regola ufficiale della versione 0.917 (30.11.2010), riportata identica nella FAQ attuale. **[UFFICIALE]** [N-11], [F-15]

| | Territorio "tuo" | Territorio "straniero" |
|---|---|---|
| Reddito iniziale dopo la conquista | 50% del nominale | 10% del nominale |
| Crescita per turno | +25% fino al 100%, poi +2% | +5% |
| Tetto | 150% | 50% |

- **Tempi** (calcolo nostro **[DEDOTTO]**): sul tuo territorio la città passa da 50 a 75 a 100%, cioè arriva al 100% in 2 turni; poi sale di 2 punti a turno e raggiunge il 150% dopo altri 25 turni, circa 27 turni in tutto. In territorio straniero va dal 10 al 50% in 8 turni.
- **Esempio [DEDOTTO]**: una città da 400 nominali appena conquistata sul tuo territorio rende 200, poi 300, poi 400, e al massimo 600.
- **Il reddito riparte da capo a ogni cambio di proprietario.** Era l'intento esplicito del design: spingere a difendere le città invece di scambiarsele. **[UFFICIALE]** [N-11]
- **Storia della regola**: nella v0.915 i valori erano 20% con +20% a turno, e 5% con +5% in territorio straniero, con +1% oltre il 100%; sono stati ritoccati due giorni dopo. **[UFFICIALE]** [N-11]
- **Contraddizione [INCERTO]**: la guida illustrata del moderatore Estus (2020) dice "ogni turno il reddito sale del +2% fino a un massimo del 200%" [G-ESTUS]. La guida Hugosch (2016-17) ripete invece i valori della FAQ [G-HUGO]. Non abbiamo una fonte ufficiale recente che risolva il dubbio.
- **Cosa vuol dire "tuo" e "straniero"? [DEDOTTO]** Nessuna fonte lo definisce. La lettura più coerente con le altre regole è questa: "tuo" sono le città di un paese di cui controlli la capitale; "straniero" sono le città di un paese di cui non controlli la capitale, che quindi rendono poco (10-50%) e non producono unità. È coerente con la frase "per avere il pieno beneficio" di [SITE-R] e con il consiglio delle guide di "annettere la capitale il prima possibile" [G-CLOV-A]. La FAQ 3.8 dice però "solo se controlli la capitale", che farebbe pensare a reddito zero. **Va verificato in gioco.**

### 2.4 Bonus paese completo

- Controllare **tutte le città di un paese** dà un bonus di reddito, visibile nel menu del paese e in Finances. **[UFFICIALE]** [F-11], [F-15]
- Il bonus vale il **20% del reddito complessivo del paese**. Era stato tolto il 02.12.2012 ed è stato rimesso il 12.12.2012 con questo valore fisso. **[UFFICIALE]** [N-88], [N-89] I numeri della comunità lo confermano: Germania 651 + 130, Francia 593 + 119, Sudafrica 231 + 46. **[COMUNITÀ]** [FO-15381]
- Una guida osserva che il bonus può scattare solo dal turno dopo la conquista. **[COMUNITÀ]** [G-CLOV-A]
- Basta togliere all'avversario una sola città per azzerargli il bonus. **[DEDOTTO]**

### 2.5 Popolazione, danni collaterali e reddito

- Ogni città ha una **popolazione**, che pesa in modo proporzionale sul reddito e sui rinforzi: al 50% di popolazione rende metà reddito e metà rinforzi. **[UFFICIALE]** [F-15], [F-13]
- Dal 2012 la popolazione subisce **danni collaterali quando la città viene attaccata**. Le perdite dipendono dalla dimensione della battaglia e dal tipo di unità che attaccano; le unità hanno una statistica apposita, "Collateral", per esempio 2 per Tank e Destroyer e 0 per Infantry. **[UFFICIALE]** [N-88], [SITE-U]
- Popolazione e reddito "crescono naturalmente nel tempo" e calano con le battaglie. **[COMUNITÀ]** [FO-24855] Il ritmo di recupero non è documentato.

### 2.6 Mantenimento (upkeep)

- Ogni unità costa **1/10 del suo prezzo d'acquisto per ogni turno** in cui la possiedi. **[UFFICIALE]** [F-13], [F-15]
- Esempi con la strategia "None", prezzi dalla tabella ufficiale [SITE-U] e upkeep calcolato **[DEDOTTO]**:

| Unità | Prezzo | Upkeep per turno |
|---|---|---|
| Militia | 30 | 3 |
| Air Mech | 50 | 5 |
| Infantry | 70 | 7 |
| Tanks | 120 | 12 |
| Marines | 160 | 16 |
| Anti-aircraft | 180 | 18 |
| Submarine | 200 | 20 |
| Transport | 250 | 25 |
| Destroyer | 250 | 25 |
| Edificio (2017) | 700 | 70 (Witch-Doctor riporta 70 per la banca) |

- **Come si riduce l'upkeep:**
  - Upgrade "General: cost": il Generale riduce di 4 il mantenimento settimanale di ogni unità nella sua pila (solo account Premium). **[COMUNITÀ]**, lista di upgrade [FO-25406]
  - Edificio **Bank**: l'annuncio ufficiale dice "-10 upkeep per ogni unità prodotta in quella città". **[UFFICIALE]** [N-211], [FO-41068] Un moderatore che l'ha testato riporta invece **-1** per unità, perché la banca abbassa di 10 il "costo" e quindi di 1 l'upkeep. **[COMUNITÀ]** [FO-46642] Il valore effettivo è **[INCERTO]**.
- **Saldo negativo**: non è documentato. Nel 2012 i giocatori discutevano se il saldo potesse scendere sotto zero. Alcuni dicevano di sì, con il debito che cresce turno dopo turno senza che il gioco sciolga unità; altri dicevano che il limite è zero. **[INCERTO]** [FO-4857]
- **Sciogliere unità**: è solo un suggerimento dei giocatori e non risulta implementato. **[COMUNITÀ]** [FO-6470] L'unica forma ufficiale è **rivendere** un'unità comprata nello stesso turno, se non è ancora stata mossa, con il pulsante "-". **[UFFICIALE]** [F-13]

### 2.7 Tasse, trasferimenti e altri modificatori

- **Tasse**: nessuna meccanica di tassazione trovata.
- **Trasferire denaro**: è possibile tra **alleati**, dal 2010, dal menu Players. **[UFFICIALE]** [N-5], [F-16] Una FAQ della comunità (2016) dice "in pace o in alleanza". **[INCERTO]** [FO-27944]
- **Trasferire truppe**: non è possibile, "sospeso finché non capiamo come evitare abusi" (2010). **[UFFICIALE]** [N-5] Si possono però cedere **città vuote** a un alleato. **[UFFICIALE]** [F-16], [N-10]
- **Modificatori di costo**: le Strategie (per esempio Imperialist con unità economiche), gli upgrade pagati in SP (per esempio -10 di costo per l'Infantry) e gli edifici. **[UFFICIALE]** [SITE-U], [FO-25406]

---

## 3. Produzione e rinforzi

### 3.1 Dove e come si producono le unità

- Si comprano dal **menu della città**, ma **solo se controlli la capitale di quel paese**. **[UFFICIALE]** [F-13], [F-11]
- Le **unità navali** si producono solo nei **porti**. **[UFFICIALE]** [F-13]
- Sulla mappa, le città con unità disponibili hanno il contorno più spesso. **[UFFICIALE]** [F-13]
- Si può impostare la **produzione automatica**, per città o per paese: un tipo di unità che viene costruito ogni volta che ci sono rinforzi disponibili e denaro sufficiente. Gli ordini si possono annullare, sospendere o eseguire tutti insieme. **[UFFICIALE]** [F-37]

### 3.2 Il limite: i "rinforzi" (unità disponibili)

- In ogni città è disponibile solo un certo **numero di unità acquistabili**, mostrato sopra la lista. Lo determina la **popolazione** della città. **[UFFICIALE]** [F-13]
- I rinforzi arrivano **all'inizio della partita e poi una volta al mese**, cioè ogni 4 turni, nella prima settimana del mese. **[UFFICIALE]** [F-13], [F-26]
- **Ogni unità comprata consuma 1 rinforzo, qualunque sia il tipo. [DEDOTTO]** Lo ricaviamo da un esempio della guida di clovis: con 5 rinforzi, "due tank" fanno risparmiare 3 rinforzi. [G-CLOV-I] Quindi il vincolo di produzione è doppio: denaro e numero di unità.
- **Tetti**: massimo **7** rinforzi per città sulla mappa standard (2010); fino a **10** sulle mappe custom (2012). **[UFFICIALE]** [N-9], [N-91]
- **Tabella popolazione → rinforzi**, misurata da un giocatore sulla vecchia mappa (2014, con incoerenze segnalate dallo stesso autore). **[COMUNITÀ]** [FO-15381]

| Popolazione città | Rinforzi |
|---|---|
| 2,7 M o più | 8 |
| 2,3 M o più | 7 |
| 2,0 M o più | 6 |
| 1,6 M o più | 5 |
| 1,3 M o più | 4 |
| 0,9 M o più | 3 |
| 0,6 M o più | 2 |
| meno di 0,5 M | 1 |

- **Bonus ai rinforzi:**
  - Recruitment Center: +3 per città nelle settimane di reclutamento, a partire dal ciclo successivo alla costruzione. **[UFFICIALE]** [N-211], [FO-41068]
  - Upgrade "General: Rally the Troops": +1 nella città del Generale. **[UFFICIALE]** [N-175]
  - I ritardatari e chi è in svantaggio di rinforzi ne ricevono di extra. **[COMUNITÀ]** [G-CLOV-I]
  - Opzione per le mappe custom: "limitare i rinforzi alle unità del paese natale". **[UFFICIALE]** [N-83]
- Non è documentato se i rinforzi non usati si accumulano tra un ciclo e l'altro. **[INCERTO]**

### 3.3 Quando le unità sono disponibili

- Le unità comprate compaiono subito nella città. Si possono rivendere entro lo stesso turno se non sono state mosse, quindi **si possono muovere già nel turno d'acquisto**. Quest'ultimo punto è **[DEDOTTO]** da [F-13].
- Nell'ordine di risoluzione, l'acquisto in una città conta come un'azione (vedi 1.5). **[UFFICIALE]** [FO-44795]

### 3.4 Edifici (dal 2017-2019)

- Sono unità che non si muovono, al massimo **una per tipo per città**. All'annuncio: 700 di costo, 20 HP, difesa 1, attacco 0, movimento 0. **[UFFICIALE]** [N-211], [FO-41068]
- **Recruitment Center**: +3 rinforzi; costo sceso da 1000 a 300 nel 2021.
- **Fortifications**: +1 difesa a ogni unità in città, ridotto a +2 nel 2021 rispetto a un precedente +6.
- **Radar Array**: +150 di raggio visivo.
- **Anti-Aircraft Defenses**: +20 di difesa contro le unità aeree.
- **Coastal Battery**: +20 di difesa contro le unità navali.
- **Bank**: riduce l'upkeep (vedi 2.6).
- Dal 2021 gli edifici **non si possono più disattivare**. **[UFFICIALE]** [FO-47955]

### 3.5 Bottino della conquista

- Una città conquistata **genera subito Militia gratuite**, tante quanti sono i rinforzi di quella città. Lo scopo è "rendere le conquiste più definitive ed evitare scambi inutili di città vuote" (2010). **[UFFICIALE]** [N-9] Lo conferma una guida: "prendere una città dà Militia gratis". **[COMUNITÀ]** [G-CLOV-B]
- Nelle città conquistate si possono trovare a caso **unità rare**, da varianti di tank fino ai missili nucleari; alcune solo in certi paesi. **[UFFICIALE]** [F-35], [F-3]

---

## 4. Mappa e territorio

### 4.1 Struttura

- La mappa è fatta di **paesi**, ognuno con una **capitale** segnata da una stella, e di **città** al loro interno, basate sul mondo reale con centinaia di città. Nel 2010 i paesi grandi (USA, Canada, Brasile, Russia, Cina, Australia) sono stati divisi in regioni-paese, 37 in più. **[UFFICIALE]** [F-11], [SITE-R], [N-REG]
- Nel 2022 è uscita la World Map 2.0, mentre la mappa originale resta disponibile. Esistono centinaia di mappe e scenari creati dai giocatori con l'editor. **[UFFICIALE]** [FO-48672], [SITE-F]
- Gli **scenari** permettono fazioni con più paesi, unità sbloccate a fine partita ed eventi a turno. **[COMUNITÀ]** [G-ESTUS], [N-SCEN]

### 4.2 Movimento: niente griglia

- Il movimento è **libero, senza griglia né regioni**: ogni unità ha un **raggio di movimento** (Range) e si sposta ovunque entro quel raggio. **[UFFICIALE]** [SITE-F], [SITE-R]
- Il percorso può essere spezzato in più tratti finché resta raggio. Se la pila mescola unità con raggi diversi, il raggio della pila è la **media** dei raggi. **[UFFICIALE]** [F-14]
- Raggi della tabella ufficiale con strategia None: Militia 2, Infantry 6, Tanks 7, Submarine, Transport e Destroyer 10, Air Mech 9. Nel 2021 la Militia è salita a 5, quindi la tabella potrebbe non essere aggiornata. **[UFFICIALE]**/**[INCERTO]** [SITE-U], [FO-47955]
- Le unità di terra **non vanno in mare senza trasporto** (navale o aereo). **[UFFICIALE]** [SITE-R], [F-14] Le unità caricate non combattono se attaccate e muoiono se il trasporto viene distrutto. **[UFFICIALE]** [F-14], [N-13]
- **Terreno**: non risultano tipi di terreno con modificatori come montagne o foreste. C'è solo la distinzione **terra/mare** e le **"no-go zones"** disegnate nell'editor, che solo le unità aeree attraversano e senza potervisi fermare (2013). **[UFFICIALE]** [N-124] I creatori di mappe usano le no-go zones per simulare montagne e trincee. **[COMUNITÀ]** [FO-49796] Nessun modificatore di terreno al combattimento è stato trovato. **[DEDOTTO]**
- Ci sono "scorciatoie": piccoli tratti di mare o di terra attraversabili rispettivamente da unità di terra o navali. **[COMUNITÀ]** [G-CLOV-B], [FO-15381]

### 4.3 Attraversare le unità altrui

- **In guerra** non si passa attraverso le truppe o le linee difensive nemiche senza attaccarle. **[UFFICIALE]** [F-16] Dal 2012 si può passare attraverso le unità **fuori dalle città**, salvo quelle che formano una linea difensiva. **[UFFICIALE]** [N-61]
- **In pace** si passa liberamente attraverso truppe e linee difensive. **[UFFICIALE]** [F-16]

### 4.4 Linee difensive ("muri")

- Unità vicine tra loro formano una **linea difensiva** che **blocca il movimento** nemico. **[UFFICIALE]**, la FAQ cita le "defence lines" [F-16], [N-61] I dettagli vengono dalla comunità **[COMUNITÀ]** [G-CLOV-B], [G-HUGO], [FO-17714], [G-ESTUS]:
  - bastano due unità di terra, oppure due unità navali non stealth, vicine tra loro;
  - per "murare" una città servono 3 unità; una città murata richiede almeno 2 turni per essere presa;
  - il muro non si forma se c'è un'unità nemica molto vicina;
  - il muro protegge dal turnblock e dagli attacchi stealth;
  - la lunghezza va da 1 a 2 "range".
- Esistono upgrade per allungare le linee del 10%: "Longer defence lines" a 7.500 SP e una versione II. **[UFFICIALE]** [N-175], [FO-25406]

### 4.5 Conquista delle città

- Si conquista una città entrando con le truppe in una città nemica o neutrale e vincendo la battaglia. **[UFFICIALE]**/**[COMUNITÀ]** [F-14], [EXT-LPR]
- **Chi può conquistare:**
  - Le **unità aeree non conquistano**: distruggono le unità dentro e poi "parcheggiano" accanto alla città (2010). **[UFFICIALE]** [N-9]
  - Il trasporto aereo non conquista da solo, quello navale sì. **[COMUNITÀ]** [FO-44366]
  - Un trasporto navale prende una città costiera solo se dentro non ci sono Militia o Infantry; i sottomarini non conquistano. **[COMUNITÀ]** [FO-27944]
- **Nelle proprie città si difende sempre.** **[UFFICIALE]** [FO-4007] (risposta dell'admin Ivan), [G-ESTUS]
- **Più attaccanti sulla stessa città:**
  - Con una città neutrale e due attaccanti, il sistema estrae a caso due armate che combattono finché una perde un'unità. Il neutrale difende sempre; tra i due attaccanti i ruoli sono casuali, e quindi a volte si combattono tra loro. **[UFFICIALE]** [FO-4007]
  - Due alleati che attaccano una città del paese natale di uno dei due: la città va sempre al padrone di casa; negli altri casi è casuale (2010). **[UFFICIALE]** [N-10] Nel 2025 un admin parla di probabilità legata a dimensione e forza delle pile. **[UFFICIALE]**/**[INCERTO]** [FO-50305]
  - Si possono prendere **città vuote di un alleato**, così un alleato aiuta a conquistare e poi lascia la città all'altro. **[UFFICIALE]** [N-10]
- Effetti della conquista: il reddito della città riparte (2.3), nascono le Militia gratuite (3.5), si possono trovare unità rare, si guadagnano SP. **[UFFICIALE]**

### 4.6 Paesi e città neutrali

- I paesi non scelti all'inizio restano **neutrali** e sono attaccabili anche al turno 1, quando tra giocatori vige la pace. **[UFFICIALE]** [N-65]
- Sono difesi da Militia e da Infantry. Secondo i giocatori l'Infantry compare nei paesi con reddito di almeno 500 (dato più recente, 2023), con valori diversi in passato. **[COMUNITÀ]** [FO-2369]
- Le truppe neutrali valgono pochi SP perché contano come grado 0. **[UFFICIALE]** [N-88]
- Secondo un moderatore, un neutrale attaccato da due giocatori "si arrabbia" e contrattacca. **[INCERTO]** [FO-4007] Non abbiamo conferme che i neutrali prendano iniziative.

### 4.7 Capitali e paese natale

- Controllare la capitale **sblocca reddito pieno e produzione** di tutte le città del paese. **[UFFICIALE]** [F-11]
- **Perdere una capitale [DEDOTTO]**: le città che ancora possiedi in quel paese smettono di produrre unità e, secondo la lettura 2.3, rendono poco o nulla. Perdi anche il bonus paese completo. Una guida conferma che "prendere la capitale toglie al nemico il bonus paese". **[COMUNITÀ]** [G-CLOV-A]
- Se il **paese natale** o la sua capitale cade, nella condizione di vittoria "capture homecountry/homecity" il giocatore viene **eliminato**. **[UFFICIALE]** [F-18]

---

## 5. Fog of war e visibilità

- **Ogni unità ha un raggio visivo** (statistica View), attivabile sulla mappa con un pulsante sotto la minimappa. **[UFFICIALE]** [F-14] Dalla tabella ufficiale: 16 per quasi tutte le unità base, 20 per i Marines. **[UFFICIALE]** [SITE-U] Il Radar Array aggiunge 150. **[UFFICIALE]** [N-211]
- **Cosa nasconde la nebbia**: se le truppe nemiche sono fuori dal tuo raggio visivo, "non puoi vedere **il loro numero e i dettagli delle unità**". **[UFFICIALE]** [F-14] Sembra quindi una nebbia **parziale**: la presenza o l'icona della pila si vede, ma non la composizione. **[DEDOTTO]** Dentro le linee di visibilità si vedono città e numero di unità. **[COMUNITÀ]** [G-CLOV-B]
- Gli **alleati vedono tutte le truppe** l'uno dell'altro, anche fuori dal proprio raggio. **[UFFICIALE]** [F-16] La guida di Estus aggiunge "e le città". **[COMUNITÀ]** [G-ESTUS]
- **Unità stealth** (Submarine, Marines, aereo Stealth) **[UFFICIALE]** [F-3], [F-13], [F-34], [N-16]:
  - sono invisibili finché non vengono rilevate o non partecipano a una battaglia;
  - dopo una battaglia vanno riportate in una propria città per tornare invisibili;
  - il rilevamento avviene **solo all'inizio del turno**, ed è annunciato nel menu Events;
  - il raggio di rilevamento è proporzionale al raggio visivo e diverso per unità di terra, navali e aeree; anche le città rilevano;
  - un'unità rilevata diventa visibile al nemico **e ai suoi alleati**, e torna invisibile il turno dopo se esce dal raggio.
- Dal 2012 c'è un pulsante separato per il raggio di rilevamento. **[UFFICIALE]** [N-65]
- Le righe del registro battaglie possono tradire i movimenti stealth. **[COMUNITÀ]** [FO-15381]
- Upgrade di visibilità: "Lift the Fog" (+1 view a tutte le unità) e "General: view range" (+2 alla pila del Generale). **[COMUNITÀ]**, lista di upgrade [FO-25406]

---

## 6. Vittoria, sconfitta e fine partita

### 6.1 Condizioni di vittoria (impostazione della partita)

| Condizione | Regola | Fonte |
|---|---|---|
| **Total Annihilation** | La partita finisce solo quando resta un giocatore, o un gruppo di alleati. Dal 2010 scatta "catturando tutte le città dell'avversario". | UFFICIALE [F-18], [N-7] |
| **Capture homecountry/homecity** | Per eliminare un avversario basta prendere il suo paese natale o la sua capitale. | UFFICIALE [F-18] |
| **Capture the UK** | Vince chi prende per primo il Regno Unito (legata alla mappa del mondo). | UFFICIALE [F-18] |
| **Capture neutral country** | Vince chi prende un paese neutrale designato. | UFFICIALE [N-8], [N-117] |
| **Tenere la capitale o il paese per X turni** | Variante con durata del possesso configurabile. | UFFICIALE [N-8] |
| **Capture selected country** | Ammette la vittoria in alleanza, ma un solo giocatore deve tenere l'intero paese (2010). | UFFICIALE [N-9] |
| **Limite di turni** | Se allo scadere (default 50 turni) non c'è un vincitore, vince chi ha più SP; nelle partite a squadre vince la squadra con la somma di SP più alta. | UFFICIALE [F-18], [N-16] |

- **Vittoria congiunta / pareggio**: è possibile se restano solo giocatori alleati tra loro. **[UFFICIALE]** [F-16], [F-18]
- Una guida scrive che con Total Annihilation servono tutte le città **e tutte le unità** distrutte, e parla di catturare la capitale "per X turni". **[INCERTO]** [G-ESTUS]
- In uno scenario del 2016 un giocatore riferisce che servivano capitale e paese natale per 2 turni, e che l'occupazione **divisa tra due alleati** non veniva riconosciuta. **[COMUNITÀ]** [FO-23699]

### 6.2 Uscire dalla partita

| Modo | Effetto | Fonte |
|---|---|---|
| **Abbandono** (chiudere il browser per più di 10 minuti, o "Exit to lobby") | Perdi tutti gli SP della partita; la partita va nella percentuale di partite abbandonate. | UFFICIALE [F-18], [N-121] |
| **Resa** ("Surrender") | Conservi metà degli SP; conta come sconfitta. Nelle partite in solitario la resa non esiste, solo l'abbandono. | UFFICIALE [F-18], [N-121]; COMUNITÀ [FO-4613] |
| **Espulsione** | Nessuno SP. | COMUNITÀ [FO-49521], [FO-10809] |
| **Eliminazione** | Metà degli SP, come una sconfitta. | UFFICIALE [F-6] |

- Cosa succede ai territori di chi esce: secondo un giocatore nel 2023 diventano **neutrali**. **[COMUNITÀ]** [FO-49521] Il caso delle unità rimaste non è documentato.

### 6.3 Punteggio finale (SP)

- Gli SP si guadagnano in partita distruggendo unità, conquistando città e paesi e ottenendo medaglie. Le medaglie pagano subito; il resto resta nello "Scoreboard" fino alla fine. **[UFFICIALE]** [F-6]
- **Alla fine**: chi vince prende tutti i suoi SP più metà di quelli degli avversari, e in alleanza la vincita si divide (2010) [N-9]; chi perde o si arrende prende metà; chi abbandona non prende niente. **[UFFICIALE]** [F-6]
- Gli SP di battaglia dipendono dal **grado** dell'avversario: chi batte un giocatore di grado molto più alto ne prende molti di più. **[UFFICIALE]** [N-88]
- Il menu Players mostra il "SP pool" della partita e quanto prenderesti vincendo o perdendo (2012). **[UFFICIALE]** [N-65]
- **Statistiche di fine partita**: perdite di popolazione, città occupate, unità distrutte, unità costruite, unità perse, reddito. **[UFFICIALE]** [N-88]
- **Duelli**: dentro una partita si può sfidare un altro giocatore; perde chi viene eliminato per primo e conta per l'Elo. Esiste anche il tipo di partita "Duel" a 2 giocatori. **[UFFICIALE]** [F-40], [N-91]

---

## 7. Diplomazia in partita

### 7.1 Stati e loro effetti

Tre relazioni possibili tra giocatori. **[UFFICIALE]** [F-16]

| Stato | Attacco | Movimento | Altro |
|---|---|---|---|
| **Guerra** (predefinita) | Libero. | Non si attraversano truppe o linee difensive nemiche senza attaccare. | |
| **Pace** | Vietato senza prima dichiarare guerra, che richiede un turno. | Si attraversano liberamente truppe e linee. | |
| **Alleanza** | Vietato: servono **2 turni** per tornare in guerra. | | Si può inviare denaro; ci si vede tutte le truppe; si cedono città vuote; si può vincere insieme. |

### 7.2 Tempi e procedure

- **Pace al turno 1** (2012): tutti partono in pace e passano in guerra automaticamente al turno 2, salvo accordi diversi. Lo stesso vale per i ritardatari: nel loro primo turno non possono attaccare né essere attaccati. I neutrali restano attaccabili. **[UFFICIALE]** [N-65]
- Passare **dalla guerra alla pace, o all'alleanza**, richiede il consenso dell'altro giocatore, che accetta o rifiuta **all'inizio del turno successivo**. **[UFFICIALE]** [F-16]
- Si può chiedere l'alleanza solo se si è già in pace; la pace richiede almeno un turno per essere approvata; dichiarare guerra riporta allo stato senza accordi. **[COMUNITÀ]** [FO-27944]
- **Rompere un'alleanza** richiede un turno e poi un altro per arrivare alla guerra: in tutto 2 turni. **[UFFICIALE]** [F-14], [F-16]
- Gli alleati non si possono attaccare: prima bisogna rompere l'alleanza dal menu Players. **[UFFICIALE]** [F-14]
- Nel 2015 è stato corretto un bug che permetteva di attaccare subito dopo aver cliccato "dichiara guerra" prima della fine del turno. **[UFFICIALE]** [N-162]

### 7.3 Limiti e varianti

- **Max Alliances**: impostazione dell'host (vedi 1.2). Con 0 la diplomazia è disattivata nelle partite tutti contro tutti. **[UFFICIALE]** [N-162], [N-123]
- **Squadre**: alleanze permanenti, nessun'altra diplomazia. Al posto della scheda Diplomacy c'è una scheda Teams. **[UFFICIALE]** [N-14], [F-10]
- **Coalition Wars**: partite a squadre tra due coalizioni (clan), almeno 3 giocatori per lato, con Elo di coalizione. **[UFFICIALE]** [F-39-CW]

### 7.4 Tradimento e cambio di fazione

- **Tradimento**: non ci sono penalità esplicite. La protezione contro il "backstab" sta tutta nei **tempi di preavviso**, 1 turno dalla pace e 2 dall'alleanza; la FAQ dice che l'alleanza offre "il doppio della protezione". **[UFFICIALE]** [F-16]
- **Cambio di fazione o squadra**: nelle partite a squadre si cambia squadra solo nella lobby o nella selezione dei paesi, non durante il gioco. **[UFFICIALE]** [F-10] Nelle partite libere gli schieramenti sono le alleanze, e si cambiano con i tempi visti sopra.
- **Condivisione della visione**: è automatica e totale tra alleati, per le truppe (e le città secondo [G-ESTUS]). Non esiste una visione condivisa parziale o in pace. **[UFFICIALE]** [F-16]
- **Comunicazione**: canali chat Game e Private per negoziare; il menu Players mostra il grafico delle relazioni diplomatiche tra tutti i giocatori (2010). **[UFFICIALE]** [F-28], [N-13b]

---

## 8. Osservazioni utili per il nostro design (analisi nostra)

1. **Il turno simultaneo regge solo con un ordine di risoluzione chiaro.** In atWar l'ordine casuale intercalato, insieme al turnblock, ha generato anni di confusione: la regola 2012 è stata corretta nel 2021, e lo stesso sviluppatore non sapeva bene come funzionasse. Conviene definire da subito un algoritmo deterministico, spiegato al giocatore.
2. **Reddito che riparte a ogni conquista e bonus della capitale** spingono a consolidare invece di scambiarsi città. Il bottino di Militia gratuite rafforza le conquiste. È un meccanismo semplice da riprendere con numeri nostri.
3. **Il doppio vincolo di produzione**, denaro più "manpower" per città che si ricarica ogni 4 turni, crea un ritmo a ondate.
4. **Gli inattivi sono il problema principale del multiplayer a turni lunghi.** In atWar l'impero di chi esce diventa neutrale, non c'è IA e c'è un kick a soglia. Conviene decidere presto la nostra politica.
5. **Diplomazia con preavviso** (1 o 2 turni) invece di penalità per il tradimento: semplice e leggibile.

---

## 9. Lacune / domande aperte

**Da verificare provando il gioco (o con una sessione osservata):**

1. **Tetto del reddito: 150% o 200%?** La FAQ e la nota ufficiale del 2010 dicono 150% con crescita +25%/+2%; la guida 2020 di un moderatore dice +2% fino al 200%.
2. **"Tuo" e "straniero"**: definizione esatta. E le città di un paese senza capitale rendono il 10-50% oppure zero?
3. **Momento esatto** in cui si incassano reddito e mantenimento (inizio o fine turno) e se il bonus paese scatta subito o dal turno dopo.
4. **Saldo negativo**: è possibile? Cosa succede se il mantenimento supera i fondi (blocco degli acquisti, debito, scioglimento di unità)?
5. **Rinforzi non usati**: si accumulano tra un ciclo e l'altro o si perdono? E come cambia oggi la tabella popolazione → rinforzi sulla World Map 2.0?
6. **Bank**: riduce l'upkeep di 1 o di 10 per unità?
7. **Turnblock**: vale la regola 2012 (probabilità tue/sue unità, massimo 50%, sotto il 50% delle unità non blocchi) o la formula riportata da Dave nel 2021 (fuga se Random > A/D×2)? Le due sono incompatibili.
8. **Partite Quick**: il turno finisce in anticipo quando tutti premono "end turn", come nelle Casual?
9. **Inattività**: le soglie esatte di rimozione automatica (Quick e Casual) e cosa succede a città e unità (neutrali? rimosse?). Le fonti sono solo giocatori.
10. **Eliminazione**: con Total Annihilation basta perdere tutte le città, o vanno distrutte anche tutte le unità? Cosa succede alle unità residue di chi viene eliminato?
11. **Nebbia**: fuori dal raggio visivo si vede l'icona della pila nemica (con numero nascosto) o niente? E le città nemiche si vedono sempre?
12. **Neutrali**: hanno rinforzi periodici? Reagiscono agli attacchi? Quante truppe hanno all'inizio?
13. **Popolazione**: quanto velocemente si ricostituisce dopo i danni collaterali?
14. **Max Alliances**: il limite riguarda le alleanze per giocatore o la dimensione del blocco? Qual è il default attuale?
15. **Trasferimento di denaro**: solo tra alleati (FAQ) o anche in pace (FAQ della comunità 2016)? Ci sono limiti di importo?
16. **Numero massimo di giocatori**: 20 o 40? La pagina features riporta entrambi.

**Fonti che non sono riuscito a consultare:**

- **Reddit r/AtWar**: il fetch è bloccato.
- **Pagine del forum ufficiale**: dopo una ventina di richieste automatiche Cloudflare ha cominciato a bloccarle. Le pagine chiave le ho lette con lo strumento di fetch standard, che restituisce un riassunto e non il testo integrale.
- **Giant Bomb**: risponde 403.
- **Schede Steam, Google Play e App Store**: non ne ho trovate di pertinenti.
- **Video YouTube**: non consultati.
- **Wiki ufficiale o Fandom**: non risulta che esista.

---

## 10. Fonti

**Sito e FAQ ufficiali**

- [SITE-H] Home: https://atwar-game.com/
- [SITE-F] Game features: https://atwar-game.com/features.php
- [SITE-R] Confronto con Risk: https://atwar-game.com/risk.php
- [SITE-U] Units and Strategies (tabella delle statistiche): https://atwar-game.com/units.php
- Indice FAQ: https://atwar-game.com/faq.php
- [F-3] 4.2 Units: https://atwar-game.com/faq.php?faq_id=3
- [F-6] 3.16 Strategy Points: https://atwar-game.com/faq.php?faq_id=6
- [F-8] 3.2 The lobby: https://atwar-game.com/faq.php?faq_id=8
- [F-9] 3.4 Joining a game: https://atwar-game.com/faq.php?faq_id=9
- [F-10] 3.4 Creating a game: https://atwar-game.com/faq.php?faq_id=10
- [F-11] 3.8 Cities and countries: https://atwar-game.com/faq.php?faq_id=11
- [F-12] 3.9 Country selection: https://atwar-game.com/faq.php?faq_id=12
- [F-13] 3.10 Buying troops: https://atwar-game.com/faq.php?faq_id=13
- [F-14] 3.11 Moving troops and attacking: https://atwar-game.com/faq.php?faq_id=14
- [F-15] 3.14 Finances: https://atwar-game.com/faq.php?faq_id=15
- [F-16] 4.1 Diplomacy: https://atwar-game.com/faq.php?faq_id=16
- [F-17] 3.13 Battles: https://atwar-game.com/faq.php?faq_id=17
- [F-18] 3.15 Ending the game and Victory conditions: https://atwar-game.com/faq.php?faq_id=18
- [F-26] 3.6 Game interface: https://atwar-game.com/faq.php?faq_id=26
- [F-28] 3.5 Chat room: https://atwar-game.com/faq.php?faq_id=28
- [F-34] 4.6 Stealth detection: https://atwar-game.com/faq.php?faq_id=34
- [F-35] 4.7 Rare units: https://atwar-game.com/faq.php?faq_id=35
- [F-37] 4.8 Auto-production: https://atwar-game.com/faq.php?faq_id=37
- [F-39-CW] 4.10 Coalition Wars: https://atwar-game.com/faq.php?faq_id=39
- [F-40] 4.12 Duels and Elo: https://atwar-game.com/faq.php?faq_id=40
- [F-42] 1.2 Premium features: https://atwar-game.com/faq.php?faq_id=42
- [F-43] 3.12 Who gets to move first when the turn ends?: https://atwar-game.com/faq.php?faq_id=43
- [F-44] 3.3 Quick / Casual games: https://atwar-game.com/faq.php?faq_id=44

**Note di rilascio ufficiali** (formato `https://atwar-game.com/news/news.php?news_id=N`; archivio: https://atwar-game.com/news/index.php?page=1 … page=33)

- [N-5] v0.87, 09.11.2010: news_id=5
- [N-7] v0.88, 14.11.2010: news_id=7
- [N-8] v0.9, 19.11.2010: news_id=8
- [N-9] v0.91, 25.11.2010: news_id=9
- [N-10] v0.911, 29.11.2010: news_id=10
- [N-11] v0.915-0.917 (reddito città), 30.11.2010: news_id=11
- [N-13] v0.94, 12.12.2010: news_id=13
- [N-13b] v0.93, 09.12.2010: archivio, pagina 32
- [N-14] v0.95 (team e partite private), 21.12.2010: news_id=14
- [N-16] v0.955 (stealth detection), 30.12.2010: news_id=16
- [N-REG] Big countries split into regions, 27.12.2010: archivio, pagina 31
- [N-26] v0.975, 10.02.2011: news_id=26
- [N-SCEN] Scenarios, 29.04.2011: archivio, pagina 29
- [N-61] Turn-blocking Update, 25.04.2012: news_id=61
- [N-62] Turn-blocking Update #2, 25.05.2012: news_id=62
- [N-65] Peace On First Turn, Country Selection, 18.06.2012: news_id=65
- [N-83] Custom Maps - Even More Updates, 19.11.2012: news_id=83
- [N-88] atWar - release notes (Afterwind → atWar), 02.12.2012: news_id=88
- [N-89] atWar Updates (bonus paese al 20%), 12.12.2012: news_id=89
- [N-91] More atWar Updates, 17.12.2012: news_id=91
- [N-117] Some new features, 06.08.2013: news_id=117
- [N-121] Coalitions, alliances and other minor changes, 04.10.2013: news_id=121
- [N-123] Max Alliances richiede l'unanimità, 06.11.2013: news_id=123
- [N-124] Map Editor updates (no-go zones), 12.11.2013: news_id=124
- [N-162] What we've been up to, 30.11.2015: news_id=162
- [N-175] 6 new Upgrades added!, 28.03.2016: news_id=175
- [N-211] Let's test buildings!, 08.12.2017: news_id=211
- [N-347] PSA: Getting disconnected for inactivity, 29.06.2021: news_id=347
- [N-49394] A Midsummer Night's Update (Dave, 25.07.2023): https://atwar-game.com/forum/topic.php?topic_id=49394

**Forum ufficiale** (formato `https://atwar-game.com/forum/topic.php?topic_id=N`)

- [FO-44795] Turn block and priorities: how it works (clovis1122 2020 + correzione di Dave 2021), pagine 1-3: topic_id=44795 (&page=2)
- [FO-41068] Buildings! (Sultan of Swing 2019 + chiarimenti dei dev): topic_id=41068
- [FO-47955] Update #8 (14.09.2021): topic_id=47955
- [FO-48672] World Map 2.0 is here (26.03.2022): topic_id=48672
- [FO-46642] How the Bank work (Witch-Doctor, moderatore, 2021): topic_id=46642
- [FO-25406] List of Upgrades [Updated]: topic_id=25406
- [FO-27944] [Updated] F.A.Q. (Funtime/Google, 2016): topic_id=27944
- [FO-44366] AtWar Terminology: topic_id=44366
- [FO-15381] Tips, Tricks and Common Knowledge (clovis1122, 2014-2017): topic_id=15381
- [FO-2369] Infantry/Militia defending neutrals: topic_id=2369
- [FO-4007] 2 Player vs 1 Neutral (con risposta dell'admin Ivan, 2012): topic_id=4007
- [FO-50305] When multiple allies attack, who conquers the city? (admin brianwl, 2025): topic_id=50305
- [FO-17714] Advanced concepts about Walls: Investigation: topic_id=17714
- [FO-23699] Game won't end when 2 allies occupy enemy country: topic_id=23699
- [FO-49521] Are inactive players automatically kicked? (2023): topic_id=49521
- [FO-40639] AFK kick after 1,2,3,4 etc turns (2019): topic_id=40639
- [FO-4613] Surrender / Abandon / walk away / time out (2012): topic_id=4613
- [FO-10809] Effects of Being Kicked While In-Game (2013): topic_id=10809
- [FO-4857] No negative cash balance allowed (2012): topic_id=4857
- [FO-6470] Disband units (2012): topic_id=6470
- [FO-50295] Any tips for playing vs computer opponents? (2025): topic_id=50295
- [FO-19850] Default alliance number (2015): topic_id=19850
- [FO-ALLY] Discussioni su Max Alliances e voto delle impostazioni (2013-2015), trovate via ricerca: topic_id=15209, topic_id=10237
- [FO-24855] Help with game basics (2016): topic_id=24855
- [FO-49796] Need help with the map (no go zones) (2024): topic_id=49796

**Guide della comunità**

- [G-ESTUS] "Guide to atWar" illustrata del moderatore Estus (24.09.2020), topic_id=45745. Immagini: https://i.imgur.com/NNYnbzn.png, https://i.imgur.com/IGjRXbD.png, https://i.imgur.com/ksj4xTq.png, https://i.imgur.com/48ijqQr.png
- [G-HUGO] Updated Hugosch Guide to Atwar (2016-2017): topic_id=24500
- [G-CLOV-B] A guide to atWar: basic (clovis1122, 2015): topic_id=22471
- [G-CLOV-I] A guide to atWar: Intermediate (clovis1122, 2015): topic_id=22472
- [G-CLOV-A] A guide to atWar: Advance (clovis1122, 2015): topic_id=22473

**Fonti esterne**

- [EXT-LPR] LetsPlayRisk, recensione di atWar (2014, aggiornata 2022): https://www.letsplayriskonline.com/hubs/atwar-game-com/ (attenzione: sostiene che "non ci sono tiri di dado", il che contraddice la FAQ ufficiale sulle battaglie [F-17]. Affidabilità bassa.)
