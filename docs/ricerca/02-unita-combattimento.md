# 02 — Unità e sistema di combattimento di atWar (riferimento di design)

> Ricerca svolta l'8 novembre 2026 su fonti pubbliche. Serve solo come **riferimento sulle meccaniche**: nessun asset, nome, testo o grafica di atWar va riusato nel nostro gioco.

## Come leggere questo documento

Ogni affermazione porta un'etichetta di affidabilità e un codice fonte (elenco completo nella sezione 10).

| Etichetta | Significato |
|---|---|
| **[UFFICIALE]** | Pagine del sito atWar, FAQ, note di rilascio, simulatore ufficiale, post di sviluppatori/admin (Ivan, Amok, Dave). |
| **[COMUNITÀ]** | Guide, test o codice di giocatori/moderatori, senza conferma esplicita degli sviluppatori. |
| **[DEDOTTO]** | Ragionamento nostro sulle fonti citate. Da verificare. |
| **[INCERTO]** | Fonti in contraddizione, informazione forse superata o dato senza spiegazione. |

**Fonte principale dei numeri.** Le statistiche delle unità vengono dalla pagina ufficiale *Units and Strategies* [U-PAGE] e dall'endpoint che la alimenta, interrogato per ognuna delle 22 strategie [U-AJAX], scaricati l'8/11/2026. Sono quindi i valori **attuali** del server, senza upgrade e senza Generale. I dati coincidono con quelli incorporati nel simulatore di battaglia ufficiale [SIM].

**Età delle fonti.** La FAQ risale all'epoca "Afterwind" (2010-2012). Diverse regole sono cambiate poi nelle note di rilascio. Dove le fonti divergono lo segnalo.

---

## 0. Sintesi: i numeri chiave

| Tema | Valore | Affidabilità |
|---|---|---|
| Categorie di unità | Terra, mare, aria + edifici (immobili) + unità rare + Generale | UFFICIALE [F-3], [N-211], [SIM] |
| Unità base acquistabili (mappa mondo) | 14 mobili + 6 edifici + Generale (premium); 2 unità legate a strategie/eventi (Air Mech, Scorcher Missile) | UFFICIALE [U-PAGE] |
| Punti vita (HP) | 7 per tutte le unità normali; 1 il Generale; 20 gli edifici | UFFICIALE [U-PAGE], [N-29], [N-248] |
| Attacco/difesa | Valore **massimo** del danno inflitto in un colpo: si tira un numero da 1 al massimo | UFFICIALE [F-17], [N-27] |
| Critico | Probabilità di solito 5%; aggiunge al tiro il valore massimo (es. 3 + 7 = 10) | UFFICIALE [F-17], [N-88] |
| Ordine nello scontro | Attacca per prima l'unità con l'attacco più alto; difende per prima quella con la difesa più alta; il danno in eccesso passa all'unità successiva | UFFICIALE [F-17], [FO-1215] |
| Risoluzione | Colpi simultanei, round dopo round, fino all'eliminazione di una parte; in caso di distruzione reciproca finale vince il difensore | UFFICIALE [F-17]; DEDOTTO "fino all'eliminazione" |
| Dopo la battaglia | Gli HP dei superstiti tornano al massimo | UFFICIALE [F-17] |
| "Stack bonus" | Il lato più debole (attacco+numero contro difesa+numero) tira con un dado "truccato" verso i valori bassi | COMUNITÀ [FO-26143], [FO-50250]; principio UFFICIALE [N-30] |
| Mantenimento | 1/10 del costo d'acquisto, ogni turno | UFFICIALE [F-13], [F-15] |
| Tempo di produzione | Nessuno: l'acquisto è immediato, limitato dai "rinforzi" disponibili in città (ricaricati ogni 4 turni) | UFFICIALE [F-13] |
| Esperienza/veterania | Non esiste (nessun campo esperienza nei dati unità) | DEDOTTO [SIM], [U-PAGE] |
| Strategie | 22 opzioni (inclusa "None"), modificano le statistiche per ruolo di unità | UFFICIALE [U-AJAX] |

---

## 1. Concetti di base

