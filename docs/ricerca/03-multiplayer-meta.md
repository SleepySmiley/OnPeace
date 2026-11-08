# 03 - atWar: multiplayer, community e meta-gioco

Ricerca di riferimento per il design di OnPeace (gioco originale). Qui si descrivono **funzioni e funzionamento** di atWar, non i suoi asset.

- Data della ricerca: 8 novembre 2026.
- Priorità (indicata dal coordinatore): partite tra amici, solo browser desktop. Approfondite: lobby, creazione partita, modalità, diplomazia, chat, riconnessione e abbandono, bot/IA, spettatori e replay. Monetizzazione, premium, clan, leghe, tornei e app mobile: solo 2-3 righe ciascuno.
- Fonti usate: FAQ ufficiale, archivio news ufficiale (33 pagine, 2010-2026), registro aggiornamenti dello sviluppatore sul forum, pagine pubbliche (home, features, coalizioni), script pubblici del client web (letti solo per ricavare **quali opzioni e messaggi** esistono), una recensione esterna. Reddit, ModDB, Giant Bomb e la lista giocatori hanno bloccato l'accesso automatico.

**Legenda affidabilità**

| Sigla | Significato |
|---|---|
| **[V]** | Verificato su fonte ufficiale attuale (FAQ, pagina del sito, client in produzione). |
| **[V-s]** | Verificato, ma da una news o nota di rilascio datata: potrebbe essere cambiato dopo. Indico l'anno. |
| **[D]** | Dedotto o incerto: interpretazione mia, fonte secondaria, o fonti in contrasto. |

Le fonti sono richiamate tra parentesi quadre (es. [FAQ 3.4]) e risolte nella sezione **Fonti** in fondo.

> Nota di contesto. atWar (prima "Afterwind") nasce nel 2010 da due fratelli; dal dicembre 2018 è di proprietà di un singolo sviluppatore ("Dave") [N365][LOG]. Il codice è datato e lo sviluppo procede a scatti. Alcune news del 2023-2026 sono volutamente scherzose (es. "BREAKING NEWS ... Server Crisis") e non vanno prese come descrizione di funzioni.

---

## 0. Sintesi in 10 punti

1. **Nessun matchmaking automatico.** Tutto passa da una lobby con liste di partite create dai giocatori; si entra cliccando una partita, oppure con un link diretto [FAQ 3.2][FAQ 3.4j][N35]. **[V]**
2. **Due ritmi di gioco**, separati anche nella lobby: *Quick* (turni da 1 a 12 minuti, partita di 30-120 minuti) e *Casual* (turni da 12, 24 o 48 ore, con notifica email a ogni nuovo turno) [FAQ 3.3][HOME]. **[V]**
3. **Turni simultanei.** Il turno finisce allo scadere del timer o quando tutti hanno premuto "Fine turno". In caso di conflitto, i movimenti si risolvono nell'ordine in cui ogni giocatore li ha dati [FAQ 3.3][FAQ 3.12][FEAT]. **[V]**
4. **La creazione partita è molto configurabile**, con circa 25 opzioni: tipo, password, squadre, rank, mappa e regione, fondi iniziali, numero di giocatori (fino a 40), durata del turno e della partita, ingresso tardivo, alleanze massime, condizioni di vittoria, unità rare, disattivazione di strategie e upgrade, ecc. Le impostazioni si possono **cambiare a partita in corso con una votazione** (maggioranza, unanimità o bloccate) [JS-NG][N133]. **[V]**
5. **La diplomazia è a tre stati:** Guerra (predefinito), Pace e Alleanza. Passare a Pace o Alleanza richiede l'accettazione dell'altro; tornare in guerra costa 1-2 turni di preavviso. Gli alleati condividono la visione, possono passarsi denaro e vincere insieme [FAQ 4.1]. **[V]**
6. **Uscire dalla partita ha conseguenze in punti (SP):** chi si arrende tiene metà degli SP, chi abbandona perde tutto. Chi chiude il browser ha 10 minuti per rientrare. La riconnessione è automatica [FAQ 3.15][FAQ 3.16][JS-G]. **[V]**
7. **Bot e IA avversarie non esistono.** I paesi non scelti restano "neutrali", con truppe attaccabili. L'IA era in programma nel 2022 ma non risulta realizzata. Il tutorial è una partita privata guidata [N365][N31]. **[V]**
8. **Spettatori sì, replay no.** Da qualsiasi partita si può scegliere "Partecipa" o "Guarda". I replay erano solo un'idea del 2016 [FAQ 3.4j][N164]. **[V]**
9. **Chat a canali** (partita, stanza della lobby, globale, privati, alleati, coalizione, aiuto, radio, sistema), più comandi `/help` e `/report`. Ci sono una lista contatti (amici, nemici, ignorati) e una banlist personale per escludere giocatori dalle proprie partite [FAQ 3.5][FAQ 4.11][N133]. **[V]**
10. **Meta-gioco:** punti strategia (SP) per i rank (0-26), medaglie, Elo per duelli e guerre tra coalizioni (con stagioni), clan chiamati "Coalizioni". Il modello è free-to-play con abbonamento premium e una valuta, i ProtoCoins [FAQ 3.16][N268][FAQ 4.9][FAQ 1.2]. **[V]**

---

## 1. Lobby

### 1.1 Struttura
- La lobby si apre dalla sezione GAMES. Al centro c'è la lista delle partite aperte; a destra la scheda **"New game"** e le liste di giocatori (presenti nella stanza, moderatori, amici, ecc.); in basso la chat [FAQ 3.2]. **[V]**
- Un **interruttore Quick/Casual** divide la lobby in due. Ogni tipo ha **3 stanze**: *Main*, *Beginners* e *Coalition Wars*, quindi 6 stanze in tutto. Se una partita cambia durata del turno, ad esempio da 4 minuti a 12 ore, viene spostata nella stanza giusta [FAQ 3.2][N45]. **[V]** Lo spostamento automatico è documentato nel 2011. **[V-s]**
- **Limiti di rank per stanza.** Sono cambiati più volte:
  - 2012: i rank 0-3 vengono mandati di default in Beginners [N52].
  - 2013: Beginners per i rank 0-4, Main dal rank 3 in su [N121].
  - 2016: Beginners per i rank 0-6, Main senza limite automatico [N172].
  - 2020: restrizioni "semplificate e allentate" [LOG 2020-11-25].
  - **[V-s]** su ogni passaggio; i valori attuali precisi non sono noti **[D]**.
- Altri elementi:
  - contatore dei giocatori presenti in ogni stanza [N65] **[V-s 2012]**;
  - scheda "online" nelle liste utenti e feed delle news ufficiali nella lobby [LOG 2021-12-17, 2021-03-26] **[V-s]**;
  - box chat ridimensionabile [LOG 2020-11-28] **[V-s]**;
  - pulsante Tutorial nel menu della lobby [N31] **[V-s 2011]**;
  - negozio (ProtoShop) e menu Upgrades nella lobby [N110][FAQ 3.16] **[V]**.

