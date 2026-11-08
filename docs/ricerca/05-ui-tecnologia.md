# 05 — atWar: interfaccia, esperienza utente, piattaforme e tecnologia

Ricerca di riferimento per il nostro gioco originale. Qui si **descrive** come è fatto atWar: nessun asset e nessun codice da riusare.

- Data della ricerca: 08/11/2026
- Metodo: pagine pubbliche del sito ufficiale (home, FAQ, news, forum, team, features), file JavaScript pubblici caricati dalla home (letti come testo, mai eseguiti), header HTTP, pagine di terzi (Steam, recensioni, interviste, forum di altri giochi). Il `robots.txt` del sito vieta le cartelle `/games/`, `/play/`, `/guest/`, `/users/`, `/cln/`, `/auth/`: **non le ho aperte**, quindi lobby, profili e classifiche sono descritti solo da FAQ, codice pubblico e fonti esterne.
- File scaricati (dati non fidati, non eseguiti): `C:\Users\chris\AppData\Local\Temp\claude\b25d4c7210637fd1\b0ec82d1-3caf-410c-b36b-999c39c06b32\scratchpad\atwar-html\raw\`

**Legenda affidabilità**
- **[V] verificato**: letto direttamente nella fonte citata.
- **[D] dedotto**: conclusione ragionata da indizi verificati (spiegata).
- **[I] incerto**: fonte debole, datata, di terzi o solo da snippet di ricerca.

I numeri tra parentesi quadre tipo [F3] rimandano all'elenco fonti in fondo.

---

## 0. Sintesi in 12 punti

1. **Chi e da quando.** Nato come *Afterwind* (online dal 19/05/2010), creato dai fratelli Amok (programmazione) e Ivan (design e sito), studio "ProtoBytes". Rinominato atWar circa nel 2012. Dal dicembre 2018 è di un nuovo proprietario e sviluppatore unico, "Dave". [V] [F12][F13][F25]
2. **Storia tecnologica.** Prima Microsoft **Silverlight** (plugin, 2010–2015). Poi client **HTML5**: alpha 28/08/2015, beta 02/09/2015, Silverlight spento il 07/10/2015. [V] [F14]
3. **Client attuale.** Logica scritta probabilmente in **C# e tradotta in JavaScript** (Saltarelle), interfaccia con **Knockout.js**, mappa disegnata su **Canvas 2D con Fabric.js**, niente WebGL. Usa jQuery, Bootstrap 3 e RequireJS. [V/D] [F2][F4][F5][F6]
4. **Rete.** Connessione persistente **ASP.NET SignalR 2.2** con trasporto "auto". C'è un'alternativa **WebSocket** (WebSocket-Sharp). I messaggi sono **array JSON compatti** con un id numerico, circa 230 tipi. Server .NET su Windows/IIS, dietro Cloudflare. [V/D] [F3][F4][F9][F14]
5. **Schermo di gioco.** Barra in alto (colore, rank, testo di stato, menu principale), barra in basso (chat a sinistra; settimana/turno, saldo e reddito, timer e pulsante Fine turno a destra), minimappa con zoom e interruttori di raggio. Molti **pannelli flottanti trascinabili e riducibili** (Città, Finanze, Giocatori, Unità, Eventi, Combattimento...). [V] [F15-26][F6]
6. **Movimento libero, senza griglia.** Le unità si trascinano sulla mappa entro un raggio. Il menu "Muovi truppe" ha cursori per ogni tipo di unità e schede terra/mare/aria. Una mossa si annulla con la "x" sul percorso. [V] [F15-14][F15-27]
7. **Turni simultanei.** Partite rapide (turni da 1 a 12 minuti) o casual (12, 24 o 48 ore). Quando il turno si chiude si risolvono le mosse **nell'ordine in cui ogni giocatore le ha date**, poi c'è una fase di panoramica e la lista delle battaglie, rivedibile con play e avanti veloce. [V] [F15-44][F15-43][F15-17]
8. **Scorciatoie poche e semplici.** Frecce per spostare la mappa, +/- per lo zoom, Tab per rendere trasparenti i menu, F11 per lo schermo intero, tasti 1–9 nel menu città. L'editor di mappe ha Ctrl+Z, Ctrl+C/V e Canc. [V] [F6][F15-27]
9. **Fuori partita.** Home con login, registrazione, **social login (Facebook, Twitter, Google, Steam)** e **gioca come ospite**. Lobby a "stanze": Rapide e Casual, ciascuna con Main, Principianti e Guerre di coalizione. Poi forum, giocatori e classifiche, coalizioni, radio, premium e negozio ProtoCoins. [V] [F1][F15-8][F4]
10. **Piattaforme.** Oggi gira **solo nel browser**. Nessuna app su Google Play o App Store e nessuna pagina Steam trovata (Steam serve solo per il login). In passato c'erano una versione desktop Silverlight, Desura e un'app Facebook. Su mobile: nel 2015 la FAQ diceva "funziona anche su mobile e tablet" e nel codice c'è il pinch-zoom, ma oggi non è verificato. [V/I] [F14][F15][F21][F22]
11. **Lingue.** Inglese più 32 opzioni (31 lingue più "Leetspeak"), ciascuna su un sottodominio. Le traduzioni sono fatte dalla community, con supporto alle lingue da destra a sinistra. [V] [F1]
12. **Stato e lamentele.** Community piccola e anziana, un solo sviluppatore part-time. Server unico andato in crisi nella primavera 2026 e migrato a giugno 2026. Lamentele ricorrenti: lag e disconnessioni, UI datata e poco chiara (stato del turno, chat senza orario), niente notifiche push, controlli Cloudflare, pay-to-win percepito. [V] [F14][F16]

---

## 1. Identità, storia e chi lo sviluppa

| Data | Evento | Affid. | Fonte |
|---|---|---|---|
| 19/05/2010 | Prima news: "Afterwind Is Online!" | V | [F13] news p.33 |
| autunno 2010 | Beta di Afterwind, dopo circa 2 anni di sviluppo; fratelli Amok e Ivan | V | [F15-24] |
| ~2012 | Rinominato **atWar** quando arrivano le mappe personalizzate ("Afterwind" non andava più bene) | V (data I) | [F15-1]; BGG/VGG indicano uscita 01/12/2012 [F25] |
| 27/12/2012 | Versione **out-of-browser** (Silverlight installato sul desktop, si aggiorna da sola) | V | [F14-92] |
| 16/01/2013 | atWar disponibile su **Desura** | V | [F13] news p.25 |
| 09/01/2013 | ProtoCoins e nuovo sistema di pagamento | V | [F13] news p.25 |
| 08/02/2013 | Gruppo Steam: "quasi 20.000 giocatori registrati", app Facebook annunciata | V | [F17] |
| 28/08/2015 | **HTML5 alpha** | V | [F14-152] |
| 02/09/2015 | **HTML5 beta**: stesso database, chat condivisa tra le due versioni | V | [F14-153] |
| 07/10/2015 | **Fine di Silverlight**: niente più partite nuove; gli editor restano su Silverlight finché non vengono rifatti | V | [F14-155][F14-158] |
| 30/11/2015 | Nuovo tutorial con video e indicatori; anteprima dell'editor HTML5 | V | [F14-162] |
| 20/02/2016 | Test di un **nuovo metodo di connessione** (WebSocket-Sharp invece di SignalR), con esiti misti | V | [F14-170] |
| 08/01/2018 → 31/03/2018 | Editor di mappe HTML5: alpha, poi "live" | V | [F13] news p.15 |
| 15/03/2018 | "Clovis is the new Admin" (suo il porting dell'editor da Silverlight) | V | [F13]; [F1] news 395, tono ironico |
| 15/10/2018 | Editor di scenari live | V | [F13] |
| 12/2018 | Il gioco passa a "Dave", attuale proprietario e sviluppatore | V | [F12] |
| 02/03/2020 | Nuova UI della schermata "Nuova partita": mette in evidenza più mappe | V | [F14-281] |
| 10/04/2021 | Trasferimento di ProtoCoins tra giocatori | V | [F13] news p.5 |
| primavera 2026 | Crisi del server: database e backup corrotti, gioco offline | V (dettagli ironici) | [F1][F14-394/395] |
| 08/05/2026 | "Dave is Back; Meet the New Dev Team" (post in buona parte scherzoso) | V/I | [F14-393] |
| 10/06/2026 | "atWar is BACK" su un nuovo server | V | [F14-394] |

**Chi lo gestisce oggi** [V] [F12]
- Dave: proprietario e sviluppatore, paga i server.
- Uno staff di volontari: Chief Justice, circa 11 moderatori e circa 23 "Supporter" (aiuto, social, eventi, mentoring).
- Nessuna ragione sociale né sede indicata sul sito.

Lo sviluppatore stesso ammette, a ottobre 2026: "the pace of development is slow" e "even small changes are really painful and time-consuming". [V] [F16-50523]

---

## 2. Piattaforme

| Piattaforma | Stato | Note | Affid. | Fonte |
|---|---|---|---|---|
| Browser desktop (HTML5) | **Attiva, unica piattaforma** | "Play in your Browser, no download". Browser consigliati: Chrome, Edge, IE | V | [F11][F15-47] |
| Browser mobile e tablet | Dichiarato nel 2015, non verificato oggi | FAQ 2015: HTML5 "will work in any modern browser (including mobiles & tablets)" ma "doesn't run all that well on older devices". Nel codice c'è il pinch-zoom (Hammer.js) e il sito ha il meta viewport | V (dichiarazione) / I (resa reale) | [F15-158][F5][F1] |
| App Android / iOS | **Non esistono** (nessun risultato) | Ricerca su Google Play: nessuna app "atWar" di questo sviluppatore. Nella FAQ 2015 le app mobili erano solo un piano futuro | V (assenza nei risultati) / I | [F22][F15-158] |
| Steam | **Nessuna pagina negozio trovata** | Esistono il gruppo community (dal 2013) e il login/registrazione con Steam (OpenID/OAuth) | V | [F17][F1] |
| Desktop (Windows) | Storica | Silverlight "out-of-browser" (2012) e installer Windows suggerito agli utenti Chrome nel 2015. Lutris elenca "Browser, Windows" | V | [F14-92][F14-153][F21] |
| Desura | Storica (2013) | Store chiuso da anni | V | [F13] |
| App Facebook | Storica | Secondo l'intervista allo sviluppatore la usava solo l'1-2% dei giocatori | V/I | [F17][F19] |
| Linux | Storica, via Moonlight/Pipelight ai tempi di Silverlight. Oggi basta un browser | | V/D | [F17] |
| Windows Phone 7 | Solo ipotizzato nell'intervista, "tagliando funzioni" | | I | [F19] |

**Differenze tra versioni** [V] [F14-155][F14-152][F14-159]
- Nel 2015, secondo Amok, mappa e unità in HTML5 erano "pretty much on par with SL", ma lobby e chat andavano sistemate per gli schermi piccoli.
- I giocatori lamentavano un bug dello zoom del browser e la perdita di alcune opzioni grafiche di Silverlight.
- Gli editor sono arrivati in HTML5 solo nel 2018.

---

## 3. Tecnologia

### 3.1 Sito web (pagine fuori partita)
- **Server.** Pagine `.php` servite con header `X-Powered-By: ASP.NET` e `Server: cloudflare`. Quindi PHP su IIS (Windows) dietro **Cloudflare** (proxy e CDN). Cookie di sessione `sessname` e cookie `lang_id`. [V header] [F9]; la combinazione PHP+IIS è [D].
- **Frontend.** jQuery 1.11.3, Bootstrap 3.3.5, Font Awesome 4.4, font "Titillium Web" (Google Fonts), RequireJS 2.3.6. Altre librerie: toastr (notifiche a comparsa in alto a destra, 3 secondi), sweetalert2 (dialoghi), select2, owl.carousel (carosello in home), parsley e jquery-validate (moduli), odometer (numeri animati), jquery-countdown (timer), spectrum e colorPicker (scelta colori), jquery-bracket (**tabelloni dei tornei**), imagelightbox. [V] [F2]
- **Tracciamento e social.** Google Analytics (vecchio `ga.js`), un tracker interno, widget di condivisione AddThis, Facebook JS SDK (Graph v3.3) per il login. [V] [F1]
- **Fingerprint del browser.** La home carica `f2.min.js`, cioè la libreria **Fingerprint2**. Scopo [D]: riconoscere i multi-account ("alts"), problema citato più volte nelle news (es. 13/08/2025). [V libreria] [F8][F13]
- **HackTimer.** Libreria che tiene vivi i timer JavaScript nelle schede in background, che il browser altrimenti rallenta. Utile per non perdere il timer del turno o la connessione con la scheda nascosta. [V presenza] [F1]; scopo [D].
- **API editor.** Gli editor parlano con il server anche via REST (`/api/2.0/map-editor-actions`, `/api/2.0/scenario-editor-actions`). Upload di immagini via `/system/uploader.php`, con limiti a 1, 3, 5 e 20 MB. [V] [F6]

### 3.2 Client di gioco
- **Linguaggio d'origine.** Il codice di core, client, mappa e gioco ha i segni di un compilatore da **C# a JavaScript** (Saltarelle/Script#): runtime `mscorlib.js`, registrazione di "assembly", nomi di tipo stile .NET, `linq.js`. Il client Silverlight era in C#, quindi la logica è stata **trapiantata** in JS invece che riscritta. [V indizi] [F2][F4][F6]; identificazione del compilatore [D, molto probabile].
- **Moduli** caricati con RequireJS [V] [F2]:
  - `atwar.core`: modello dati e protocollo.
  - `atwar.client`: connessione.
  - `atwar.mapengine`: motore della mappa.
  - `atwar.game`: schermate, menu, stati.
  - `atwar.mapeditor`: editor.
  - Lobby: `games`, `newgame`, `maps`, `igs`, `chat`.
  - Localizzazione: file gettext caricati con **Jed** (`/locale/<lingua>/LC_MESSAGES/messages`).
- **UI.** **Knockout.js 3.3** (data-binding MVVM). I pannelli sono componenti Knockout sopra il canvas. [V] [F2][F6]
- **Rendering della mappa.** **Fabric.js** su Canvas 2D (nessun riferimento a WebGL nel codice) [V] [F5][F6]. Elementi principali:
  - un "TransformableCanvas" per zoom e pan, con zoom animato (ease-out);
  - livelli separati (sfondo, confini e paesi, etichette, linee di difesa, percorsi, marker truppe, marker battaglie);
  - sfondo caricato a **tasselli (tiles)** con livelli di visibilità per zoom;
  - minimappa;
  - due tipi di mappa, "FlatMap" e "RoundMap": la seconda duplica le parti della mappa, quindi probabilmente **avvolge il mondo in orizzontale** [D];
  - **cache** di icone (marker truppe, contatori, scudi e spade) per le prestazioni.
- **Input.** Mouse (trascinamento, rotellina con jquery.mousewheel), tastiera, **touch con Hammer.js** (pinch). [V] [F2][F5]
- **Editor di mappe.** Usa **Paper.js** (grafica vettoriale) per confini e percorsi. I percorsi sono classificati Terra, Acqua e Zona vietata ("NoGo"). [V] [F2][F6]
- **Altro.** zip.js (mappe compresse), md5 (hash d'integrità), "Benchmark" interno (misura la velocità di render con zoom ripetuti), "Reconnector" per riprendere la partita. [V] [F6]
- **Versioni.** `ClientVersion = 5.05`. Ultimo aggiornamento del modulo di gioco con data 14/04/2026, motore mappa 06/2022, core 01/2022: client di fatto **fermo da anni**, con ritocchi minimi. [V] [F2][F3]

### 3.3 Comunicazione client-server
- **Endpoint** (file di configurazione pubblico) [V] [F3]:
  - SignalR su porta 8080 (HTTP) o 8443 (HTTPS), percorso `/service/sr`;
  - WebSocket su porta 8885;
  - di default si usa **SignalR**; il WebSocket puro si attiva con un'impostazione locale "connectiontype".
- **SignalR.** Usa la "persistent connection" (non gli hub), con `transport: "auto"`: negozia WebSocket, Server-Sent Events o long polling secondo il browser [V codice] [F4]. Sui Wi-Fi pubblici le porte non standard possono essere bloccate: la FAQ cita l'errore "Error during negotiation" [V] [F15-47].
- **WebSocket alternativo.** Nel 2016 "/connectiontype ws" in chat attivava **WebSocket-Sharp** (libreria C#): ping peggiore per alcuni, test abbandonato ("back to the drawing board") [V] [F14-170]. Nel 2026 alcuni utenti vedono errori "WebSocket closed", soprattutto con VPN [V] [F16-50487].
- **Server .NET** [D]: SignalR ASP.NET e WebSocket-Sharp sono librerie .NET, l'header indica IIS, il client ha origine C#.
- **Formato dei messaggi.** Oggetti serializzati in **array JSON compatti** con campi ordinati e un **id numerico di tipo** [V] [F4]. Due famiglie:
  - **MC** (dal client): Admin, Chat, Editor, Game, Global, PreGame, Rooms, Scenario, User;
  - **MS** (dal server): le stesse categorie.
  - In tutto circa **230 tipi di messaggio**. Esempi: Game (EndTurn, ProposeAlliance, DeclareWar, Surrender, ReconnectRequest, ConnectSpectator), PreGame (CreatePreGame, Ready, SelectPlayerColor, SwitchTeam), Rooms (JoinRoom, GetGameList), User (Ping, SetAFK, AddFriend, BuyUpgrade).
- **Azioni del turno.** Inviate come comandi distinti: muovi, dividi, unisci, attacca, riprendi città, compra unità, invia denaro, invia truppe ad alleato [V] [F4]. Il server conferma ("CommandApproved") e a fine turno manda le differenze (truppe aggiunte, cambiate o rimosse; città o paesi acquisiti; dati di panoramica) [V] [F4].
- **Robustezza.**
  - Messaggi di stato visibili: "Connection is unstable. Attempting to reconnect...", "Reconnected. Resuming game...". [V] [F6]
  - Ping/Pong periodico. [V] [F4]
  - "IntegrityHashes/IntegrityCheck": controlli d'integrità dei dati di gioco tra client e server. [V nomi] [F4]; scopo anti-manomissione [D].

### 3.4 Architettura logica della partita (dal modello dati) [V] [F4][F6]
- **Stati della partita:** Caricamento, Spettatore, Piazzamento, Piazzamento tardivo, Inizio, Turno, Azioni del turno, Cambi del turno, Fine partita, Editor.
- **Stanze della lobby:** Quick Main, Quick Beginners, Quick Clan Wars; Casual Main, Casual Beginners, Casual Clan Wars; Tutorial; Editor.
- **Dati della partita visibili in lobby:** mappa e scenario, numero massimo di giocatori, turno corrente, rank minimo e massimo, privata o promossa, durata del turno, soldi iniziali, numero massimo di alleanze, upgrade, strategie o edifici disabilitati, condizioni di vittoria, moltiplicatore SP.

### 3.5 Infrastruttura e affidabilità
- **Un solo server**, montato circa 6 anni prima del guasto. Nella primavera 2026: tabella del database da 185 GB, backup che recuperavano il 95% dei file, 275 GB e 9,3 milioni di file di mappe (soprattutto cloni della mappa del mondo). Migrazione completata il 10/06/2026. [V, ma raccontato in tono **satirico**: i numeri sono plausibili, i dettagli scherzosi] [F1][F14-394]
- Dopo la migrazione [V] [F16-50487]:
  - la **ricerca giocatori** è stata disattivata perché sovraccaricava il server;
  - logout per inattività più frequenti;
  - alcune immagini delle unità non si caricavano.
- **Cloudflare** a volte chiede verifiche "non sei un bot", e i giocatori se ne lamentano (02/2026). [V] [F16-50429]

---

## 4. Interfaccia in partita

### 4.1 Layout dello schermo
Fonte principale: FAQ "Game interface" e "Game controls" [V] [F15-26][F15-27], confermate dai nomi dei componenti nel codice [V] [F6].

```
+----------------------------------------------------------------------------------+
| BARRA ALTA: [colore giocatore][rank]  "testo di stato..."    [Città][Finanze]    |
|                                                              [Giocatori][Unità]  |
|                                                              [Menu][?][Schermo]  |
+----------------------------------------------------------------------------------+
|                                                                   +-----------+  |
|   PANNELLI FLOTTANTI (trascinabili, riducibili,                   | MINIMAPPA |  |
|   posizione ricordata): Città, Paese, Muovi truppe,               +-----------+  |
|   Combattimento, Eventi, Giocatori, Finanze...                    [+][-][raggio  |
|                                                                    mov.][visib.] |
|                         MAPPA (canvas, zoom e pan)                               |
|                                                                                  |
+----------------------------------------------------------------------------------+
| BARRA BASSA: [Contatti][ CHAT .......... ]   [Settimana N][Saldo (+reddito)]     |
|                                              [Timer turno][FINE TURNO / ...]     |
+----------------------------------------------------------------------------------+
```

- **Barra alta** [V]: a sinistra colore e rank del giocatore e una **riga di stato** che spiega cosa sta succedendo; a destra il menu principale. Contiene anche il pulsante schermo intero. Ha "layout" diversi per partita, panoramica, piazzamento, spettatore, fine partita, editor e anteprima. [F15-26][F15-27][F6]
- **Barra bassa** [V]:
  - a sinistra la **chat** e, alla sua sinistra, il pulsante **Contatti**;
  - a destra la **settimana corrente** (1 turno = 1 settimana; un'icona mostra la settimana del mese; i rinforzi arrivano la prima settimana del mese), il **saldo con il reddito settimanale tra parentesi**, il **tempo rimanente** e il **pulsante d'azione** che cambia con la fase (Unisciti, Fine turno, Inizia turno, Salva turno nelle casual, Spettatore, Attesa, Game over...). [F15-26][F6]
- Le barre si possono **nascondere** con le frecce al centro. [V] [F15-27]
- **Minimappa** [V] [F15-26][F15-14]: vista d'insieme, un clic sposta la mappa. Sotto ci sono zoom +/- e gli **interruttori per mostrare il raggio di movimento e il raggio di visibilità** delle proprie unità.
- **Menu fissi** (dalla barra alta) [V] [F15-26]:
  - Città (elenco delle proprie città);
  - Finanze;
  - Giocatori (anche la diplomazia);
  - Menu di gioco (Opzioni, Upgrade, Impostazioni della partita);
  - Aiuto;
  - Unità.
- **Menu contestuali** [V] [F15-26]:
  - Città (clic su una città; doppio clic apre il movimento unità);
  - Paese (clic su un paese);
  - Muovi truppe (clic sulle proprie unità o pulsante nella città);
  - Combattimento (fase dei combattimenti, **non si può chiudere**);
  - Eventi (a inizio turno, non si chiude finché c'è una proposta diplomatica in sospeso).
- **Comportamento dei pannelli** [V] [F15-26][F6]:
  - trascinabili ovunque, posizione **memorizzata**, riducibili;
  - con **Tab** tutti i menu diventano semi-trasparenti ("ghost") per vedere la mappa sotto.
- **Tooltip delle truppe** [V] [F15-14][F6]: passando sopra un'icona di truppa si apre un menu a scorrimento con le unità, da cui si possono trascinare singole unità o gruppi.

### 4.2 Fasi della partita e come cambia la UI
1. **Pre-partita** [V] [F4][F15-8]: chi crea la partita imposta le opzioni. I giocatori entrano, scelgono colore e squadra e premono **Ready** ("Click Ready to begin"). Alcune impostazioni possono essere riproposte e votate durante la partita ("ProposeNewSettings").
2. **Piazzamento** [V] [F6][F4]: scelta del paese d'origine o dei paesi ("Select your homecountry"), a turno, con un timeout. Negli scenari si sceglie il "lato". Chi entra tardi ha un **piazzamento tardivo**.
3. **Turno** [V] [F15-44][F15-43]: tutti agiscono **in contemporanea** entro il timer:
   - comprano unità, muovono e attaccano, fanno diplomazia, inviano denaro;
   - "End turn" salva le azioni;
   - il turno avanza quando il timer scade o quando **tutti** hanno finito.
4. **Risoluzione** ("TurnActions/TurnChanges/Overview") [V] [F6][F15-43][F15-17]:
   - le mosse vengono eseguite secondo l'**ordine in cui ogni giocatore le ha date**; a parità di posizione decide il caso;
   - una **schermata di panoramica** riassume le mosse di tutti [F18];
   - poi compare la **lista dei combattimenti**.
5. **Fine partita** [V] [F6][F15-6]: schermata **Vittoria / Sconfitta / Resa** con **grafici** (distrutte, perse, unità, saldo, città, popolazione), punteggi più alti e medaglie. Gli SP si assegnano a fine partita. Con il limite di turni vince chi ha più SP, e la UI avvisa 5 turni prima e all'ultimo turno.
6. **Spettatore** [V] [F4][F6]: modalità dedicata con la sua barra.

### 4.3 Selezione e movimento delle unità [V] [F15-14][F15-27]
- **Trascina e rilascia** sulla mappa: le unità selezionate devono essere tutte dello stesso dominio (terra, mare o aria).
- **Menu "Muovi truppe"**:
  - si apre dal pulsante "move units" della città o cliccando le truppe;
  - ha schede Terra / Mare / Aria;
  - **un cursore per ogni tipo di unità** più i pulsanti tutto/niente, poi il pulsante verde di conferma.
- **Muovere tutte le unità di un tipo:** clic sull'immagine dell'unità nel menu città.
- **Tasti 1–9** nel menu città: muovono rapidamente **1 unità** del tipo n-esimo. [V codice] [F6]; comportamento esatto [D].
- **Gittata.** Si muove finché resta raggio, anche su più tratti. Un gruppo misto usa la **media** dei raggi.
- **Trasporti.** "Load" su un trasporto aereo o navale nello stesso punto. Fuori dalle città basta trascinare l'armata, se i trasporti bastano. Messaggi tipici: "Not enough transports...", "You need to be docked to unload". [F15-27][F6]
- **Annullare.** Si passa sopra il percorso e si clicca la **"x"**. Se la x non compare, non si può più annullare.
- **Attacco** = muoversi sopra la pila nemica. Per attaccare un alleato bisogna rompere l'alleanza (menu Giocatori, ci vuole 1 turno).
- **Nebbia.** Le truppe nemiche fuori dal raggio di visibilità non mostrano numero né dettagli. Unità **stealth** (sottomarini, marines) restano invisibili finché scoperte; c'è un evento dedicato "Stealth detected". [F15-14][F15-13][F6]
- **Linee di difesa.** Elemento grafico sulla mappa, con livello dedicato e bonus. [V nomi] [F6]

### 4.4 Costruzione / acquisto [V] [F15-13]
- **Si compra dal menu info della città**, solo nella **capitale** di un paese posseduto; le navi solo nei porti.
- Il menu mostra **quante unità si possono comprare**, in base alla popolazione della città.
- **Rinforzi:** all'inizio e poi ogni 4 turni ("mensili"). Se la popolazione si dimezza, si dimezzano anche i rinforzi.
- **Pulsanti:** "+" (tenuto premuto compra tutto) e "−" (rivende se l'unità non è stata mossa in questo turno).
- **Tooltip** con le statistiche passando sull'immagine dell'unità.
- **Indicatore sulla mappa:** le città con unità acquistabili hanno un **contorno più spesso**.
- **Auto-produzione** opzionale, con messaggio "Unable to auto-produce units, not enough funds". [F6][F15]
- **Manutenzione:** 1/10 del costo a settimana.

### 4.5 Combattimenti e "log" del turno
- **Lista combattimenti** [V] [F15-17][F6]:
  - partecipanti e luogo;
  - filtro: le mie battaglie / contro giocatori / contro neutrali / tutte;
  - clic su una voce o sul **marker in mappa** per aprirla;
  - **Play** riproduce in sequenza dalla battaglia selezionata, **avanti veloce** per accelerare;
  - nelle opzioni c'è la "velocità battaglia". [F4]
- **Menu Eventi (il "log")** [V] [F6][F15-26]: a inizio turno, con gruppi di eventi e icone dedicate:
  - Sistema, Diplomazia, Classifica (Scoreboard), Stato giocatori, Missioni;
  - Unità disponibili nelle città, Stealth scoperti, Unità rare;
  - Nuove impostazioni proposte, Scenario, Popolazione, ProtoCoins.
  - Alcuni eventi hanno pulsanti (OK/No, Sì/No) per accettare o rifiutare, ad esempio un'alleanza.
- **Beacon:** indicatori che puntano a città, paese o battaglia, usati da eventi e tutorial. [V nomi] [F6]

### 4.6 Lista giocatori e diplomazia [V] [F15-26][F15-14][F4][F6]
- **Menu Giocatori:** elenco dei partecipanti, stato (connesso, disconnesso, ha finito il turno, AFK) e azioni diplomatiche.
- **Stati diplomatici:** Pace, Alleanza, Guerra, Duello.
- **Azioni:** proponi, accetta o rifiuta alleanza e pace, dichiara guerra, proponi duello.
- **Altro:** invio di denaro ad alleati (dopo almeno 3 turni e rank ≥1), espulsione di giocatori inattivi da almeno 3 turni, cessione della proprietà della partita.
- **Contatti** [V] [F15-38]: amici, coalizione, nemici e ignorati in un'unica lista. Passando su un nome si vedono coalizione, avatar e reputazione, con azioni rapide (amico, nemico, ignora, +reputazione).

### 4.7 Chat [V] [F15-28][F7]
- **Canali:** Globale, Stanza (lobby), Partita, Alleati, Coalizione, Privati, Aiuto, Radio, Sistema (sola lettura), più canali di staff (Mods, Admin, Warning, Command, Listen).
  - Un menu a tendina sceglie il canale su cui si scrive.
  - Delle **caselle** scelgono quali canali ricevere.
  - Filtro "mostra solo chat in inglese".
- **Comandi:** `/help <domanda>` (va al primo Supporter disponibile), `/report`, `/pr` (legato ai messaggi privati [D]), `/afk`, `/reset` (ripristina dimensioni e preferenze della chat), `/version`, `/logging`. In passato anche `/connectiontype`. [V] [F7][F14-170]
- **Anti-spam:**
  - **flood control** per canale (lo staff ne è esente);
  - gli **ospiti** devono essere almeno **rank 5** per scrivere;
  - gli utenti registrati devono essere almeno rank 1;
  - eccezioni: `/help` e `/report` funzionano sempre.
- **Dimensioni:** la chat della lobby si espande e si comprime; quella in partita si ridimensiona. Nel 2015 chiedevano una chat **verticale laterale** e caratteri più piccoli. [V] [F14-159]

### 4.8 Zoom, pan e scorciatoie da tastiera

| Comando | Azione | Fonte |
|---|---|---|
| Trascina con il mouse | Sposta la mappa | [F15-27] V |
| Frecce | Spostano la mappa (passo proporzionale allo zoom) | [F15-27][F6] V |
| Rotellina | Zoom | [F15-27] V |
| + / − (anche tastierino) | Zoom avanti/indietro (non funzionano a schermo intero) | [F15-27][F6] V |
| Pulsanti sotto la minimappa | Zoom e interruttori raggio di movimento e di visibilità | [F15-26] V |
| Pinch (touch) | Zoom | [F5] V codice |
| Tab | Rende semi-trasparenti tutti i menu, ripremere per tornare normali | [F15-27][F6] V |
| F11 o pulsante | Schermo intero | [F15-27] V |
| Doppio clic su città | Apre il movimento unità | [F15-27] V |
| 1–9 (menu città aperto) | Movimento rapido di 1 unità del tipo n-esimo | [F6] V/D |
| Editor: Ctrl+Z, Canc, Ctrl+C / Ctrl+V | Annulla, elimina, copia, incolla | [F6] V |
| Editor confini: Ctrl / Alt / Shift | Aggiungi o togli dalla selezione, aggiungi o togli punti, "no snap" | [F6] V |

- I tasti sono ignorati mentre si scrive in un campo di testo. [V] [F6]
- **Zoom predefinito:** l'utente può salvare lo zoom corrente come predefinito ("Default zoom is set to the current zoom"). [V] [F6]

### 4.9 Notifiche
- **Titolo della scheda lampeggiante** quando la finestra non è in primo piano, ad esempio con "Turn started". [V] [F6]
- **Email** a inizio turno nelle partite casual, se c'è un'email valida e le notifiche non sono disattivate. Il messaggio in gioco dice: "We'll notify you by e-mail when the turn ends. You can now safely exit and come back later." [V] [F15-44][F6]
- **Toast** (toastr) sul sito e messaggi nella barra di stato e nel canale Sistema. [V] [F1][F6]
- **Niente notifiche push né Web Notifications:** nessun uso trovato nel codice, e i giocatori chiedono le push (08/2025) contro i giocatori AFK. [V assenza nel codice esaminato] [F6][F16-50308]
- **Suoni e musica:** volumi separati e suoni per le unità. [V] [F4][F6]

### 4.10 Fine turno [V] [F15-44][F15-43][F6]
- Pulsante **Fine turno** nella barra bassa. Nelle casual le mosse vengono **salvate** e si può uscire.
- C'è un avviso di fine turno ("EndTurnWarning").
- Messaggi di attesa: "Waiting for other players...", "Wait for the next turn to begin".
- Il server può **risincronizzare il timer** ("TurnTimeResync").
- Lamentela 2026: "it doesn't always show that it's just waiting for you", e manca un modo per **salvare senza chiudere il turno**. [V] [F16-50523]

### 4.11 Tutorial e onboarding [V] [F6][F14-162]
- **Tutorial interattivo** (una partita privata dedicata), con step:
  - Benvenuto, Zoom, Scelta paese, Menu città, Comprare truppe, Muovere truppe;
  - Fine turno, Combattimento, Risultati, Trasporti, Attacco con trasporti, Linee di difesa;
  - Giocatori, Barra bassa, Barra alta, Aiuto.
- Ha video e indicatori dal 2015. Si può disattivare dalle opzioni.
- **Stanze "Beginners"** con limiti di rank. [V] [F15-8][F13]
- **Schermata di caricamento** con avanzamento a step ("loading 6/7") e, in Silverlight, immagini di suggerimenti: i giocatori ne sentivano la mancanza. [V] [F14-152][F14-159]

### 4.12 Impostazioni dell'account usate in gioco [V] [F4]
- Strategia predefinita.
- Disattiva tutorial.
- Volume effetti e volume musica.
- Mostra etichette dei paesi (livelli).
- Disattiva email di notifica.
- **Disattiva animazioni** (utile sui PC lenti).
- Velocità delle battaglie.
- Mostra solo la chat inglese / scrivi in inglese.

### 4.13 Editor di mappe e scenari (UI) [V] [F6][F13]
- **Strumenti:** selezione multipla, selezione luogo o segmento, aggiungi o rimuovi punti, nuovo percorso, incolla.
- **Livelli e permessi** separati: dati, unità, confini, immagini.
- **Upload dello sfondo** con preparazione lunga ("this may take a few minutes").
- **Editor** di città, paesi e unità con validazioni (popolazione, reddito, rinforzi, dimensioni da 100 a 10.000).
- **Scenari:** lati, eventi per turno.

---

## 5. Pagine del sito e dell'app fuori partita

| Pagina | Cosa contiene | Affid. | Fonte |
|---|---|---|---|
| **Home** | Menu (Gioca come ospite, Giocatori, Forum, Radio, Coalizioni, Features, "Risk Online?", Strategie, Lingua), box di login, carosello, punti di forza ("1-12 minute turns... or 12-24 hour turns"), trailer, screenshot, citazioni dalla stampa, ultime news, link social (Discord, Twitch, YouTube, Facebook, Twitter/X, Reddit) | V | [F1] |
| **Registrazione / login** | Username e password, **email facoltativa** (serve per recupero password e notifiche). Login o registrazione con **Facebook, Twitter, Google, Steam** (la FAQ cita anche Yahoo). Dal profilo si collegano o scollegano i social e si imposta una password | V | [F1][F15-19][F15-21][F15-22] |
| **Ospite** | "Play as guest" sempre visibile in alto, in verde. Limiti: in chat solo da rank 5. Altre restrizioni non documentate | V / I | [F1][F7] |
| **Lobby** (`/games/`) | Lista partite aperte: selezionandone una si vedono i dettagli e il pulsante Join. Interruttore **Rapide/Casual**, 3 stanze per tipo, scheda "**Nuova partita**" a destra, chat in basso, lista utenti a destra (stanza, moderatori, amici). Filtri: tutte, aperte, bloccate, private, scenari, le mie. Ordinamento: turno, giocatori, rank. Partite **promosse** (pagando ProtoCoins vanno in cima) | V | [F15-8][F4][F6] |
| **Nuova partita** (finestra) | Riquadri di mappe con anteprima, mappe **bloccate** con lucchetto e finestra "Unlock Map", pulsante "Browse maps". Ridisegnata nel 2020 per mettere in vetrina più mappe oltre al mondo | V | [F1][F14-281] |
| **Mappe** (`/maps/`) | Catalogo di mappe e scenari della community con voti e "featured" | V | [F6][F7] |
| **Profilo** | Avatar, rank, Elo, reputazione, coalizione, località, stato AFK, medaglie, statistiche dettagliate (battaglie, unità costruite e distrutte per ruolo, paesi e città occupati...), storico partite, upgrade, regalo di ProtoCoins | V (da modello dati e funzioni) / I (layout) | [F4][F7][F18] |
| **Giocatori e classifiche** (`/users/`) | Migliori giocatori e migliori coalizioni. Lamentela 2026: la classifica "only loads the first page"; la ricerca giocatori è disattivata da giugno 2026 | V | [F7][F16-50523][F16-50487] |
| **Coalizioni** (`/cln/`) | Clan, guerre di coalizione a stagioni (con scommesse), tornei con **tabelloni** | V | [F1][F2][F13] |
| **Messaggi privati** | Posta interna (invia, inoltra, elimina; accetta o rifiuta) | V | [F7] |
| **Premium / negozio** | Abbonamento 1, 3 o 6 mesi oppure pacchetto a vita (PayPal); **ProtoCoins** (100 per 1 USD, via Xsolla, anche SMS); "Protoshop" (es. icone di chat); upgrade; incognito; promozione partite. La UI blocca: partite per 10+ giocatori, mappe custom e pubblicazione di scenari senza premium | V | [F15-42][F7][F6] |
| **Forum** | Sezioni per idee, bug, domande, strategie, mappe, tornei, forum per lingua (turco, spagnolo, francese, arabo...) | V | [F16] |
| **Radio** | "atWar Radio" con canale chat dedicato | V | [F1][F15-28] |
| **Traduzioni** | Strumento interno per i traduttori volontari | V | [F7][F13] |
| **Lingue** | Inglese più 32 opzioni: albanese, arabo, bosniaco, bulgaro, cinese semplificato e tradizionale, croato, ceco, olandese, estone, farsi, finlandese, francese, tedesco, greco, ebraico, hindi, ungherese, **italiano**, leetspeak, macedone, norvegese, polacco, portoghese, rumeno, russo, serbo, slovacco, sloveno, spagnolo, svedese, turco. Un sottodominio per lingua e una classe CSS per le lingue da destra a sinistra | V | [F1] |

---

## 6. Community: dimensioni e segnali

| Dato | Valore | Data | Affid. | Fonte |
|---|---|---|---|---|
| Registrati | "quasi 20.000" | 2013 | V (dato vecchio) | [F17] |
| Nuovi account al giorno | ~500 (fine 2018–2019), ~340 (11/2020–09/2021); stima di un utente di un forum concorrente, che aggiunge "I think AtWar is imploding" | 2021 | I | [F20] |
| Messaggi sul forum | General 70.745; Off-topic 121.259; Idee 37.970; Bug 10.844; Domande 12.374 (totali storici) | 08/11/2026 | V | [F16] |
| Giocatori online ora | **Non trovato** (né sulla home né in fonti terze) | — | — | — |
| Staff | 1 sviluppatore-proprietario, circa 11 moderatori, circa 23 supporter volontari | 2026 | V | [F12] |
| Valutazione IndieDB | 8,7 su 148 voti (recensioni soprattutto 2012–2014) | — | I (solo snippet) | [F24] |

Lettura [D]: gioco di nicchia con uno zoccolo duro storico, attività in calo e sviluppo quasi fermo. Il forum resta vivo. Alcuni utenti nel 2026 scrivono "at war is dead".

---

## 7. Punti di forza (UI e tecnologia)
- **Zero installazione e ingresso immediato:** ospite più social login (incluso Steam), email facoltativa. [V] [F1][F15-19]
- **Due ritmi di gioco** dalla stessa interfaccia: partite rapide da 30–120 minuti e casual da un login al giorno, con email di turno. [V] [F1][F15-44]
- **Movimento libero** con anteprima di raggio e percorso e **annullamento facile** (la "x" sul percorso). [V] [F15-14]
- **Pannelli flottanti personalizzabili** (posizione ricordata, riducibili, Tab per vedere sotto): utile su mappe dense. [V] [F15-26]
- **Turni simultanei** con priorità per ordine dei comandi: niente attese tra giocatori, ma conta anche la sequenza. [V] [F15-43]
- **Riepilogo del turno chiaro:** panoramica più lista battaglie riproducibile con play e avanti veloce, eventi raggruppati. [V] [F15-17][F6]
- **Community tooling:** editor di mappe e scenari nel browser, chat multicanale con `/help` verso i Supporter, coalizioni e tornei con tabelloni, 30+ lingue tradotte dalla community. [V]
- **Recensioni storiche** positive sull'interfaccia: "simple and intuitive", "the interface ... is incredible". [I/V] [F18][F25]

## 8. Lamentele frequenti (UI e prestazioni)

| Tema | Dettaglio | Data | Fonte |
|---|---|---|---|
| Lag e disconnessioni | Ritardi alle ore di punta con disconnessioni (recensione ModDB); "Connection error: WebSocket closed" con VPN; logout per inattività dopo circa 10–30 minuti | 2013→2026 | [F24] I; [F16-50487] V |
| Prestazioni del client HTML5 | "a little slow" (alpha 2015); la FAQ ammette che "doesn't run all that well on older devices"; nel 2026 un utente indica nel **codice di gioco** il collo di bottiglia, più che nel server | 2015, 2026 | [F14-152][F15-158][F16-50487] V |
| Chiarezza dello stato | Non è sempre chiaro che si sta aspettando proprio te; pulsanti "lobby" e "leave" confondibili | 2026 | [F16-50523] V |
| Chat | Nessun orario o numero di turno sui messaggi; messaggi persi per chi è offline; in passato troppo grande e orizzontale | 2015, 2026 | [F16-50523][F14-159] V |
| Notifiche | Mancano le **push** e c'è solo l'email; causa AFK | 2025 | [F16-50308] V |
| Classifiche e ricerca | Classifica limitata alla prima pagina; ricerca giocatori disattivata | 2026 | [F16-50523][F16-50487] V |
| Mobile e schermi piccoli | Lobby e chat non adatte agli schermi piccoli (ammesso nel 2015); nessuna app nativa | 2015→ | [F14-155] V; [F22] V |
| Barriere tecniche | Porte non standard bloccate sui Wi-Fi pubblici ("Error during negotiation"); verifiche Cloudflare | 2015→2026 | [F15-47][F16-50429] V |
| Sviluppo lento | Il dev ammette ritmo lento e codice difficile da cambiare | 2026 | [F16-50523] V |
| Pay-to-win percepito | Unità e abilità acquistabili danno vantaggio; ProtoCoins poco chiari | 2014, 2026 | [F18][F16-50523] V; [F24] I |
| Ordine e pulizia della mappa | Chi abbandona lascia "an outrageous mess"; la gestione delle partite casual a turno 0 è debole | 2026 | [F16-50523] V |

---

## 9. Lezioni utili per il nostro gioco (sintesi operativa)
1. **Mobile-first dal giorno 1.** atWar è nato desktop con Silverlight e non ha mai risolto lobby e chat su schermi piccoli. Servono controlli touch progettati, non solo il pinch.
2. **Rendering moderno.** Canvas 2D e Fabric hanno limiti con migliaia di oggetti. Meglio WebGL (Pixi o simili) o un canvas ben ottimizzato, con livelli, cache e livelli di dettaglio come fa già atWar.
3. **Rete standard.** WebSocket su porta 443 (niente porte non standard), riconnessione e ripresa robuste, protocollo compatto ma versionato.
4. **Stato del turno sempre esplicito:** chi manca, quanto tempo resta, "manchi solo tu". Separare "salva bozza" da "fine turno".
5. **Notifiche serie:** Web Push / PWA, più email e Discord opzionali, per le partite lente.
6. **Chat con orario e numero di turno**, persistente per chi è offline (log della partita), con canali come quelli di atWar.
7. **Pannelli flottanti ma con layout predefiniti** buoni, e una modalità "vedi la mappa" (come Tab).
8. **Replay del turno** (panoramica più battaglie) come elemento centrale dell'esperienza.
9. **Ospite più social login**, ma con un percorso chiaro per convertire l'ospite in account.
10. **Infrastruttura scalabile e con backup testati.** Evitare il "server unico" e i dati che crescono senza controllo, come i 9 milioni di file di mappe clone di atWar: deduplicare le mappe e mettere quote.

---

## 10. Fonti

**Sito ufficiale e file pubblici** (consultati l'08/11/2026)
- [F1] Home: https://atwar-game.com/ e https://it.atwar-game.com/ (HTML scaricato), incluse le news in home (es. news_id=395).
- [F2] Configurazione RequireJS: https://atwar-game.com/java/atwar.require.min.js
- [F3] Configurazione client: https://atwar-game.com/java/config.js
- [F4] Core e protocollo: https://atwar-game.com/java/atwar.core.min.js
- [F5] Motore mappa: https://atwar-game.com/java/game/atwar.mapengine.min.js
- [F6] Modulo di gioco: https://atwar-game.com/java/game/atwar.game.min.js
- [F7] Chat della lobby e script del sito: https://atwar-game.com/java/lobby/atwar.chat.min.js, https://atwar-game.com/java/java.min.js
- [F8] Fingerprint2: https://atwar-game.com/java/f2.min.js
- [F9] Header HTTP della home (Cloudflare, ASP.NET).
- [F10] https://atwar-game.com/robots.txt
- [F11] https://atwar-game.com/features.php
- [F12] https://atwar-game.com/team/
- [F13] Archivio news: https://atwar-game.com/news/index.php (pagine 1, 5, 8, 10, 13, 15, 18, 19, 20, 25, 33)
- [F14] News singole: https://atwar-game.com/news/news.php?news_id=N con N = 92, 152, 153, 155, 157, 158, 159, 162, 170, 281, 393, 394, 395
- [F15] FAQ: https://atwar-game.com/faq.php?faq_id=N. Citate come [F15-N] con N = 1, 6, 8, 13, 14, 17, 19, 21, 22, 24, 26, 27, 28, 38, 42, 43, 44, 47 (più 158 per la FAQ 2015 pubblicata come news).
- [F16] Forum: https://atwar-game.com/forum/ ; board https://atwar-game.com/forum/board.php?board_id=3 ; topic https://atwar-game.com/forum/topic.php?topic_id=N con N = 50523, 50487, 50308, 50429

**Terze parti**
- [F17] Gruppo Steam: https://steamcommunity.com/groups/atwargame
- [F18] Recensione su LetsPlayRiskOnline (2014, aggiornata 2022): https://www.letsplayriskonline.com/hubs/atwar-game-com/
- [F19] Intervista allo sviluppatore Ivan (pubblicata 2016, contenuto dell'epoca Silverlight): https://play-risk-online.net/?p=64
- [F20] Forum Warzone/war.app, thread "Future player base" (29/11/2021): https://www.warzone.com/Forum/590013-future-player-base
- [F21] Lutris: https://lutris.net/games/atwar/
- [F22] Ricerca su Google Play "atwar": https://play.google.com/store/search?q=atwar&c=apps
- [F23] Thread Straight Dope (2014) su partite casual a 24 ore: https://boards.straightdope.com/t/armchair-generals-free-online-wargame/696022
- [F24] ModDB e IndieDB, recensioni: https://www.moddb.com/games/atwar/reviews , https://www.indiedb.com/games/atwar/reviews. **Risposta 403, letti solo gli snippet di ricerca** [I]
- [F25] BoardGameGeek / VideoGameGeek (ProtoBytes, 01/12/2012), ModDB company "ProtoBytes" ("Two brothers making games..."), GiantBomb (Desura e Facebook). **403, letti solo gli snippet** [I]: https://videogamegeek.com/videogame/134286/atwar , https://www.moddb.com/company/protobytes , https://giantbomb.com/wiki/Games/AtWar

---

## 11. Lacune / domande aperte
1. **Resa su mobile oggi.** Non ho potuto provare il client su telefono o tablet. Codice e FAQ 2015 dicono che si può, ma non ci sono fonti recenti. Da verificare a mano con un account ospite.
2. **Aspetto reale delle schermate.** Lobby, profilo e classifiche stanno in cartelle escluse da `robots.txt` e non le ho aperte. Il layout è ricostruito da FAQ e codice. I template HTML del client (sotto `/games/`) non sono stati letti. Servono screenshot o un video recente: il canale YouTube ufficiale non era leggibile dallo strumento.
3. **Numeri della community.** Nessun dato ufficiale recente su registrati o giocatori online. L'unico dato ufficiale (circa 20.000) è del 2013. Le stime 2018–2021 sono di terzi. Membri del Discord non verificati.
4. **Recensioni degli store.** Non esistono app, quindi non ci sono recensioni su Play Store o App Store. Le recensioni ModDB e IndieDB (403) e Reddit r/AtWar (non accessibile allo strumento) le ho viste solo in parte tramite snippet.
5. **Trasporto effettivo in uso.** SignalR "auto" usa probabilmente WebSocket nei browser moderni (gli errori "WebSocket closed" del 2026 lo suggeriscono), ma non l'ho osservato dal vivo.
6. **Compilatore C#→JS.** Saltarelle è dedotto dagli schemi del codice, senza conferma ufficiale.
7. **Comportamento esatto dei tasti 1–9** nel menu città: letto nel codice, non provato.
8. **Restrizioni degli ospiti** oltre alla chat (creare partite, classifiche, SP): non documentate.
9. **Prezzi attuali del premium** e loro presentazione nella UI: la pagina premium non è stata consultata (la FAQ indica solo i periodi; 5,99 USD al mese nel 2014 secondo [F18]).
10. **News 2026 (393–395):** scritte in tono satirico. I fatti (crash, migrazione, ritorno online il 10/06/2026) sono confermati dal forum, ma dettagli come "Windows 2000", "Djibouti → Dhaka" e "sviluppatrici dalla Bielorussia" vanno considerati **non affidabili**.