### 1.1 Ruoli di unità
- Ogni unità ha un **ruolo** fisso (es. Infantry = "Ground Main Defence", Submarine = "Naval Stealth", Sentry Plane = "Air Support"). Strategie e upgrade agiscono sui **ruoli**, non sulle singole unità: così valgono anche sulle mappe personalizzate [UFFICIALE, F-3, N-88].
- Esistono anche i ruoli **Rare** (compaiono solo a caso quando si conquista una città) e **Other** (liberi, decisi dall'autore della mappa) [UFFICIALE, F-3, N-88].
- ID dei ruoli nei dati del simulatore [UFFICIALE, SIM]: 1 Tanks (Ground Main Attack), 4 Infantry (Ground Main Defence), 5 Militia (Ground Secondary Defence), 6 Anti-aircraft (Ground Special Defence), 7 Marines (Ground Stealth), 12 Destroyer (Naval Main Attack), 16 Submarine (Naval Stealth), 18 Transport (Naval Transport), 22 Bombers (Air Main Attack), 25 Helicopters (Air Special Attack), 27 Stealth (Air Stealth), 28 Sentry Plane (Air Support), 29 Air Transport, 33 General, 34 Fortifications, 35 Recruitment Center, 36 altri edifici difensivi/radar, 37 Bank.

### 1.2 Campi di un'unità (utile come schema per il nostro gioco)
Il simulatore ufficiale espone i campi del database unità [UFFICIALE, SIM]: `type` (1 terra, 2 mare, 3 aria, 4 edificio), `max_attack`, `max_defence`, `move_range`, `view_range`, `cost`, `capacity`, `crit` (%), `hp`, `collateral`, `is_stealth`, `is_general`, `is_rare`, `is_transportable`, `can_take_cities`, `transported_unit_id` (quale unità può trasportare), `chance_to_find` / `min_to_find` / `max_to_find` (per unità rare ed edifici trovabili), `min_week` / `max_week`, `country_ids` / `exclude_countries` (rare legate a paesi), `defbonus` (lista di bonus difensivi contro unità specifiche).

### 1.3 Significato delle colonne della pagina unità
| Colonna | Significato | Affidabilità |
|---|---|---|
| Attack / Defence | Danno massimo per colpo in attacco / in difesa | UFFICIALE [F-17] |
| Crit. | Probabilità di colpo critico, in % | UFFICIALE [N-88], COMUNITÀ [FO-26143] |
| HP | Punti vita | UFFICIALE [U-PAGE] |
| Range | Raggio di movimento per turno (le strategie "+movimento" lo cambiano) | UFFICIALE [U-AJAX], [F-14] |
| View | Raggio di visione; da esso dipende anche il raggio di rilevamento stealth | UFFICIALE [F-14], [F-34] |
| Capacity | Posti di trasporto | UFFICIALE [U-PAGE], [F-14] |
| Cost | Prezzo d'acquisto | UFFICIALE [U-PAGE] |
| Collateral | Danno extra che colpisce solo la popolazione civile della città attaccata | UFFICIALE [N-88], [FO-48070] |
| Defence bonus | Bonus/malus di difesa contro unità specifiche, o "in propria città" / "in linea difensiva" | UFFICIALE [U-PAGE], [SIM] |

---

## 2. Unità predefinite (mappa mondo, strategia "None", senza upgrade)

Valori attuali [UFFICIALE, U-PAGE + U-AJAX, scaricati 08/11/2026]. Il mantenimento è calcolato come 1/10 del costo [UFFICIALE, F-13]. Stealth, trasportabilità e conquista città vengono dai dati del simulatore [UFFICIALE, SIM].

### 2.1 Unità terrestri

| Unità (ruolo) | Att | Dif | Crit% | HP | Mov. | Vista | Costo | Mant./turno | Collat. | Bonus difesa | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| General (Premium) | 1 | 1 | 0 | 1 | 6 | 16 | 0 | 0 | 0 | — | Dà bonus allo stack se si comprano upgrade (sez. 5.6) |
| Militia (Ground Secondary Defence) | 3 | 4 | 0 | 7 | 2 | 16 | 30 | 3 | 0 | −1 vs Helicopters | "Truppe stazionarie poco addestrate, solo per difesa base" |
| Infantry (Ground Main Defence) | 4 | 6 | 5 | 7 | 6 | 16 | 70 | 7 | 0 | −2 vs Helicopters | Unità difensiva principale |
| Tanks (Ground Main Attack) | 8 | 4 | 5 | 7 | 7 | 16 | 120 | 12 | 2 | — | Offensiva, difesa debole |
| Marines (Ground Stealth) | 7 | 3 | 5 | 7 | 6 | 20 | 160 | 16 | 0 | +1 vs Infantry | Invisibili; trasportabili anche da Submarine/Helicopters |
| Anti-aircraft (Ground Special Defence) | 1 | 3 | 5 | 7 | 4 | 16 | 180 | 18 | 0 | +8 vs Sentry Plane, Air Transport, Bombers, Stealth, Helicopters | Solo difesa antiaerea |

### 2.2 Unità navali (costruibili solo nei porti [UFFICIALE, F-13])

| Unità (ruolo) | Att | Dif | Crit% | HP | Mov. | Vista | Capacità | Costo | Mant. | Collat. | Bonus difesa | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Submarine (Naval Stealth) | 7 | 5 | 5 | 7 | 10 | 16 | 2 (solo Marines) | 200 | 20 | 0 | — (descrizione: "+1 difesa vs Bombers", non presente nei dati) | Invisibile; non conquista città |
| Transport (Naval Transport) | 1 | 2 | 5 | 7 | 10 | 16 | 10 | 250 | 25 | 0 | — | Trasporta unità terrestri |
| Destroyer (Naval Main Attack) | 9 | 7 | 5 | 7 | 10 | 16 | — | 250 | 25 | 2 | +1 vs Bombers | Si chiamava "Battleship" fino al 2011 [N-33] |

### 2.3 Unità aeree

| Unità (ruolo) | Att | Dif | Crit% | HP | Mov. | Vista | Capacità | Costo | Mant. | Collat. | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Bombers (Air Main Attack) | 6 | 6 | 5 | 7 | 15 | 24 | — | 160 | 16 | 4 | Raggio lungo; può scortare unità deboli grazie alla difesa 6 [N-29] |
| Helicopters (Air Special Attack) | 6 | 4 | 5 | 7 | 8 | 20 | 0 (1 Marine con upgrade o Desert Storm) | 170 | 17 | 1 | Efficace contro Infantry/Militia (che hanno malus contro di lui) |
| Stealth (Air Stealth) | 7 | 4 | 5 | 7 | 15 | 24 | — | 300 | 30 | 3 | Invisibile |
| Sentry Plane (Air Support) | 1 | 4 | 0 | 7 | 20 | 60 | — | 400 | 40 | 0 | Ricognizione; rileva stealth; risulta stealth nei dati [SIM] |
| Air Transport (Air Transport) | 1 | 2 | 5 | 7 | 13 | 24 | 3 | 600 | 60 | 0 | Trasporta unità terrestri |

### 2.4 Unità speciali presenti nella tabella

| Unità | Att | Dif | Crit% | HP | Mov. | Vista | Costo | Collat. | Stato |
|---|---|---|---|---|---|---|---|---|---|
| Air Mech | 5 | 7 | 5 | 7 | 9 | 16 | 50 | 0 | Unità della strategia Aerial Defender ("versione aerea del Mech rare") [UFFICIALE, N-317]. Che sia acquistabile solo con quella strategia: **DEDOTTO** |
| Scorcher Missile | 20 | 1 | 10 | 1 | 15 | 20 | 700 | **350** | Nessuna descrizione né nota di rilascio trovata. Funzione e disponibilità: **INCERTO** |

### 2.5 Edifici (non si muovono, uno per tipo per città [UFFICIALE, N-211, N-248])

| Edificio | Att | Dif | Crit% | HP | Vista | Costo | Effetto |
|---|---|---|---|---|---|---|---|
| Radar Array | 0 | 1 | 0 | 20 | 150 | 300 | Vista 150, utile per scoprire stealth |
| Coastal Battery | 0 | 1 | 5 | 20 | 16 | 380 | +20 difesa vs Destroyer (la descrizione dice "vs unità navali") |
| Bank | 0 | 1 | 0 | 20 | 0 | 700 | −10 mantenimento per le unità prodotte in quella città [N-248] |
| Recruitment Center | 0 | 1 | 0 | 20 | 0 | 1000 | +3 rinforzi per ciclo di reclutamento |
| Anti-Aircraft Defences | 0 | 1 | 5 | 20 | 16 | 1000 | +20 difesa vs Sentry Plane, Stealth, Bombers, Air Transport (non vs Helicopters) |
| Fortifications | 0 | 2 | 0 | 20 | 0 | 1400 | +1 difesa a tutte le unità nella città |

- Gli edifici si possono anche **trovare** nelle città conquistate, come le rare (probabilità `chance_to_find` = 6 nei dati) [UFFICIALE, N-211, SIM]. A differenza delle rare, pagano il mantenimento [UFFICIALE, N-211].
- Dal 2021 gli edifici non si possono più disattivare nelle impostazioni [UFFICIALE, N-343, N-355].
- Storia dei costi: tutti 700 al lancio (2019); poi Fortifications 1400, Recruitment Center 1000, Radar 300, AA Defences 1000 [UFFICIALE, N-301].
- Fortifications nel 2021: "Defense decreased from 6 to 2 (prima solo le unità con difesa ≥6 potevano ricevere il bonus)" [UFFICIALE, N-355]. Il meccanismo dietro questa frase non è spiegato: **INCERTO**.

### 2.6 Requisiti di sblocco (upgrade comprati con Strategy Points)
Elenco del 2012-2015, aggiornato al 6/6/2015 [COMUNITÀ, FO-6309]. Prezzi in SP per utenti premium (tra parentesi senza premium). Può essere cambiato poi.

| Unità/ruolo | Upgrade | Costo SP |
|---|---|---|
| Submarine (Naval Stealth) | Naval Stealth | 90 (100) |
| Sentry Plane (Air Support) | Air support | 360 (400) |
| Marines (Ground Stealth) | Ground Stealth | 900 (1000) |
| Militia (Ground Secondary Defence) | Ground Secondary Defence | 1800 (2000) |
| Anti-aircraft (Ground Special Defence) | Ground Special Defence | 7650 (8500); dal 2011 però disponibile dall'inizio [UFFICIALE, N-39] → **INCERTO** |
| Helicopters (Air Special Attack) | Air Special Attack | 14850 (16500) |
| Stealth (Air Stealth) | Air Stealth | 18000 (20000) |
| Air Transport | — | "Air Transport is now available by default" (note sulle mappe personalizzate, novembre 2012) [UFFICIALE, N-76] |
| General | Solo account Premium | [UFFICIALE, F-41] |

Infantry, Tanks, Transport e Destroyer sono disponibili da subito [DEDOTTO: assenti dalla lista di sblocco].

Upgrade di potenziamento (stessa fonte) [COMUNITÀ, FO-6309; UFFICIALE per i sei del 2016, N-175]: +5 capacità Transport, +1 capacità Air Transport (×2), +1 capacità Submarine, +1 capacità Helicopters (solo Marines, 2016), +3 HP a tutti i trasporti, +1/+3 movimento per vari ruoli, −10/−30/−50 costo per vari ruoli, +2 critico per vari ruoli, +1 vista globale (×2), +1 difesa Ground Special Defence, +10% lunghezza linee difensive (×2, 2016), +1 critico Tanks (2016).

---

## 3. Abilità speciali e regole per tipo

### 3.1 Trasporto e sbarchi
- Due trasporti "veri": **Transport** (mare, capacità 10) e **Air Transport** (aria, capacità 3). I **Submarine** portano solo Marines (2) [UFFICIALE, F-14, U-PAGE]. Gli **Helicopters** possono portare Marines con l'upgrade o con Desert Storm [UFFICIALE, N-175, N-97, N-231].
- Carico: nel menu "Move troops" si scelgono unità terrestri e si premono "load to Air Transport" / "load to Transport", se nello stack c'è un trasporto [UFFICIALE, F-14].
- **Le unità caricate non combattono se il trasporto è attaccato e muoiono se il trasporto viene distrutto** [UFFICIALE, F-14, N-8, N-13].
- Dal 2010 i Submarine non possono conquistare città senza Marines a bordo [UFFICIALE, N-14].
- Tecniche dei giocatori: "catena di trasporti" (lasciare la fanteria in acqua e riprenderla con un altro trasporto per allungare la portata); i trasporti contano nel calcolo del "turnblock" [COMUNITÀ, FO-15381, FO-16145].
- Lo sbarco non ha regole speciali documentate (nessun malus d'attacco anfibio trovato): **DEDOTTO/INCERTO**.

### 3.2 Aerei
- **Gli aerei non conquistano città.** Possono distruggere tutte le unità dentro, poi "parcheggiano" accanto alla città [UFFICIALE, N-9]. Nei dati: `can_take_cities` = 0 per Bombers, Helicopters, Stealth, Sentry Plane [UFFICIALE, SIM]. L'Air Transport risulta 1 (grazie al carico) [UFFICIALE, SIM].
- Nell'editor delle mappe le unità aeree hanno "can take units" disattivato di default [UFFICIALE, N-76].
- Solo le unità aeree possono attraversare le zone "no-go" senza fermarsi [UFFICIALE, N-124].
- **Nessun carburante, nessun obbligo di rientro alla base**: si muovono come le altre unità, con il loro raggio per turno [DEDOTTO: nessuna regola del genere in FAQ, note di rilascio o dati unità].
- Difese contro gli aerei: Anti-aircraft +8 contro 5 tipi d'aereo; Anti-Aircraft Defences +20; Destroyer +1 vs Bombers [UFFICIALE, U-PAGE].

### 3.3 Stealth (Marines, Submarine, Stealth, Sentry Plane)
- Invisibili al nemico finché non vengono **rilevati** o **partecipano a una battaglia**. Dopo una battaglia, per tornare invisibili devono rientrare in una propria città [UFFICIALE, F-3, F-13].
- Rilevamento: avviene **solo all'inizio del turno**. Raggio di rilevamento proporzionale alla vista e diverso per unità terrestri/navali/aeree. Le unità scoperte compaiono nel menu Eventi; se il turno dopo sono fuori raggio, tornano invisibili [UFFICIALE, F-34, N-16].
- Trucco noto: i movimenti delle unità stealth lasciano "linee" visibili nel log di battaglia [COMUNITÀ, FO-15381].

### 3.4 Anti-aerea, difese costiere, bonus/malus "contro"
Bonus difensivi attuali [UFFICIALE, U-PAGE]:

| Unità che difende | Contro | Bonus |
|---|---|---|
| Anti-aircraft | Sentry Plane, Air Transport, Bombers, Stealth, Helicopters | +8 |
| Anti-Aircraft Defences (edificio) | Sentry Plane, Stealth, Bombers, Air Transport | +20 |
| Coastal Battery (edificio) | Destroyer | +20 |
| Marines | Infantry | +1 |
| Destroyer | Bombers | +1 |
| Infantry | Helicopters | −2 |
| Militia | Helicopters | −1 |

- La FAQ (vecchia) elenca bonus in parte diversi: Submarine contro Infantry e Destroyer, Submarine contro Bombers, Infantry e Marines in città/linea difensiva [UFFICIALE ma probabilmente superata, F-3]. Nei dati attuali **nessuna unità base ha bonus "in città" o "in linea difensiva"**: li aggiungono solo alcune strategie (sez. 5) [UFFICIALE, U-AJAX, SIM]. → **INCERTO** quale versione sia in gioco oggi; i dati del server sono la fonte più recente.

### 3.5 Artiglieria a distanza
- Non esiste un attacco a distanza: ogni combattimento avviene muovendo lo stack sul bersaglio [UFFICIALE, F-14]. Tra le rare c'è una "Heavy Artillery", ma con le stesse regole di scontro delle altre [COMUNITÀ, DB-WEEBLY]. **DEDOTTO**.

### 3.6 Missili e nucleari (unità rare)
- Le rare vanno "da tank leggermente diversi a missili nucleari" [UFFICIALE, N-30, F-35].
- Hanno attacco altissimo e 1 HP (es. "Afterwind" 120 att, "Short-range Missile" 80, "Long-range Missile" 60) [COMUNITÀ, DB-WEEBLY].
- Uso: secondo i giocatori funzionano solo **dentro uno stack con altre unità**; da sole muoiono senza fare danni [COMUNITÀ, FO-1215]. La spiegazione è coerente con la regola di Ivan: "il bersaglio è l'unità con la difesa più alta; l'unità con l'attacco più alto attacca per prima" [UFFICIALE, FO-1215]. Il missile da solo, con 1 HP, muore al primo colpo di difesa [DEDOTTO].
- Il **danno collaterale** (popolazione) rende i missili utili contro le città: Scorcher Missile ha collateral 350 [UFFICIALE, U-PAGE]; funzione esatta: **INCERTO**.

### 3.7 Danno collaterale (popolazione)
- Introdotto a fine 2012: quando una città viene attaccata, la popolazione subisce perdite. Le perdite dipendono dalla "scala della battaglia" e dal tipo di unità attaccanti. Il valore Collateral "si aggiunge al danno d'attacco normale e colpisce solo i civili" [UFFICIALE, N-88].
- La popolazione influisce su reddito e rinforzi: al 50% di popolazione si ricevono metà reddito e metà rinforzi [UFFICIALE, N-88, F-13, F-15].
- Valori attuali: Tanks 2, Destroyer 2, Bombers 4, Helicopters 1, Stealth 3, Scorcher Missile 350, tutti gli altri 0 [UFFICIALE, U-PAGE]. Mostrati sulla pagina unità dal 23/10/2021 [UFFICIALE, FO-48070].
- Formula esatta delle perdite civili: **non trovata**.

### 3.8 Generale e comandanti
- Il Generale rappresenta il giocatore; solo per account Premium [UFFICIALE, F-41]. Da solo è debolissimo (1/1, 1 HP) e va protetto [UFFICIALE, U-PAGE; COMUNITÀ, W-FANDOM].
- Con gli upgrade dà bonus a tutte (o a certe) unità **nel suo stack** [UFFICIALE, F-41, N-35]. Upgrade noti [COMUNITÀ, FO-6309, W-FANDOM; UFFICIALE N-175 per Rally]:

| Upgrade Generale | Effetto | SP |
|---|---|---|
| Defence | +1 difesa a tutte le unità dello stack | 45 |
| Rally The Troops | +1 rinforzo nella città del Generale | 1250 |
| Faster General / II | +1 movimento al Generale (ciascuno) | 2700 / 23400 |
| Ground Secondary Defence | +1 HP alle Militia nello stack | 4500 |
| Ground Main Defence | +1 attacco alle Infantry nello stack | 5850 |
| View range | +2 vista allo stack | 7200 |
| Cost | −4 mantenimento a ogni unità dello stack | 9900 |
| Ground Main Attack | +1 attacco ai Tanks nello stack | 12600 |
| Lucky General | +2% critico allo stack | 17100 |
| Air Main Attack | +1 attacco ai Bombers nello stack | 19800 |
| Movement range | +1 movimento a tutto lo stack | 26100 |

- Il simulatore ufficiale, con il Generale nello stack, applica: +1 difesa e +2 critico a tutti; +1 attacco a Tanks, Infantry, Bombers e **Marines**; +1 HP alle Militia [UFFICIALE, SIM]. Il +1 ai Marines non compare nella lista 2015 → upgrade aggiunto dopo [DEDOTTO].
- Esistono **comandanti rari** (bonus a statistiche di certe unità, es. Field Officer: +1 attacco a Marines e Militia nello stack) e **unità rare specializzate nell'assassinare i comandanti** [UFFICIALE, N-36, F-41; COMUNITÀ, W-FANDOM].

### 3.9 Unità rare
- Si trovano a caso nelle città conquistate; alcune solo in certi paesi; la probabilità si imposta nelle opzioni di partita (anche "nessuna") [UFFICIALE, F-35, N-30].
- Non pagano mantenimento [UFFICIALE, N-211, per contrasto con gli edifici]. Quasi tutte hanno costo 0 [COMUNITÀ, DB-WEEBLY].
- Lista e statistiche da un sito di fan (dati anteriori al febbraio 2017, perché riporta l'Anti-aircraft con raggio 2) [COMUNITÀ, DB-WEEBLY; nomi confermati da W-FANDOM]:

| Unità rara | Att | Dif | Crit | HP | Mov. | Vista | Costo |
|---|---|---|---|---|---|---|---|
| Ski Infantry | 7 | 8 | 5 | 7 | 6 | 18 | 0 |
| Anti-Tank Infantry | 6 | 6 | 5 | 7 | 6 | 18 | 0 |
| Ninja Squad | 12 | 5 | 7 | 10 | 7 | 20 | 0 |
| Mercenary Legion | 10 | 10 | 7 | 7 | 7 | 18 | 150 |
| Partisans | 10 | 1 | 3 | 7 | 5 | 15 | 0 |
| Light Tanks | 8 | 3 | 5 | 7 | 10 | 20 | 0 |
| Heavy Tanks | 8 | 7 | 5 | 10 | 6 | 16 | 0 |
| Broken Missile | 60 | 1 | 0 | 1 | 1 | 5 | 0 |
| Mech | 10 | 6 | 6 | 10 | 4 | 16 | 0 |
| Exo-Infantry | 6 | 9 | 5 | 9 | 6 | 16 | 0 |
| Heavy Artillery | 16 | 8 | 4 | 8 | 3 | 16 | 0 |
| FSLK 200 | 6 | 7 | 8 | 8 | 9 | 26 | 0 |
| Foreign Legion | 9 | 9 | 5 | 8 | 8 | 20 | 150 |
| Forest Brothers | 5 | 4 | 5 | 7 | 4 | 16 | 0 |
| Field Officer (comandante) | 1 | 1 | 0 | 1 | 7 | 20 | 0 |
| Assassin | 3 | 1 | 5 | 1 | 7 | 55 | 0 |
| Suicide Bomber | 6 | 1 | 5 | 1 | 6 | 55 | 0 |
| Child Soldiers | 4 | 3 | 3 | 7 | 4 | 12 | 50 |
| Spy Satellite | 1 | 1 | 0 | 1 | 40 | 180 | 0 |
| Afterwind (nucleare) | 120 | 1 | 50 | 1 | 15 | 18 | 0 |
| Cardboard Nuke (scherzo) | 0 | 1 | 0 | 1 | 0 | 0 | 100 |
| Short-range Missile | 80 | 1 | 5 | 1 | 4 | 15 | 0 |
| Fighters | 6 | 6 | 5 | 8 | 18 | 25 | 0 |
| Long-range Missile | 60 | 1 | 5 | 1 | 10 | 20 | 0 |
| Non-nuclear Missile | 18 | 1 | 5 | 1 | 10 | 20 | 0 |
| Air Marshal (comandante) | 1 | 1 | 0 | 1 | 15 | 55 | 0 |
| Battleship | 12 | 10 | 5 | 10 | 9 | 16 | 0 |
| Cruiser | 10 | 10 | 5 | 9 | 10 | 20 | 0 |
| Recon Submarine | 5 | 5 | 1 | 7 | 14 | 25 | 0 |
| Coastal Battery (vecchia versione rara) | 5 | 5 | 4 | 26 | −5 | 16 | 0 |
| Commando Frogmen | 6 | 6 | 5 | 10 | 5 | 22 | 0 |
| Admiral (comandante) | 1 | 1 | 0 | 1 | 10 | 20 | 0 |

- Altre rare/eventi citati in fonti ufficiali: Santa Claus (Natale), Zombies (Halloween), Child Soldiers (vinto un sondaggio del 2013) [UFFICIALE, N-228, N-358, N-99].

### 3.10 Difesa delle città e linee difensive
- In una propria città le truppe **difendono sempre** [UFFICIALE, N-26]. Per questo conviene non mandarci unità con difesa bassa.
- Regola del 2011: se attacco totale ÷ difesa totale dell'esercito > 1,3, l'esercito non insegue il nemico attaccato dentro la sua città [UFFICIALE, N-26]. Se valga ancora: **INCERTO**.
- Le **linee difensive** ("walls") si formano mettendo stack di unità abbastanza vicini; in guerra non si possono attraversare senza attaccarle [UFFICIALE, F-16; COMUNITÀ, FO-17714, FO-27833]. Alcune strategie danno bonus/malus "in defence line" (sez. 5).
- Le città conquistate generavano Militia gratuite pari ai rinforzi della città (2010) [UFFICIALE, N-9]; se valga ancora: **INCERTO** (tema dell'agente "regole core").

---

## 4. Il combattimento: come si risolve una battaglia

### 4.1 Chi attacca e chi difende [UFFICIALE, F-17]
- Se solo tu hai attaccato: le tue unità attaccano sempre, quelle avversarie difendono.
- Se entrambi gli eserciti si sono attaccati a vicenda: le unità **si alternano** tra attacco e difesa.
- Questo conta perché alcune unità sono forti in difesa (Infantry) e altre in attacco (Tanks).

### 4.2 Ordine delle unità e assorbimento del danno [UFFICIALE, F-17, FO-1215]
- Nello stack attaccante colpisce per prima l'unità con l'**attacco più alto**.
- Nello stack difensore difende per prima l'unità con la **difesa più alta**, ed è lei a incassare il danno ("il bersaglio è quello con la difesa più alta", Ivan 2011).
- Il danno toglie HP. Se un'unità arriva a 0 muore e **il danno in eccesso passa all'unità successiva**.
- Conseguenza tattica: "coprire" i Tanks con Infantry, così se lo stack viene attaccato difende prima la fanteria.

### 4.3 Il singolo scambio di colpi [UFFICIALE, F-17, N-27]
- Attacco e difesa sono il **danno massimo**. Ogni colpo è un tiro casuale da 1 al massimo.
- Attacco e difesa si eseguono **simultaneamente**: entrambe le parti fanno sempre almeno un po' di danno.
- La battaglia prosegue a scambi successivi tra le unità "in prima linea" dei due stack.
- Se le ultime due unità si distruggono a vicenda nello stesso scambio, **sopravvive il difensore**.
- Dopo la battaglia i superstiti recuperano tutti gli HP.
- Non c'è ritirata durante la battaglia: si combatte finché uno dei due stack è vuoto [DEDOTTO da F-17 e dal calcolatore FO-50250, che itera fino a zero unità].

**Esempio ufficiale** [F-17], tutte le unità con 7 HP: 1 Tank attacca 1 Infantry + 1 Militia.
1. Il Tank tira 6, l'Infantry tira 4. Tank 7→3 HP, Infantry 7→1 HP.
2. Il Tank tira 3, l'Infantry tira 5. Muoiono entrambi; i 2 danni in eccesso del Tank passano alla Militia (7→5).
3. La Militia sopravvive e difende la città.

### 4.4 Colpo critico [UFFICIALE, F-17, N-88]
- Ogni colpo ha una probabilità di critico pari al valore Crit. dell'unità (1-100%; di solito 5%).
- Il critico **somma al tiro il valore massimo**: tiro 3 + massimo 7 = 10 danni.
- Il critico si calcola a parte, dopo il tiro, e non è influenzato dallo stack bonus [COMUNITÀ, FO-26143].
- Verifica indiretta: un moderatore indica in circa 4,90 il danno medio di un Tank senza stack bonus [COMUNITÀ, FO-39894]. È esattamente la media di un tiro uniforme 1-8 (4,5) più 5% × 8 (0,4) [DEDOTTO].
- Storia: fino al 2012 esisteva l'"After-roll bonus" (ARB), poi sostituito dal critico [UFFICIALE, N-9, N-27, N-88].

### 4.5 Lo "stack bonus" (rapporto di forza)
Principio ufficiale: "gli stack più grandi hanno un leggero vantaggio in battaglia" [UFFICIALE, N-30]. La formula è stata pubblicata nel 2016 da clovis1122, che poi è diventato admin del gioco, insieme alla funzione C# dei tiri [COMUNITÀ, FO-26143]. Un giocatore l'ha usata nel 2025 per un calcolatore esatto, con risultati molto vicini al simulatore ufficiale [COMUNITÀ, FO-50250].

**Passo 1. Rapporto di forza (ricalcolato a ogni scambio sulle unità ancora vive):**

```
D = (Attacco totale attaccante + N° unità attaccante)
    / (Difesa totale difensore + N° unità difensore + bonus difesa dell'unità che sta difendendo)
```

**Passo 2. "Riduttore" del lato più debole (il lato più forte tira normalmente):**

```
se D > 1 (attaccante più forte):  riduttore_attaccante = 1
                                  riduttore_difensore  = (D + 1) / (2·D)
se D ≤ 1 (difensore più forte):   riduttore_attaccante = (D + 1) / 2
                                  riduttore_difensore  = 1
```

**Passo 3. Tiro "a cascata" (CascadingRandom) con valore massimo = attacco o difesa dell'unità:**
- Con riduttore = 1: tiro uniforme da 1 al massimo.
- Con riduttore m < 1: si parte da 1 e si sale di 1 finché un numero casuale resta ≤ m. Il risultato è una distribuzione geometrica troncata che favorisce i valori bassi:

```
P(tiro = k) = m^(k−1) · (1 − m) / (1 − m^max),   k = 1..max
```

**Esempio [DEDOTTO, applicando la formula]:** 10 Tanks (att 8) attaccano 10 Infantry (dif 6).
- D = (80 + 10) / (60 + 10) = 1,29. L'attaccante tira uniforme 1-8 (media 4,5).
- Riduttore del difensore = 2,29 / 2,57 = 0,89. La media del tiro dell'Infantry scende da 3,5 a circa 3,2.
- Anche in un 1 contro 1 Tank vs Infantry: D = 9/7. Il "bonus" dipende quindi dalle statistiche oltre che dal numero di unità.

**Avvertenze:**
- L'esempio testuale di clovis ("se l'avversario ha il doppio del bonus, il tuo riduttore è 0,5") non coincide con la sua formula, che dà 0,75 → **INCERTO** su quale sia giusta. Le formule in immagine sono state usate dal calcolatore del 2025.
- Nel 2010 gli sviluppatori scrivevano: "ogni tiro viene eseguito due volte e si prende la media" [UFFICIALE, N-12]. Non compare nel codice pubblicato nel 2016 → probabilmente superato, **INCERTO**.
- Se il bonus difesa "contro X" (es. +8 dell'AA) si sommi anche al massimo del tiro, o entri solo nella formula di D: **non verificato**. La descrizione ufficiale "+8 defence bonus" fa pensare che si sommi alla difesa [DEDOTTO]. Il calcolatore del 2025 lo usa solo in D.
- I bonus "in propria città" / "in linea difensiva" il simulatore li somma direttamente alla difesa [UFFICIALE, SIM].

### 4.6 Battaglie con più di due stack
- Il simulatore ufficiale accetta più stack, con alleati e nemici e un flag "sta difendendo" per stack [UFFICIALE, SIM]. Il calcolatore comunitario dichiara di non sapere come funzionino le battaglie con 3+ stack [COMUNITÀ, FO-50250]. Regole: **non trovate**.

### 4.7 Quando avviene uno scontro: ordine delle mosse e intercettazione
Spiegazione di Dave (admin e sviluppatore) del 2021, letta dal codice sorgente e testata in partita [UFFICIALE, FO-44795]:
- A fine turno il server prende **un giocatore a caso** ed esegue la sua prossima azione, poi di nuovo un giocatore a caso, e così via. Ogni giocatore mantiene il proprio ordine interno; anche **comprare unità conta come azione**. Il momento in cui hai dato l'ordine durante il turno non conta [anche UFFICIALE, F-43].
- Se attacco uno stack che si sta spostando e la sua mossa viene eseguita prima della mia ed esce dal mio raggio: niente battaglia.
- Altrimenti lo stack è **bloccato** ("turnblock") di default, salvo fuga:
  - con 3 unità o meno non può fuggire;
  - con più di 3 unità fugge se `numero casuale(0-1) > (unità attaccanti / unità difensori) × 2`.
  - Quindi se l'attaccante ha almeno metà delle unità del difensore, il blocco è certo; con 5 unità contro 20 la probabilità di blocco è 50%.
- Se si intercetta un Air Transport, le unità a bordo non combattono e muoiono con il trasporto [UFFICIALE, N-13].

### 4.8 Esperienza e veterania
- Non esiste: nessun campo esperienza nei dati delle unità, e gli HP vengono ripristinati dopo ogni battaglia [DEDOTTO da SIM, U-PAGE, F-17]. Le medaglie premiano il giocatore, non l'unità [UFFICIALE, N-88].

### 4.9 Ricompense
- Distruggere unità, conquistare città e paesi dà Strategy Points (SP). Il guadagno dipende dal rango dell'avversario; i neutrali hanno rango 0 [UFFICIALE, F-6, N-88].

---

## 5. Strategie: come modificano le unità

Si sceglie una strategia per partita, nella lobby o durante la scelta dei paesi. Molte vanno sbloccate con upgrade, alcune sono Premium [UFFICIALE, F-4, F-5]. Gli scenari possono disattivarle [UFFICIALE, N-250, N-317]. Valori **attuali** e finali (già modificati) [UFFICIALE, U-AJAX]; dove utile, tra parentesi la variazione rispetto alla base. Per confrontare, usare le tabelle della sezione 2.

| Strategia | Descrizione ufficiale (sintesi) | Modifiche principali |
|---|---|---|
| Master Of Stealth | Stealth avanzati, unità d'attacco principali più lente e deboli | Marines att 8, mov 7, costo 120 (−40); Submarine 9/6, crit 7, mov 12, cap 3, costo 160; Stealth att 9, crit 7, mov 17, costo 200 (−100); Tanks 7/3, mov 6; Destroyer 8/6, mov 9; Infantry costo 60 |
| Relentless Attack | Unità d'attacco potenti, difensive più deboli | Tanks crit 7, mov 8, costo 90 (−30), +1 dif vs Infantry, −1 vs Militia; Bombers 9/3, mov 16, costo 170; Destroyer mov 11, costo 190; Infantry dif 5, crit 3, mov 7, costo 90, −1 in città e in linea |
| Naval Commander | Navi potenti, Tanks più deboli | Destroyer 11/9, crit 7, HP 8, mov 13, cap 2, costo 170; Submarine 9/7, crit 7, mov 13, costo 150; Transport dif 3, HP 9, mov 13, cap 15, costo 200; Marines costo 130; Tanks 7/3, crit 3, mov 6 |
| Imperialist | −30 costo e −1 attacco a tutte le unità | Militia costo 10, +1 dif in città e in linea |
| Blitzkrieg | +4 movimento, +2 vista, −1 difesa a tutti | Militia mov 5 (+3), costo 40; Infantry −1 in città |
| Sky Menace | Aerei avanzati, terrestri più deboli | Bombers 8/5, crit 7, mov 17, costo 130; Stealth att 9, mov 17, costo 230; Air Transport 2/3, HP 9, mov 15, cap 5, costo 400; Sentry vista 70, costo 370; Infantry att 3; Tanks 7/3, mov 6, costo 130 |
| Perfect Defence | Difensive avanzate, più protezione dai Tanks, attacco più debole | Infantry dif 7, mov 5, costo 60, +1 vs Tanks; Militia dif 5, mov 3, costo 20; Tanks att 7; Destroyer att 8, mov 9; Bombers att 5, mov 13 |
| Lucky Bastard (Premium) | +critico, +4 vista, +10 costo a tutti | Critico +10 per Militia/Infantry/Marines, +12 per le altre; Militia senza aumento di costo [N-231] |
| Guerrilla Warfare | Militia avanzate e Marines economici, Tanks e Infantry più deboli | Militia 4/5, mov 4; Marines costo 80 (−80); Infantry 2/4; Tanks 6/2; Transport costo 400 (+150), Air Transport 800 (+200) |
| Great Combinator (Premium) | +1 HP e −2 dif ai Tanks; +1 HP e −2 att all'Infantry | Tanks 8/2, HP 8, costo 110; Infantry 2/6, HP 8, costo 60 |
| Iron Fist (Premium) | +2 HP, −4 vista, −2 movimento a tutti | Tutte le unità 9 HP; Militia mov 1 |
| Desert Storm (Premium) | Elicotteri avanzati, Tanks e Bombers più deboli | Helicopters att 8, mov 11, cap 1, costo 130; Bombers att 5, mov 13, costo 180; Tanks costo 150; Infantry 3/5; Marines costo 130 |
| Hybrid Warfare (Premium) | Mix di guerra convenzionale e irregolare | Tanks 9/1; Infantry 1/7; Militia 4/3; Marines 6/2, costo 80; Submarine 5/3, cap 3; Bombers 4/4; Stealth 5/2 |
| Hold The Line | (nessuna descrizione) | Tutte le unità: −1 dif in città, +2 dif in linea difensiva |
| Scorched Earth | (nessuna descrizione) | Tutte le unità −1 difesa; eventuali effetti speciali non visibili: **INCERTO** |
| Insurrection | Militia potenti, Recruitment Center economici; altre −1 att e +10 costo | Militia 4 att, HP 8, mov 5; Recruitment Center costo 300 (−700); le altre −1 mov |
| Counter-Insurgency | Supporto aereo avanzato, protezione contro le insurrezioni | Tutte +1 vista e +1 dif vs Marines, Submarine, Stealth, Sentry, Militia; Sentry Plane 6/4, crit 5, vista 80, costo 170 (−230) |
| Industrial Powerhouse | Edifici e unità meccanizzate più economici, unità "umane" e difesa più deboli | Mezzi −1 dif e −20 costo; Bombers −30; edifici +2 crit e −300/−400 costo (la tabella mostra un costo negativo per Radar e Coastal Battery: probabile bug); Militia/Infantry +10 costo |
| Aerial Defender | Unità di difesa aerea avanzate (Air Mech), convenzionali più deboli | Air Mech att 4, mov 8, +1 dif vs Bombers e Helicopters; Infantry/Tanks/Bombers −1 att; Militia −1 dif |
| Covert Operation | Stealth terrestri con più difesa, Tanks più deboli | Marines 4/6, costo 50 (−110); Submarine 5/7; Tanks att 6, costo 70; capacità Transport 4 (−6), Air Transport 2 |
| Logistic Wizard | Trasporti migliori e più protetti | Transport 1/3, HP 9, mov 13, cap 12, costo 200; Air Transport 1/3, HP 9, mov 16, cap 5, costo 400; Destroyer 2/8, mov 13, costo 100; Bombers 3/8, costo 120; tutte +2 vista |

- Lo storico delle modifiche mostra un **bilanciamento continuo fatto con la comunità** (2013-2025): es. Blitzkrieg da +3 a +4 movimento [N-271], i ritocchi a Relentless Attack [N-284, N-296, N-301], Insurrection e Logistic Wizard indeboliti nel 2025 [N-387] [UFFICIALE].
- Un dettaglio istruttivo: nel 2017 la difesa dei trasporti è stata abbassata **per evitare che difendessero prima della Militia** (avevano entrambi difesa 4) [UFFICIALE, N-185]. L'ordine di difesa per valore massimo crea effetti collaterali da tenere a mente nel design.
- Il simulatore contiene anche una strategia interna "Admin Hax" [UFFICIALE, SIM]: probabilmente per test, irrilevante.

---

## 6. Produzione, mantenimento, disponibilità

- **Acquisto**: dal menu della città, solo se controlli la capitale del paese. Il numero di unità acquistabili ("rinforzi") dipende dalla popolazione. Si ricarica all'inizio partita e poi ogni 4 turni [UFFICIALE, F-13, F-26].
- **Tempo di produzione**: nessuno. L'unità comprata è subito sulla mappa; se non l'hai ancora mossa puoi rivenderla nello stesso turno [UFFICIALE, F-13].
- Massimo 7 rinforzi per città sulla mappa standard (2010); fino a 10 sulle mappe personalizzate (2012). Recruitment Center +3, Generale con "Rally the Troops" +1 [UFFICIALE, N-9, N-91, N-248, N-175].
- **Mantenimento**: 1/10 del costo ogni turno [UFFICIALE, F-13, F-15]. Riduzioni: Bank −10 per le unità prodotte nella sua città; Generale "Cost" −4 per unità dello stack [UFFICIALE, N-248; COMUNITÀ, FO-6309]. Le rare non pagano mantenimento [UFFICIALE, N-211].
- **Produzione automatica**: si può impostare un'unità da produrre in automatico in una città quando ci sono rinforzi e soldi [UFFICIALE, F-37].
- **Movimento di gruppo**: se le unità di uno stack hanno raggi diversi, il raggio del gruppo è **la media** [UFFICIALE, F-14]. Le unità di tipo diverso (terra/mare/aria) si muovono separatamente [UFFICIALE, F-14].

---

## 7. Unità predefinite vs unità personalizzabili (accenno)

- Nell'editor di mappe/scenari si creano unità proprie e si assegna loro un **ruolo**. Ogni ruolo ha **margini** entro cui modificare le statistiche; i ruoli **Rare** e **Other** non hanno limiti [UFFICIALE, N-88].
- Strategie e upgrade agiscono sui ruoli, quindi valgono anche sulle unità personalizzate [UFFICIALE, F-3, N-88]. Per bilanciare uno scenario si possono disattivare una, più o tutte le strategie [UFFICIALE, N-250, N-317].
- Limiti noti: costo massimo 5000, rinforzi fino a 10, bonus difensivi negativi consentiti; le unità aeree hanno "can take units" disattivato di default [UFFICIALE, N-91, N-93, N-76].
- Le unità principali della mappa mondo possono comparire con altri nomi sulle mappe personalizzate [UFFICIALE, U-PAGE].
- Approfondimento: documento dell'agente che studia l'editor.

---

## 8. Spunti di design per il nostro gioco (non regole di atWar)

[DEDOTTO, nostre osservazioni]
- Il modello "danno massimo + HP + danno che passa all'unità dopo" è semplice da spiegare e da simulare, e dà battaglie leggibili nel replay.
- L'ordine "il più forte attacca per primo, il più resistente difende per primo" crea profondità (scortare i Tanks con la fanteria) ma ha casi limite (i trasporti che difendevano prima della Militia).
- Lo stack bonus di atWar è poco trasparente: perfino i giocatori esperti lo ricostruiscono a fatica. Per noi conviene una formula pubblica e mostrata nell'interfaccia.
- La risoluzione delle mosse in ordine casuale per giocatore è percepita come "lotteria" (Dave stesso pensava di cambiarla). Conviene una regola più deterministica o almeno documentata.
- Lo schema dei campi unità (sez. 1.2) è un buon punto di partenza per il nostro database, compresi ruoli, trasportabilità, conquista città, stealth, collaterale e "trovabilità".

---

## 9. Lacune / domande aperte

1. **Stack bonus**: la formula viene da una fonte comunitaria (poi admin) con un'incongruenza nell'esempio. Non c'è conferma ufficiale recente, né sappiamo se valga ancora la regola del 2010 sui "due tiri mediati".
2. **Bonus "contro X"** (+8 AA, +20 edifici): non verificato se si sommano al massimo del tiro di difesa o solo al rapporto di forza.
3. **Bonus in città / linea difensiva** per Infantry e Marines: la FAQ li cita, i dati attuali del server no.
4. **Battaglie con 3 o più stack** e battaglie in cui entrambi attaccano: ordine esatto dei ruoli non documentato.
5. **Danno collaterale**: formula delle perdite civili non trovata (si sa solo che dipende da scala della battaglia e tipo di attaccante).
6. **Navi contro città**: i dati dicono che Destroyer e Transport possono conquistare città (`can_take_cities` = 1), ma mancano regole testuali su attacchi navali a porti e sbarchi anfibi.
7. **Scorcher Missile, Hold The Line, Scorched Earth**: senza descrizione ufficiale.
8. **Unità rare**: la lista disponibile è comunitaria e anteriore al 2017; non ho trovato la lista ufficiale attuale con probabilità e paesi.
9. **Upgrade**: la lista completa con prezzi è del 2015; quella attuale (con eventuali nuovi upgrade, es. Generale +1 attacco ai Marines) non è pubblica.
10. **Regola dell'inseguimento** (rapporto 1,3) e **Militia gratuite** nelle città conquistate: regole del 2010-2011, validità attuale da verificare.
11. Il forum ufficiale blocca le richieste automatiche (Cloudflare e limiti di frequenza): non ho letto direttamente le guide "Advanced Tactics" (walling, interception) né la discussione sulle modifiche alle strategie del 2025. Ho usato copie su archive.org dove esistevano.
12. Il fandom wiki e Reddit/YouTube non hanno aggiunto numeri utili oltre a quelli qui riportati. Il wiki è in gran parte vecchio e incompleto.

---

## 10. Fonti

**Sito ufficiale atWar**
- [U-PAGE] Units and Strategies — https://atwar-game.com/units.php
- [U-AJAX] Tabelle per strategia (endpoint della pagina unità) — https://atwar-game.com/inc_ajax/units.php?strategy_id=N&my_upgrades=0&my_general=0 (N = 0,1,2,3,4,5,6,7,8,9,10,11,12,13,15,16,18,19,20,21,25,26)
- [SIM] Battle Simulator (dati unità/strategie/Generale incorporati e sim.js) — https://atwar-game.com/sim/ , https://atwar-game.com/sim/sim.js
- FAQ: [F-3] Units https://atwar-game.com/faq.php?faq_id=3 · [F-4] Strategies faq_id=4 · [F-5] Upgrades faq_id=5 · [F-6] Strategy Points faq_id=6 · [F-13] Buying troops faq_id=13 · [F-14] Moving troops and attacking faq_id=14 · [F-15] Finances faq_id=15 · [F-16] Diplomacy faq_id=16 · [F-17] Battles faq_id=17 · [F-26] Game interface faq_id=26 · [F-34] Stealth detection faq_id=34 · [F-35] Rare units faq_id=35 · [F-37] Auto-production faq_id=37 · [F-41] Generals faq_id=41 · [F-43] Who moves first faq_id=43
- Note di rilascio e news, formato https://atwar-game.com/news/news.php?news_id=N : [N-8] v0.9 (2010) · [N-9] v0.91 · [N-12] v0.93 · [N-13] v0.94 · [N-14] v0.95 · [N-16] stealth detection · [N-26] v0.975 · [N-27] nuovo sistema di battaglia con HP (20/02/2011) · [N-28] · [N-29] statistiche riviste (24/02/2011) · [N-30] rare units e stack bonus (26/02/2011) · [N-33] nuove rare, Battleship→Destroyer · [N-35] Generali e duelli · [N-36] comandanti rari e assassini · [N-37] · [N-39] v1.0 · [N-76] Custom maps - more bug fixes (2012) · [N-88] release notes atWar (02/12/2012: collateral, critico, ruoli) · [N-91] · [N-93] · [N-97] · [N-99] · [N-116] · [N-124] Map Editor updates · [N-134] · [N-175] nuovi upgrade (2016) · [N-185] modifiche 2017 · [N-211] edifici (2017) · [N-228] Santa Claus · [N-229] · [N-231] Insurrection · [N-248] edifici (2019) · [N-250] Industrial Powerhouse · [N-271] Blitzkrieg · [N-284] · [N-296] · [N-301] · [N-317] Aerial Defender e Covert Operation · [N-343] Logistic Wizard · [N-355] · [N-358] Halloween/Zombies · [N-387] modifiche 2025
- Archivio news (elenco pagine): https://atwar-game.com/news/index.php?page=1 … page=32

**Forum ufficiale** (diretto o tramite archive.org)
- [FO-26143] "Full explanation about the battle stacking bonus" (clovis1122, 2016) — https://atwar-game.com/forum/topic.php?topic_id=26143 · copia: http://web.archive.org/web/20221019005100/https://atwar-game.com/forum/topic.php?topic_id=26143&page= · immagini delle formule: https://i.imgur.com/QhpdDe4.png , https://i.imgur.com/nbNFl4v.png , https://i.imgur.com/VsB9ARa.png
- [FO-44795] "Turn block and priorities: how it works" (clovis1122 2020, Dave 2021) — https://atwar-game.com/forum/topic.php?topic_id=44795 · copia: http://web.archive.org/web/20221018205555/https://atwar-game.com/forum/topic.php?topic_id=44795&topicsearch=&page=2
- [FO-50250] "New AtWar Calculator" (LukeTan, 2025) — copia: http://web.archive.org/web/20250810162219/https://atwar-game.com/forum/topic.php?topic_id=50250&newlang=1
- [FO-39894] "Battle spreadsheet" — https://atwar-game.com/forum/topic.php?topic_id=39894
- [FO-48070] "List of collateral damage stats by unit?" — https://atwar-game.com/forum/topic.php?topic_id=48070
- [FO-1215] "How to use rare units like missiles and nuclear bombs" — https://atwar-game.com/forum/topic.php?topic_id=1215
- [FO-6309] "List of Upgrades" — copia: http://web.archive.org/web/20250619090402/https://atwar-game.com/forum/topic.php?topic_id=6309
- [FO-16145] "Turnblocking Guide (Complete)" — https://atwar-game.com/forum/topic.php?topic_id=16145
- [FO-17714] "Advanced concepts about Walls" — copia: http://web.archive.org/web/20170718181409/http://atwar-game.com/forum/topic.php?topic_id=17714
- [FO-27833] "Sun Tsu's Advanced Tutorial" — copia: http://web.archive.org/web/20170924163810/http://atwar-game.com/forum/topic.php?topic_id=27833
- [FO-15381] "Tips & Tricks" — copia: http://web.archive.org/web/20201108090158/https://atwar-game.com/forum/topic.php?topic_id=15381
- Indice guide: "atWar Knowledge Collection V2" — https://atwar-game.com/forum/topic.php?topic_id=45565

**Fonti comunitarie esterne**
- [W-FANDOM] atWar Wiki (Fandom), letto tramite API: https://atwar-game.fandom.com/wiki/Units , /wiki/General , /wiki/Field_Officer e altre pagine unità
- [DB-WEEBLY] atWar Database (sito di fan): http://atwardatabase.weebly.com/rare-units.html , http://atwardatabase.weebly.com/standard-units.html