### 1.2 Lista partite
- Ogni scheda partita mostra:
  - nome;
  - turno ("settimana") corrente;
  - giocatori presenti e massimo;
  - fondi iniziali;
  - alleanze massime;
  - durata del turno (in minuti o ore);
  - avviso se strategie o upgrade sono disattivati;
  - per le Casual, il **tempo che resta al turno corrente** [FAQ 3.4j][JS-GL]. **[V]**
- Icone di stato [FAQ 3.4j]: **[V]**
  - **NEW**: la partita è creata ma non ancora avviata. Si entra nella schermata di creazione in sola lettura e si viene portati dentro all'avvio.
  - **STAR**: sei un giocatore attivo di quella partita. La stella è **rossa** se è iniziato un nuovo turno, utile per le Casual.
  - **PRIV**: serve la password.
  - **LOCK**: non si accettano più nuovi giocatori.
  - **Promo**: partita sponsorizzata con ProtoCoins, in cima alla lista finché è aperta agli ingressi [N110][JS-GL].
- Filtri e ordinamento:
  - filtri per tipo (aperte, bloccate, private), condizione di vittoria e nome; ordinamento per turno, numero di giocatori o rank medio [N20] **[V-s 2011]**;
  - filtro "My games" [N65] **[V-s 2012]**;
  - il client attuale ha ancora filtro per tipo, ricerca per nome e ordinamento per rank medio; la lista si aggiorna da sola ogni pochi secondi [JS-GL] **[V]**.
- Se una partita è un duello, viene chiesta una conferma prima di entrare [JS-GL]. **[V]**

---

## 2. Creazione partita

### 2.1 Flusso
1. **Finestra iniziale** ("Create new game"), con le opzioni che non si possono più cambiare: tipo, password, squadre, rank, mappa o scenario [FAQ 3.4c][N14]. **[V]**
2. **Schermata "Game options" (pre-partita).** È una stanza d'attesa con lista giocatori per squadra, chat, stato "Ready" di ognuno e tutte le opzioni di gioco, modificabili solo dal creatore [FAQ 3.4c][N65][JS-NG]. **[V]**
3. **Avvio.** Si entra nella **fase di selezione dei paesi**, a turni (vedi 2.6); poi inizia il turno 1 [FAQ 3.9]. **[V]**

Le partite su mappe o scenari creati dagli utenti si avviano dalla sezione Maps/Scenarios [FAQ 3.4c]. **[V]** Dal 2020 la finestra "nuova partita" mette in evidenza anche le altre mappe, non solo quella del mondo [N281]. **[V-s]**

### 2.2 Opzioni della finestra iniziale

| Opzione | Valori | Default / note | Fonte |
|---|---|---|---|
| Ritmo | Quick / Casual | Dipende dalla stanza in cui ti trovi | [JS-IGS] **[V]** |
| Tipo partita | Pubblica, Privata (password obbligatoria), Coalition War (scegli la coalizione avversaria), Duello, Duello privato | Pubblica senza squadre | [FAQ 3.4c][JS-IGS] **[V]** |
| Squadre | 1 (FFA) oppure 2-4 squadre, con nomi personalizzabili | Senza nome, valgono i predefiniti Team Alpha/Beta/Gamma/Delta. Le squadre sono alleate in modo permanente, senza altra diplomazia | [FAQ 3.4c][JS-IGS] **[V]** |
| Rank minimo e massimo | Intervallo di rank ammessi | Per la FAQ è 0-15. Nel 2016 è diventato ±3 rispetto al tuo rank, estendibile a ±5, e automatico solo in Beginners. Il valore attuale è incerto | [FAQ 3.4c][N172] **[V]/[D]** |
| Mappa / scenario | Griglia di mappe; quelle premium appaiono bloccate | Default: mappa del mondo | [FAQ 3.4c][JS-IGS] **[V]** |
| Stanza | Main / Beginners / CW | Le CW finiscono sempre nella stanza CW | [JS-IGS] **[V]** |

Password e squadre "non possono essere cambiate dopo" [N14]. **[V-s 2010]**

### 2.3 Opzioni della schermata "Game options"

Elenco ricavato dai campi che il client invia al server al salvataggio [JS-NG], incrociato con FAQ e news per significato e default.

| Opzione | Funzione | Default / range noti | Fonte |
|---|---|---|---|
| Nome partita | Obbligatorio per avviare | - | [JS-NG] **[V]** |
| Preset mappa (area giocabile) | Sceglie la regione della mappa; più è piccola, più la partita è veloce | Mondo intero; esistono preset regionali, alcuni pensati per 1v1, 2v2, 3v3 e FFA | [FAQ 3.4c][N274] **[V]** |
| Fondi iniziali | Denaro di partenza di ogni giocatore | Valori da menu; l'opzione "1000" è stata aggiunta nel 2020 | [FAQ 3.4c][N311] **[V]** |
| Giocatori massimi | Capienza | Fino a **40** dal 2020 (prima 20). Gli account gratuiti arrivano a **10** | [LOG 2020-03-27][FEAT][JS-NG] **[V]** |
| Durata del turno | Quick: minuti; Casual: ore | Quick 1-12 min (il massimo di 12 serve a evitare abusi); Casual 12, 24 o 48 h | [FAQ 3.3][N9] **[V]** |
| Paesi iniziali | Quanti paesi può scegliere ognuno all'inizio | Da 1 a 99 | [FAQ 3.9] **[V]** |
| Durata partita | Turno massimo; se nessuno ha vinto, vince chi (o la squadra che) ha più SP | Default 50 turni; si è visto anche 500 | [FAQ 3.15][N382] **[V]** |
| Ingresso consentito fino al turno | Oltre quel turno nessuno può più entrare | Default 10; si è visto anche 99 | [FAQ 3.4j][N382] **[V]** |
| Alleanze massime | Quante alleanze può avere ciascuno | Default 3; 0 disattiva la diplomazia d'alleanza. Bloccata nelle partite a squadre | [N121][N162][JS-NG] **[V]** |
| Regola di modifica impostazioni | "Majority", "Unanimous" o "Locked" | Default Unanimous | [N133] **[V-s 2014]**, campo presente in [JS-NG] **[V]** |
| Squadre casuali (con bilanciamento) | Il sistema assegna le squadre al posto dei giocatori | Il criterio di bilanciamento non è documentato | [JS-NG] **[V]**/**[D]** |
| Ingresso immediato (Instant join) | Si entra subito, senza aspettare il turno dopo, ma i rinforzi arrivano solo dal turno successivo | Modificabile anche in partita | [N45][FAQ 3.4j] **[V]** |
| Consenti rientro | Chi ha perso o lasciato può rientrare | - | [N8] **[V-s 2010]**, campo in [JS-NG] **[V]** |
| Città extra ("100 additional cities") | Aggiunge città e paesi minori | Default "sì" dal 2021 | [N8][LOG 2021-06-25] **[V]** |
| Disattiva strategie | Tutte, oppure solo alcune scelte | Utile nei tornei | [N117][LOG 2019-03-31] **[V]** |
| Disattiva upgrade | Toglie i bonus permanenti comprati con SP | - | [N117] **[V]** |
| Disattiva edifici | Esisteva | Rimossa nel 2021 | [LOG 2021-06-13] **[V]** |
| Frequenza unità rare | Probabilità di trovare unità rare nelle città conquistate, anche "nessuna" | - | [N30][JS-NG] **[V]** |
| Condizione di vittoria | Vedi 2.4 | - | [FAQ 3.15][JS-NG] **[V]** |
| Opzione "drop" per i Supporter | Partite-evento che regalano ProtoCoins, solo per lo staff | - | [JS-NG][N292] **[D]** |

- Negli **scenari**, l'autore può impedire di cambiare fondi iniziali, condizione di vittoria e frequenza delle unità rare [JS-NG]. **[V]**
- Nelle **Coalition War**, nome, giocatori massimi, turno limite d'ingresso e rientro sono fissi; anche un ufficiale della coalizione può modificare le altre opzioni [JS-NG]. **[V]**

### 2.4 Condizioni di vittoria
- **Annientamento totale**: si vince quando resta un solo giocatore o un solo gruppo di alleati [FAQ 3.15]. **[V]**
- **Cattura del paese d'origine o della capitale** dell'avversario. C'è una scelta radio tra "solo capitale" e "intero paese" [FAQ 3.15][JS-NG]. **[V]**
- **Cattura di un paese specifico** (la FAQ porta l'esempio del Regno Unito), anche **neutrale**, con l'opzione di **tenerlo per N turni** [FAQ 3.15][N8][N117][JS-GL]. **[V]**
- **Scadenza della durata**: vince chi ha più SP; nelle partite a squadre conta la somma della squadra. Il client avvisa "la partita finirà tra 5 turni" e poi "dopo questo turno" [FAQ 3.4c][JS-G]. **[V]**
- **Vittoria congiunta o pareggio** se restano solo giocatori alleati tra loro [FAQ 3.15][FAQ 4.1]. **[V]**
- L'obiettivo di vittoria si vede nel tooltip della lista partite e nel menu opzioni durante la partita [N8]. **[V-s]**

### 2.5 Pre-partita (sala d'attesa)
- Ogni giocatore vede il proprio stato ("Ready", "Owner"/creatore); il pulsante Ready aggiorna lo stato senza scrivere in chat [N65][JS-NG]. **[V]**
- Ci si sposta di squadra cliccando il nome della squadra; con "squadre casuali" attivo questa scelta sparisce [N65][JS-NG]. **[V]**
- Ognuno sceglie il proprio colore da una tavolozza; il colore preferito viene ricordato per le partite successive [JS-NG][N203]. **[V]**
- Il creatore può mettere **"in attesa" l'avvio**: tutti scelgono i paesi, ma la partita non parte finché lui non toglie la spunta. Serve per aspettare altri giocatori, soprattutto negli scenari [N65]. **[V-s 2012]**
- Il client avvisa all'avvio se la mappa è troppo grande per pochi giocatori, o se si gioca da soli ("impossibile vincere") [JS-NG]. **[V]**
- **Proprietà della partita**:
  - passa da sola a un altro giocatore se il creatore non gioca più [N5];
  - si può cedere a mano al giocatore successivo per SP [N26];
  - dal 2021 passa anche se l'host si disconnette prima dell'avvio [LOG 2021-09-05].
  - **[V-s]**
- **Invito con link diretto**: l'URL della partita (dalla barra degli indirizzi o dalle impostazioni) porta dritto dentro [N35]. **[V-s 2011]** Il client gestisce gli ingressi via link [JS-NG]. **[V]**
- **Promozione a pagamento**: con ProtoCoins la partita finisce in cima alla lista finché accetta ingressi [N110][JS-G]. **[V]**

### 2.6 Selezione dei paesi (prima fase della partita)
- I giocatori scelgono **a turno**, con **30 secondi** per scelta. Il primo paese scelto diventa il **paese d'origine**, segnato da una bandiera del colore del giocatore. Ogni paese ha un costo legato a reddito e truppe [FAQ 3.9]. **[V]**
- Quando tutti sono "ready", oppure hanno raggiunto il massimo di paesi, la partita parte [FAQ 3.9]. **[V]**
- **Penalità per chi lascia scadere il tempo:** dal secondo timeout perde il 5% dei fondi iniziali per ogni timeout (all'inizio era il 10%); al quinto viene espulso [N65]. **[V-s 2012]**
- Negli scenari si sceglie una **fazione predefinita** invece dei paesi [N42][JS-G]. **[V]**
- La strategia (bonus e malus di fazione) si sceglie qui e poi non si cambia più [FAQ 3.9]. **[V]**

### 2.7 Modificare le impostazioni a partita in corso
- Un giocatore **propone** nuove impostazioni. Agli altri si apre il pannello con la proposta e votano. La soglia dipende dalla regola scelta alla creazione: maggioranza, unanimità, oppure impostazioni bloccate [N30][N88][N133][JS-G]. **[V]**
- Casi particolari:
  - passare da Casual a Quick non è più possibile; tra Quick e Casual serve l'unanimità [N88][N91] **[V-s 2012]**;
  - cambiare le alleanze massime richiede l'unanimità [N123] **[V-s 2013]**;
  - il voto "tiene conto delle alleanze" [N88] **[D]**: il dettaglio non è spiegato.
- Si possono votare in partita: nome, giocatori massimi, durata del turno, durata della partita, paesi iniziali, alleanze massime, turno limite d'ingresso, rientro, ingresso immediato, unità rare [JS-G]. **[V]**
- I moderatori possono cambiare le opzioni di qualsiasi partita [N26][N27]. **[V-s 2011]**

### 2.8 Limiti per gli account gratuiti (riassunto)
- Creare partite con **più di 10 giocatori** richiede l'abbonamento [JS-NG]. **[V]**
- Le mappe e gli scenari degli utenti sono premium. Si sbloccano uno per uno a 100 ProtoCoins; le mappe "in promozione" del mese sono gratis per tutti [JS-G][N281]. **[V]**
- Nel 2013 il "Game Options Pack" a pagamento sbloccava: partite private e a squadre, mappe custom, fino a 20 giocatori, rank min/max, "impostazioni avanzate" [N114]. **[V-s 2013]** Oggi private e squadre sembrano libere. **[D]**
- Dal 2016 il duello è gratuito per tutti [N181]. **[V-s]**

---

## 3. Tempo reale e asincrono (Quick e Casual)

| Aspetto | Quick | Casual | Fonte |
|---|---|---|---|
| Durata turno | 1-12 minuti | 12 / 24 / 48 ore | [FAQ 3.3] **[V]** |
| Durata tipica di una partita | 30-120 minuti | "Entra 5-15 minuti al giorno"; quindi più giorni o settimane **[D]** | [HOME] **[V]** |
| Fine del turno | Timer scaduto, oppure tutti hanno premuto "End turn" | Uguale | [FAQ 3.3] **[V]** |
| Uscita sicura | Nessuna: dopo 10 minuti fuori si "abbandona" | Pulsante **"Go to Lobby"**: si esce e si torna più tardi | [N45][FAQ 3.15] **[V]** |
| Notifiche | - | **Email a ogni nuovo turno** (serve un'email nel profilo e le notifiche attive). Il client dice "Ti avviseremo via email quando il turno finisce" | [FAQ 3.3][JS-G] **[V]** |
| Segnale in lobby | - | Stella rossa sulle tue partite con un turno nuovo | [FAQ 3.4j] **[V]** |

Meccanica del turno, comune ai due ritmi:
- Turni **simultanei**: tutti muovono nello stesso periodo, poi c'è la fase di battaglia ("BATTLE PHASE"), con un menu di combattimento che non si può chiudere [FEAT][FAQ 3.6][JS-G]. **[V]**
- **Priorità dei movimenti** nella risoluzione: conta l'ordine in cui ogni giocatore ha dato i comandi, non l'orario. A parità è 50/50 [FAQ 3.12]. **[V]**
- Il pulsante "End turn" compare solo dopo 5 secondi dall'inizio del turno, per evitare clic accidentali [N5]. **[V-s 2010]**
- Dopo "End turn" si può continuare a muovere finché gli altri non hanno finito; esiste anche "save turn" [N45]. **[V-s 2011]**
- All'inizio di ogni turno si apre il menu **Eventi**, che non si chiude finché ci sono decisioni diplomatiche in sospeso [FAQ 3.6]. **[V]**
- I rinforzi arrivano ogni "primo turno del mese", cioè ogni 4 turni [FAQ 3.6][FAQ 3.10]. **[V]**

---

## 4. Ingresso, abbandono, riconnessione, inattività

### 4.1 Entrare in partita
- Cliccando una partita si sceglie **"Join"** o **"Spectate"**. Se non si può più entrare (partita piena, scenario completo, oltre il turno limite) si entra direttamente come spettatore [FAQ 3.4j][JS-G]. **[V]**
- Senza "Instant join", chi entra aspetta l'inizio del turno successivo [FAQ 3.4j]. **[V]**
- **Protezione per chi entra tardi:**
  - tutti iniziano in Pace al turno 1 e passano automaticamente in Guerra al turno 2; chi entra tardi non può attaccare né essere attaccato nel suo primo turno [N65] **[V-s 2012]**;
  - riceve la quantità **media** di unità dei giocatori presenti [N5] **[V-s 2010]**.
- Il client controlla il rank del giocatore rispetto ai limiti della stanza e della partita prima di farlo entrare [JS-GL]. **[V]**

### 4.2 Uscire
Il menu di uscita ha tre voci [N45][FAQ 3.15][FAQ 3.16]. **[V]**

| Azione | Effetto sugli SP | Note |
|---|---|---|
| **Surrender** | Tieni metà degli SP guadagnati | Non disponibile nelle partite in solitario |
| **Abandon / Exit to lobby** | Perdi tutti gli SP | Vale anche se chiudi il browser e non rientri entro **10 minuti** |
| **Go to Lobby** | Nessuna perdita | Solo nelle Casual: è l'uscita "sicura" |

- Chi vince prende **tutti i propri SP più metà di quelli degli avversari**; chi perde ne tiene metà [FAQ 3.16]. **[V]**
- Le partite **in solitario** (usate per provare mappe e scenari) permettono solo l'abbandono e non contano nelle statistiche [N121]. **[V-s 2013]**
- Nel profilo, al posto del rapporto vittorie/sconfitte, ci sono **"% partite vinte"** e **"% partite abbandonate"**, per scoraggiare gli abbandoni. La % di abbandono è stata azzerata per tutti nel 2020, quando è cambiato il modo di calcolarla [N121][LOG 2020-03-27]. **[V]**
- Chi abbandona o viene espulso non riceve i ProtoCoins di fine partita [N292]. **[V-s 2020]**
- **Cosa succede ai paesi e alle truppe di chi se ne va:** non documentato (vedi Lacune). **[D]**

### 4.3 Riconnessione
- Dal 2010 le disconnessioni durante la partita si recuperano in automatico, senza uscire dalla partita, "solo se ti riconnetti nello stesso turno" [N13]. **[V-s 2010]**
- Il client attuale gestisce questi stati: "Connessione instabile, tentativo di riconnessione", "Connessione persa, tentativo n...", "Riconnesso, verifico lo stato della partita", "Riconnesso, riprendo la partita", "Impossibile riconnettersi". In caso di disconnessione forzata dal server, mostra il motivo e riporta alla lobby dopo 5 secondi [JS-G]. **[V]**
- Il client usa una libreria websocket che si riconnette da sola [JS-REQ]. **[V]** Nel 2016 è stata provata una connessione alternativa, attivabile con il comando chat `/connectiontype` [N170]. **[V-s]**
- Un problema reale del 2021: Chrome sospende le schede in background e il giocatore viene disconnesso. Lo sviluppatore ha suggerito ai giocatori di cambiare le impostazioni di Chrome [N347]. **[V-s 2021]**
- Le partite sono **salvate lato server**, così sopravvivono ai riavvii [N5]. **[V-s 2010]** Ci sono però stati incidenti: nel 2020 un riavvio ha cancellato tutte le partite Casual aperte [N313][N314]. **[V-s]**

### 4.4 Inattività ed espulsione
- Si possono espellere **solo giocatori inattivi da almeno 3 turni**. Il client chiede conferma ("Kick X?") e il server rifiuta se la condizione non c'è [N7][JS-G]. **[V]** Chi può espellere (solo l'host o chiunque) non è chiaro **[D]**.
- Nella fase di piazzamento iniziale, prima del turno 1, l'espulsione è libera [N20]. **[V-s 2011]**
- **AFK:** con il comando `/afk` ci si segna assenti. Il pannello del giocatore mostra dove si trova se è offline o AFK [N117][JS-CH]. **[V]**
- Dopo 5 timeout nella selezione dei paesi si viene espulsi (vedi 2.6). **[V-s]**

---

## 5. Modalità di gioco

| Modalità | Come funziona | Fonte |
|---|---|---|
| **FFA (tutti contro tutti)** | La modalità base. La diplomazia è libera, entro il limite di alleanze massime; con 0 alleanze è un FFA puro | [FAQ 4.1][N162] **[V]** |
| **A squadre** | 2-4 squadre alleate in modo permanente. Al posto di "Diplomazia" c'è una scheda "Teams" e si può colorare la mappa per squadra. A fine tempo vince la somma degli SP della squadra | [FAQ 3.4c][N14][N34] **[V]** |
| **Coalition War (CW)** | Due coalizioni (clan) una contro l'altra. La crea un leader o un ufficiale nella stanza CW. Dal 2020 basta 1 giocatore per parte (prima 3). Conta per l'**Elo di coalizione**, con stagioni | [FAQ 4.10][LOG 2020-04-11] **[V]** |
| **Duello** | Tipo di partita 1v1 dedicato. Conta per l'**Elo** personale; serve almeno il rank 2. Dal 2016 i duelli non si dichiarano più a metà partita; un duello Casual può partire senza che l'avversario sia presente | [FAQ 4.12][N91][N181][JS-G] **[V]** |
| **Scenari** | Partite preimpostate dagli utenti: mappa, fazioni, squadre, colori, paesi e unità iniziali, eventi a turno, condizioni di vittoria; la fazione si sceglie all'ingresso | [N42][N43][N88] **[V]** |
| **Mappe custom e preset** | Mappe create con l'editor; i "preset" sono regioni o sottoinsiemi di una mappa (es. Atlantico, Asia centrale, India) | [N88][N274] **[V]** |
| **Solitario / test** | Si può avviare una partita da soli (il client avverte che è impossibile vincere). Non conta nelle statistiche | [JS-NG][N121] **[V]** |
| **Tutorial** | Partita privata guidata (vedi sez. 7) | [N31] **[V]** |
| **Eventi** | Unità speciali a tempo (Babbo Natale, zombie ad Halloween), weekend con SP doppi, partite "drop" che regalano ProtoCoins, maxi-partite 20 contro 20 | [N311][N292][NEWS p.1-3] **[V]** |

- "Classificate" in senso stretto non esistono: non c'è una coda e non c'è un ladder automatico. Contano per l'Elo solo i **duelli** e le **CW**; le altre partite danno SP, che determinano i rank [FAQ 4.10][FAQ 4.12][FAQ 3.16]. **[V]**
- Ogni modalità esiste sia in versione Quick sia Casual. **[V]**

---

## 6. Diplomazia e alleanze

| Stato | Regole | Fonte |
|---|---|---|
| **Guerra** (predefinito) | Si attacca liberamente; non si attraversano le truppe o le linee di difesa nemiche senza combattere | [FAQ 4.1] **[V]** |
| **Pace** | Per attaccare bisogna prima dichiarare guerra, e ci vuole **1 turno**. Si attraversano liberamente le truppe dell'altro | [FAQ 4.1] **[V]** |
| **Alleanza** | Per tornare in guerra servono **2 turni** (secondo la FAQ 3.11 basta 1: le due pagine si contraddicono). Gli alleati vedono le truppe l'uno dell'altro, possono **inviarsi denaro**, attraversare le città vuote dell'alleato e prenderne le città vuote. Vittoria congiunta possibile | [FAQ 4.1][FAQ 3.11][N10] **[V]**/**[D]** |

- **Proposte:** dal menu Giocatori si sceglie un giocatore e si apre il pannello diplomatico. Passare a Pace o Alleanza richiede l'**accettazione** dell'altro, che conferma o rifiuta all'inizio del turno successivo dal menu Eventi [FAQ 4.1][FAQ 3.6]. **[V]**
- **Notifiche diplomatiche** del client: proposta di pace o alleanza, accettata o rifiutata, dichiarazione di guerra, fine dell'alleanza, "X e Y sono ora alleati" [JS-G]. **[V]**
- **Limiti contro gli abusi:**
  - numero massimo di alleanze per giocatore (default 3) [N121][JS-G];
  - per inviare denaro bisogna essere in partita da almeno 3 turni, per evitare che un secondo account passi soldi al principale [N14][JS-G];
  - serve almeno il rank 1 [JS-G];
  - lo scambio di truppe tra alleati non è mai stato abilitato [N5].
  - **[V]**
- Altri strumenti:
  - grafico delle relazioni tra tutti i giocatori nel menu Giocatori [N12] **[V-s]**;
  - canale chat **Alleati** [N8][JS-CH] **[V]**;
  - **Pace obbligata al turno 1** per tutti [N65] **[V-s 2012]**.
- Non c'è un sistema di messaggi diplomatici "formali": si negozia in chat, nei canali di partita, privati o alleati. **[D]**

---

## 7. Bot, IA, single player, tutorial

- **Avversari IA: non esistono.** Nel 2022 lo sviluppatore scriveva che aggiungere giocatori IA "aiuterebbe a riempire le partite", ma che il progetto "è ancora lontano", perché il difficile è integrarli nel codice esistente [N365]. **[V-s 2022]** Le news e il registro successivi non ne parlano più. **[V]**
- **Neutrali:** i paesi non scelti restano **neutrali**, con truppe proprie che si possono attaccare anche durante la Pace iniziale [N65]. **[V]**
  - Le truppe neutrali valgono come rank 0, quindi salendo di rank combatterle rende sempre meno SP [N88]. **[V-s 2012]**
  - Le statistiche distinguono **PvP** (contro giocatori) e **PvN** (contro neutrali) [JS-G]. **[V]**
  - Che i neutrali non attacchino mai è probabile, ma non documentato. **[D]**
- **Tutorial:**
  - al primo accesso una schermata propone il tutorial, che è una **partita privata guidata** a passi [N31];
  - rifatto nel 2015 con video e indicatori [N162];
  - dal 2013 dà SP per ogni capitolo completato (solo al rank 0) [N121];
  - testi riscritti nel 2020 e nel 2022 in base a dati di analytics [LOG 2020-03-21][N365];
  - i tutorial intermedio e avanzato erano solo "in lavorazione" [N365].
  - **[V]**
- **Campagne single player: non esistono.** **[V]** (nessuna menzione in FAQ, news o features)
- **Attese tra i turni:** lo sviluppatore indicava l'attesa di 2-3 minuti come momento in cui i nuovi giocatori abbandonano e progettava un mini-gioco per l'attesa [N365]. **[V-s 2022]** Non risulta realizzato. **[D]**

---

## 8. Spettatori e replay

- **Spettatori:** sì [FAQ 3.4j][JS-G][LOG 2020-11-25]. **[V]**
  - Da qualsiasi partita si sceglie "Spectate" e si guarda senza partecipare.
  - Lo stato mostrato è "Spectator mode".
  - In chat gli spettatori hanno l'etichetta "spectator".
  - Nel 2020 è stato corretto un vecchio bug sugli spettatori e il tasto "ignora".
  - Le news consigliano di guardare partite di giocatori forti per imparare [N381]. **[V]**
- **Cosa vedono gli spettatori** (tutta la mappa o la nebbia di guerra) e se possono scrivere nella chat di partita: non documentato. **[D]**
- **Replay: non esistono.** Nel 2016 erano un'ipotesi ("perhaps even game replays") [N164]. **[V]** La community usa video su YouTube e Twitch [N384][HOME]. **[V]**
- A fine partita c'è una **schermata di statistiche**: vittime civili, città occupate, unità distrutte, costruite e perse, reddito, stato di ogni giocatore (in gioco, vinto, perso, espulso, uscito) [N88][N9]. **[V-s]**
- Esiste un **registro eventi** della partita ("game logs display", aggiornato nel 2020) [LOG 2020-05-03]. **[D]** Il contenuto non è descritto.

---

## 9. Chat, comunicazione e moderazione

### 9.1 Canali
Ci si iscrive con le caselle di spunta a più canali e si scrive in quello selezionato [FAQ 3.5][JS-CH]. **[V]**

| Canale | Uso | Note |
|---|---|---|
| Game | Chat della partita corrente | Non disponibile in lobby |
| Room | Chat della stanza della lobby | Una per stanza [N20] |
| Global | Tra tutte le partite | **Richiede abbonamento o "Customization pack"**; vietato agli ospiti [JS-CH] **[V]** |
| Private | Messaggi privati a un giocatore scelto | Esiste anche il comando `/pr` [JS-CH] **[D]** |
| Allies | Solo gli alleati del momento | [N8][JS-CH] **[V]** |
| Coalition ("Cln") | Membri della propria coalizione | [FAQ 3.5] **[V]** |
| Help | Domande | Dal 2019 sostituito dal comando `/help` verso i Supporter [N240] **[V]** |
| Radio | Chat della radio di atWar | [N113] **[V-s]** |
| System | Messaggi di sistema, sola lettura | [FAQ 3.5] **[V]** |
| Mods / Admin / Warning | Canali dello staff e avvisi | [JS-CH][N26] **[V]** |

- **Regole e limiti:**
  - nei canali pubblici si scrive in inglese, senza spam e con cortesia [N7][N20];
  - c'è un **anti-flood** (la chat globale era limitata a 1 messaggio al minuto nel 2011; oggi il limite è configurabile) [N20][LOG 2020-12-08];
  - per scrivere in chat serve il **rank 2** (dal 2018), per gli ospiti il rank 5; `/help` non ha limiti di rank [LOG 2018-12-30, 2020-12-11][N240].
  - **[V]**
- **Chat per lingua:** nel 2013 sono nati canali locali con le opzioni "Show English Chat" e "Talk in English"; nel 2021 sono stati disattivati "temporaneamente" [N98][LOG 2021-04-12]. **[V-s]**
- **Comandi:**
  - `/help <domanda>` arriva ai Supporter online, che rispondono in privato;
  - `/report <giocatore, regola, link partita>` arriva ai moderatori ed è salvato anche se nessuno è online;
  - `/afk`;
  - `/connectiontype` (test 2016);
  - il comando `/ignore` è stato rimosso nel 2014.
  - [FAQ 1.4][N117][N170][N133] **[V]**
- **Comodità:**
  - freccia su per richiamare l'ultimo messaggio [N26];
  - cronologia recente quando si entra in un canale [N12];
  - pulsante per aprire i link [N111];
  - filtri dei canali salvati tra una sessione e l'altra [N113];
  - chat comprimibile o ridimensionabile [N88][LOG 2020-11-28];
  - icone accanto al nome, comprabili [LOG 2020-12-08].
  - **[V-s]**

### 9.2 Messaggi privati, contatti, blocchi
- **Messaggi privati del sito** con una casella di posta "in stile Facebook" (2014). Il numero di PM e notifiche si vede anche in partita [N131][N93]. **[V-s]** Dal 2021 si sceglie chi può scrivere: tutti, oppure solo gli amici [LOG 2021-09-27]. **[V]**
- **Menu Contatti** (pulsante accanto alla chat): **Amici, membri della Coalizione, Nemici, Ignorati**. Passando il mouse su un nome qualsiasi si vedono coalizione, avatar e reputazione, con i pulsanti aggiungi agli amici o ai nemici, ignora, **+reputazione** [FAQ 4.11]. **[V]**
- Le liste "ignora" del sito e della chat sono unificate [N133]. **[V-s 2014]**
- **Banlist personale:** si impediscono a giocatori scelti di entrare nelle **proprie partite** e in quelle basate sulle proprie mappe o scenari. Nata contro i troll che rovinavano gli scenari [N133]. **[V-s 2014]**
- Si invita in una coalizione dal profilo del giocatore; gli inviti si possono disattivare [FAQ 4.9]. **[V]**

### 9.3 Moderazione
- **Ruoli:**
  - Moderatori, con "~" davanti al nome;
  - Admin, con "*";
  - Supporter, con scudo verde: aiutano i nuovi via `/help`.
  - [N20][LOG 2019-01-28][N240] **[V]**
- **Poteri dei moderatori:**
  - zittire, espellere e ammonire [N20][N26];
  - cambiare le opzioni delle partite [N27];
  - nascondere mappe non conformi [N133];
  - annullare duelli e CW irregolari [N391].
  - **[V]**
- **Politiche:**
  - tolleranza zero sugli exploit: 1 settimana di ban, poi ban a vita [N201];
  - regole contro gli account multipli ("alts") e la condivisione dell'account [N388][N279];
  - definizione di "tossicità" per il forum [N226];
  - bacheca per contestare un ban [LOG 2020-05-03].
  - **[V]**
- **Canali esterni:** forum ufficiale (anche bug report, dal 2021 unico canale) e Discord ufficiale con ruoli assegnati in base al rank [LOG 2021-09-18][N209][N232]. **[V]**

---

## 10. Progressione, profilo e classifiche

- **Account** [FAQ 2.1][FAQ 2.3][FAQ 2.5][HOME][LOG 2020-03-27, 2021-11-12]: **[V]**
  - registrazione con nome e password, email facoltativa;
  - login con Facebook, Twitter, Google o Steam (Yahoo rimosso nel 2020);
  - **gioco come ospite**;
  - cancellazione dell'account dal profilo (il ripristino entro un mese è stato tolto nel 2021).
- **SP (Strategy Points)**: si guadagnano distruggendo unità, conquistando città e paesi e con le medaglie. Durante la partita restano "in sospeso" e a fine partita si incassano come descritto in 4.2. Servono a comprare **upgrade** permanenti e a salire di **rank** [FAQ 3.16]. **[V]**
  - Si guadagnano più SP battendo giocatori di rank più alto [N88][N89]. **[V-s]**
  - Bonus di 300 SP per l'accesso giornaliero [NEWS p.9]. **[V-s 2020]**
  - Moltiplicatori di SP comprabili [N110][N268]. **[V]**
- **Rank:** da 0 a **26** dal 2019 (prima 16); al rank massimo c'è l'icona del teschio [N268]. **[V]**
- **Medaglie**: obiettivi come partite giocate, vinte, turni giocati; ci sono anche "anti-medaglie" per le sconfitte [N54]. **[V-s 2012]**
- **Elo**: si parte da 1000 [FAQ 4.10][FAQ 4.12][N142]. **[V]**
  - Elo totale ed Elo **stagionale**, azzerato ogni stagione (inverno, primavera, estate, autunno).
  - Vale per i duelli (individuale) e per le CW (coalizione).
  - Trofei ai primi 3 della stagione.
- **Profilo**:
  - % partite vinte e abbandonate;
  - ultimi duelli e ultime CW;
  - mappe create;
  - reputazione;
  - trofei;
  - ora locale;
  - icona personalizzata del "Generale" (premium).
  - [N121][FAQ 4.12][N104][N117][FAQ 4.3] **[V]**
- **Classifiche:**
  - indice delle coalizioni con "questa stagione / stagione scorsa", partite, vinte:perse, Elo stagionale, CP guadagnati e Elo totale; le coalizioni inattive da 90 giorni sono nascoste [CLN];
  - elenco giocatori ("Players", /users/), che non è stato possibile leggere (403) [HOME];
  - "Record Book" con record statistici [N362].
  - **[V]**

---

## 11. Clan, leghe, tornei, eventi (sintesi)

- **Coalizioni (clan):** si fondano con **10.000 SP**. Ammettono tutti, su candidatura o su invito. I ruoli sono fondatore, leader e ufficiali. Hanno un forum privato, un canale chat e un pannello dei membri online. Si appartiene a una sola coalizione per volta [FAQ 4.9]. **[V]**
- **Stagioni CW** (equivalenti a una lega): classifica per Elo stagionale e numero di partite. Premi in SP e ProtoCoins ai primi 3, più un trofeo "Most Active". I playoff (al meglio di 5) erano attivi nel 2021-2022 e sono stati tolti nel 2023 per scarsa attività [FAQ 4.10][N367][NEWS p.2][LOG 2021-09-01]. **[V]**
- **Tornei:** organizzati dalla community sul forum, senza un sistema in-game. Un sistema torneo era "in programma" nel 2016; per i playoff CW sono stati aggiunti tabelloni e scommesse in ProtoCoins [N60][N164][LOG 2021-09-15]. **[V]**
- **Eventi:** quiz e indovinelli nella chat della lobby, lotterie, "Fight Night" con scommesse, unità stagionali [NEWS p.4-8][N311]. **[V]**

## 12. Monetizzazione (sintesi)

- Gioco **gratuito**, con **abbonamento premium** di 1, 3 o 6 mesi (dal 2019 il "lifetime" è stato sostituito da quello annuale) oppure con **pacchetti** di funzioni [FAQ 1.2][LOG 2019-01-01][N88]. **[V]**
- Il premium sblocca:
  - più di 10 giocatori per partita, mappe e scenari custom, chat globale [JS-NG][JS-CH];
  - il "Generale", strategie esclusive [FAQ 4.3][N108];
  - niente pubblicità ("Get Premium to hide all ads").
- **ProtoCoins**: 1 USD = 100 PC. Servono a comprare il premium, sbloccare una singola mappa (100 PC), promuovere partite e mappe, moltiplicatori di SP, modalità "Incognito" e icone per la chat. Si guadagnano anche giocando e si possono regalare o trasferire [FAQ 1.2][N110][N281][N292][N334]. **[V]**
- Prezzo citato da fonte esterna: 5,99 USD al mese [REV]. **[D]**

## 13. App mobile, notifiche, altro (sintesi)

- **Nessuna app nativa trovata** (Google Play o App Store). Il client HTML5 funziona nei browser, anche mobili. Nel 2022 Steam e le app erano "in programma", ma rimandate per timore di recensioni negative [N158][N365]. **[V]** Su Steam c'è solo il login, non una pagina del negozio. **[D]**
- **Notifiche:** email a ogni nuovo turno Casual; contatore di PM e notifiche; feed delle news nella lobby; iscrizione alla newsletter dal profilo [FAQ 3.3][N93][LOG 2020-03-22, 2021-03-26]. **[V]**
- **Altro:** interfaccia in circa 33 lingue; editor di mappe e scenari con collaboratori; web radio; forum; Discord, Twitch e YouTube ufficiali [HOME][N83]. **[V]**

---

## 14. Spunti per OnPeace (partite tra amici, desktop)

Sono osservazioni di design, non funzioni di atWar.

1. **Il link d'invito è il centro dell'esperienza tra amici.** atWar ce l'ha, ma come funzione secondaria. Per noi conviene "crea partita, condividi link, gli amici entrano nella sala d'attesa", con password facoltativa e banlist.
2. **Pochi preset, opzioni avanzate a scomparsa.** Le circa 25 opzioni di atWar sono potenti ma pesanti. Si possono proporre modelli già pronti ("Serata veloce", "Partita lunga a turni giornalieri", "A squadre") e un pannello "Avanzate".
3. **Doppio ritmo Quick/Casual con notifiche.** Il turno da 12-48 ore con email è ciò che rende possibile una partita tra amici lungo la settimana. Conviene valutare notifiche browser ed email, e un pulsante di uscita sicura.
4. **Voto sulle impostazioni in partita** (maggioranza, unanimità, bloccato). È utile tra amici: allungare un turno, ammettere un ritardatario.
5. **Abbandono e AFK:** atWar si affida soprattutto alle penalità sugli SP, poco significative tra amici. Meglio una **presa di controllo da parte di un bot o il congelamento** del giocatore assente, e una regola di espulsione per inattività (atWar: 3 turni).
6. **Bot/IA:** è la mancanza più sentita da atWar (partite che non si riempiono, niente pratica in solitario). Per noi vale la pena prevederli dall'inizio, almeno come sostituti di chi abbandona.
7. **Spettatori sì, replay da valutare.** atWar non ha replay; un log di turno salvato lato server li renderebbe possibili quasi gratis.
8. **Robustezza della connessione:** riconnessione automatica con ripristino dello stato, e attenzione alla sospensione delle schede in background nei browser (problema reale di atWar nel 2021). Le partite vanno salvate sul server.

---

## 15. Lacune / domande aperte

- **Cosa succede alle truppe e ai paesi di chi abbandona o viene espulso:** restano fermi, diventano neutrali o spariscono? Nessuna fonte lo dice.
- **Chi può espellere un inattivo:** solo l'host o qualsiasi giocatore? Il client invia la richiesta, ma i permessi lato server non sono documentati.
- **Valori esatti dei menu:** le durate Quick selezionabili (es. 1, 2, 3, 5, 12 min?), i fondi iniziali disponibili, il range di "durata partita" e "ingresso fino al turno". Lo script mostra i campi, ma non le opzioni, che arrivano dal server.
- **Limiti di rank attuali** delle stanze e delle partite: le fonti 2013, 2016 e 2020 si contraddicono; la FAQ dice ancora 0-15.
- **Alleanza:** 1 o 2 turni per romperla? La FAQ 4.1 e la FAQ 3.11 si contraddicono.
- **Spettatori:** vedono tutta la mappa o la nebbia di guerra di qualcuno? Possono scrivere nella chat di partita? C'è un ritardo anti-imbroglio?
- **Neutrali:** sono del tutto passivi o hanno un comportamento di gioco (rinforzi, contrattacchi)?
- **Squadre casuali "bilanciate":** con quale criterio (rank, SP)?
- **Cosa resta oggi a pagamento** tra private, squadre e impostazioni avanzate: la pagina premium richiede il login e non era leggibile.
- **Stato attuale del servizio** (2026): le news recenti parlano di crisi e migrazione dei server in tono scherzoso; l'attività reale della community non è verificabile.
- **Fonti non raggiunte:** Reddit r/AtWar, ModDB, IndieDB e Giant Bomb (bloccati all'accesso automatico), pagina premium e lista giocatori (403), video YouTube (nessun tutorial specifico trovato), Wikipedia (non cercata a fondo).

---

## Fonti

Pagine ufficiali (atwar-game.com):
- [HOME] Home page - https://atwar-game.com/
- [FEAT] Game features - https://atwar-game.com/features.php
- [CLN] Indice coalizioni - https://atwar-game.com/cln/
- [LOG] "atWar updates log" (registro dello sviluppatore 2018-2022, forum) - https://atwar-game.com/forum/topic.php?topic_id=39941
- [NEWS p.N] Archivio news, pagina N - https://atwar-game.com/news/index.php?page=N (pagine 1-33 consultate)

FAQ (https://atwar-game.com/faq.php?faq_id=...):
- [FAQ 1.2] Premium features - faq_id=42
- [FAQ 1.4] How to get help - faq_id=49
- [FAQ 2.1] Registration - faq_id=19 · [FAQ 2.3] Social media - faq_id=21 · [FAQ 2.5] Deleting account - faq_id=23
- [FAQ 3.2] The lobby - faq_id=8
- [FAQ 3.3] Quick / Casual games - faq_id=44
- [FAQ 3.4j] Joining a game - faq_id=9
- [FAQ 3.4c] Creating a game - faq_id=10
- [FAQ 3.5] Chat room - faq_id=28
- [FAQ 3.6] Game interface - faq_id=26
- [FAQ 3.9] Country selection - faq_id=12
- [FAQ 3.10] Buying troops - faq_id=13
- [FAQ 3.11] Moving troops and attacking - faq_id=14
- [FAQ 3.12] Who moves first - faq_id=43
- [FAQ 3.15] Ending the game and Victory conditions - faq_id=18
- [FAQ 3.16] Strategy Points - faq_id=6
- [FAQ 4.1] Diplomacy - faq_id=16
- [FAQ 4.3] Generals - faq_id=41
- [FAQ 4.9] Coalitions - faq_id=36
- [FAQ 4.10] Coalition Wars - faq_id=39
- [FAQ 4.11] Contacts menu - faq_id=38
- [FAQ 4.12] Duels and Elo - faq_id=40

News (https://atwar-game.com/news/news.php?news_id=...; tra parentesi la data):
- [N5] id=5 v0.87 (09.11.2010) · [N7] id=7 v0.88 (14.11.2010) · [N8] id=8 v0.9 (19.11.2010) · [N9] id=9 v0.91 (25.11.2010) · [N10] id=10 v0.911 (29.11.2010)
- [N12] id=12 v0.93 (09.12.2010) · [N13] id=13 v0.94 (12.12.2010) · [N14] id=14 v0.95 squadre e private (21.12.2010)
- [N20] id=20 v0.96 stanze e filtri (26.01.2011) · [N26] id=26 v0.975 (10.02.2011) · [N27] id=27 v0.98 (20.02.2011) · [N30] id=30 v0.984 (26.02.2011)
- [N31] id=31 New tutorial (07.03.2011) · [N34] id=34 Coalition wars (16.03.2011) · [N35] id=35 Duelli e link diretto (24.03.2011)
- [N42] id=42 Scenarios (29.04.2011) · [N43] id=43 Scenarios update (04.05.2011) · [N45] id=45 Casual games (30.05.2011)
- [N52] id=52 Mini-update (09.01.2012) · [N54] id=54 Medals and Coalitions (01.02.2012) · [N60] id=60 Tournaments forum (24.03.2012) · [N65] id=65 Peace on first turn (18.06.2012)
- [N83] id=83 Collaborators (19.11.2012) · [N88] id=88 atWar release notes (02.12.2012) · [N89] id=89 (12.12.2012) · [N91] id=91 Duel game type (17.12.2012) · [N93] id=93 (30.12.2012)
- [N98] id=98 Languages update (04.02.2013) · [N104] id=104 Maps created in profiles (15.04.2013) · [N108] id=108 Hybrid Warfare premium (07.05.2013) · [N110] id=110 Proto-goodies (22.05.2013) · [N111] id=111 (30.05.2013) · [N113] id=113 Radio (28.06.2013) · [N114] id=114 Game Options Pack (02.07.2013)
- [N117] id=117 Some new features (06.08.2013) · [N121] id=121 Coalitions, alliances (04.10.2013) · [N123] id=123 Max Alliances unanimous (06.11.2013)
- [N131] id=131 New website (07.04.2014) · [N133] id=133 Banlist and changing settings (24.07.2014) · [N142] id=142 CW season ranking (01.03.2015)
- [N158] id=158 FAQ HTML5 (06.10.2015) · [N162] id=162 What we've been up to (30.11.2015) · [N164] id=164 Happy New Year 2016 (01.01.2016) · [N170] id=170 New connection method (20.02.2016) · [N172] id=172 Default rank limits (04.03.2016) · [N181] id=181 Changes to duels (03.05.2016)
- [N201] id=201 Zero tolerance exploits (18.10.2017) · [N203] id=203 Test server, preferred color (11.11.2017) · [N209] id=209 Discord (26.11.2017) · [N226] id=226 Toxicity (17.12.2018) · [N232] id=232 Discord (08.02.2019) · [N240] id=240 Supporter Help chat (25.02.2019)
- [N268] id=268 New ranks (09.12.2019) · [N274] id=274 New presets (17.01.2020) · [N279] id=279 Account sharing (27.01.2020) · [N281] id=281 UI e mappe per non-premium (02.03.2020) · [N292] id=292 ProtoCoins giocando (04.06.2020)
- [N311] id=311 20v20 World War (27.11.2020) · [N313] id=313 / [N314] id=314 Casual games persi (09.12.2020) · [N334] id=334 ProtoCoin transfers (10.04.2021) · [N347] id=347 Disconnessioni Chrome (29.06.2021)
- [N362] id=362 Record Book (24.01.2022) · [N365] id=365 "atWar 2022 and beyond" (28.02.2022) · [N367] id=367 Winter 2022 CW (01.03.2022) · [N381] id=381 10 Ways to improve (16.03.2024) · [N382] id=382 Game of the Year (16.03.2024) · [N384] id=384 (17.10.2024) · [N388] id=388 Alts (13.08.2025) · [N391] id=391 New Moderator (31.03.2026)

Client web pubblico (letto solo per ricavare l'elenco di opzioni e messaggi; nessun codice riutilizzato):
- [JS-IGS] Finestra opzioni iniziali - https://atwar-game.com/java/lobby/atwar.igs.min.js
- [JS-NG] Schermata "Game options" / pre-partita - https://atwar-game.com/java/lobby/atwar.newgame.min.js
- [JS-GL] Lista partite e stanze della lobby - https://atwar-game.com/java/lobby/atwar.games.min.js
- [JS-CH] Chat - https://atwar-game.com/java/lobby/atwar.chat.min.js
- [JS-G] Client di gioco - https://atwar-game.com/java/game/atwar.game.min.js
- [JS-REQ] Configurazione dei moduli - https://atwar-game.com/java/atwar.require.min.js

Fonti esterne:
- [REV] LetsPlayRisk, "AtWar Game Review" (2014, aggiornata 2022) - https://www.letsplayriskonline.com/hubs/atwar-game-com/
