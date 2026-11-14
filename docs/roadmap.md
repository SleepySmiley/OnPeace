# Roadmap di OnPeace

Cosa resta da fare, in ordine. Si lavora un punto alla volta, con calma, anche su più sessioni.

## Come si lavora

- Per tutto quello che si vede: prima 3-4 proposte da confrontare dal vivo su una pagina di prova (come `tabellone.html`), poi si sceglie, poi si fa per bene nel gioco.
- Per provare il gioco senza server e senza altri browser c'è `prova.html`: una partita vera che gira nel browser contro quattro avversari automatici (`?da=inizio` per partire dall'obiettivo, `?stile=vetro` per l'altro tema).
- Un punto è chiuso quando funziona nel gioco vero, nei due temi, con i test verdi, provato nel browser e salvato su git.
- C'è una sola disposizione, l'**essenziale**: mappa a tutto schermo, giocatori in alto a sinistra, fasi del turno al centro della barra in alto, barra dei comandi in basso, carte in mano nell'angolo in basso a sinistra, registro e chat in un cassetto a destra.

## Già fatto (14-15/11)

- **M12.3 — niente più lag.** La mappa si ridisegna in 10-45 ms invece di ~800.
- **M12.4 — nuovo inizio partita.** Prima la carta dell'obiettivo al centro, poi i territori scelti a turno, poi il piazzamento.
- **M12.4b — due bug.** "Esci" ora torna alla home; la barra in alto resta cliccabile mentre la carta è aperta.
- **M12.5 — carta dell'obiettivo (proposta C).** La mappa accende i continenti da prendere, oppure cadono le pedine da contare o il bersaglio finisce nel mirino; sotto, la frase e i numeri. Il server manda l'obiettivo con i suoi dati, non solo la frase. La stessa carta, piccola e ferma, sta tra le carte. Pagina di prova: `carta.html`.
- **M12.6 — barra dei comandi in basso (proposta A).** Nell'essenziale il pannello che si attaccava al territorio cliccato non c'è più: una barra fissa in basso al centro dice cosa fare, mostra il contatore o chi contro chi, dadi e armate, con Conferma e Ricomincia sempre lì. La mappa le lascia spazio, i bottoni e gli avvisi in basso stanno sopra. Esc nei rinforzi toglie le armate non confermate.
- **M12.7 — una sola disposizione.** Tolte "plancia laterale" e "comandi in basso": resta l'essenziale, e il menu Aspetto sceglie solo il tema. Via anche il vecchio pannello della mossa e le versioni dei pannelli che servivano solo a quelle due.
- **M12.8 — scena della battaglia coi carri armati (proposta E).** Su cinque proposte (tavolo, duello, mappa, riquadro, carri) hai scelto i carri: la camera vola sui due territori, su ciascuno i carri schierati (uno per armata, al massimo 8, le retrovie avanzano), i dadi 3D rotolano in primo piano, poi i carri si sparano: per ogni coppia di dadi spara chi la vince e il carro colpito esplode. Alla conquista tre carri entrano nel territorio preso. Clic salta, Esc chiude, Invio tira ancora; i comandi restano nella barra in basso. I carri della scena sono visti dall'alto: la torretta gira verso il bersaglio prima di sparare. Chi guarda una battaglia degli altri la vede in piccolo in alto. Suoni nuovi (dadi, colpo d'aria, cannonata). Corretto anche un bug dei suoni: il volume delle battaglie degli altri veniva preso come ritardo.
- **M12.9 — carri armati al posto dei numeri (proposta D).** Su quattro modi (targa, squadra con bandierina, dall'alto, numero sulla fiancata) hai scelto la fiancata: ogni territorio ha un carro di lato nel colore del padrone col numero dipinto sullo scafo, girato verso il nemico confinante più vicino. A mappa intera i carri sono più piccoli e crescono avvicinandosi; sul vetro un'ombra scura li stacca dal territorio dello stesso colore. Via i dischi.
- **M12.10 — battaglia: carri dall'alto e tempo restituito.** I carri della scena sono visti dall'alto (la torretta gira verso il bersaglio). Ogni tiro di dadi ridà 3 secondi a chi attacca, fino a 60 per turno (regole: `timers.battleSeconds`, `timers.battleMaxSeconds`), anche a tempo fermato: guardare la battaglia non mangia il turno. Restano com'erano "fino in fondo" tiro per tiro e la battaglia degli altri in piccolo (si possono ancora cambiare nella pagina di prova `battaglia.html`).
- **M12.11 — pesca della carta a fine turno (proposta A).** Su tre proposte (al centro, ventaglio, nell'angolo) hai scelto il centro: se hai conquistato, a fine turno la mappa si scurisce, il mazzo cade al centro, lo tocchi (o Invio) e la prima carta sale, si gira grande e vola su "Carte e obiettivo", che conta la carta solo quando arriva. È solo scena: la carta la decide il server come prima e, se non tocchi, parte da sola dopo 6 secondi. Carta nuova nei due temi: retro con la rosa dei venti, fronte con il pezzo di mappa del territorio, il simbolo e di chi è ("Tuo: +2 nel tris"); il territorio lampeggia anche sulla mappa. Suoni nuovi (mazzo, carta che si gira). La pesca aspetta che finisca la tua battaglia; se ti attaccano mentre il mazzo aspetta, si toglie di mezzo e torna dopo. Pagina di prova: `pesca.html` (pescate finte, anche insieme alle battaglie).
- **M12.12 — mappa più leggibile.** Su una pagina di prova con tre domande (di chi è un territorio, dove puoi agire, dove finisce un continente) e varie risposte per ognuna, hai scelto di cambiare solo la seconda: niente più velo scuro sui territori su cui non puoi agire, che rendeva mezza mappa color fango; quelli su cui puoi agire adesso (i tuoi nei rinforzi, quelli liberi nella scelta, i bersagli delle frecce) hanno un contorno chiaro che pulsa piano. Colori e confini restano com'erano. Col tema vetro, durante la scelta a turno, i territori liberi hanno la tinta scura del loro continente invece del grigio: i continenti si distinguono.

- **M12.13 — cosa fare adesso, avvisi e carte in mano.** Su una pagina di prova con cinque domande hai scelto: in alto al centro chi gioca, il percorso ① Rinforzi ② Attacco ③ Spostamento (✓ le fasi fatte, quella in corso piena nel colore di chi gioca) e il tempo, al posto delle fasi a schede; quando tocca a te una fascia attraversa lo schermo ("Tocca a te · Rinforzi, 3 armate da mettere", poi "Attacco", "Spostamento"; in piccolo in alto quando tocca agli altri) e finché la mossa è tua il bordo dello schermo resta acceso nel tuo colore; quello che fanno gli altri esce dai territori sulla mappa ("+3", "−2", "Marco conquista", "Luca ti prende") e svanisce, mentre eliminazioni, tris e vittoria restano qualche secondo in basso a destra; carte e obiettivo stanno in mano, a ventaglio nell'angolo in basso a sinistra (l'obiettivo coperto per primo), si aprono passandoci sopra e con un clic si vedono grandi al centro coi tris; le carte pescate volano lì. Registro e chat in un cassetto a destra, col bottone in basso a destra. Col vetro le frecce d'attacco sono chiare col bordo scuro (col colore di chi attacca sul suo territorio non si vedevano). La barra dei comandi resta tra la mano e il registro e va a capo se non ci sta. Corretti anche: dopo una tua battaglia la camera non tornava indietro se in coda c'erano solo battaglie degli altri; cambiando lo spazio libero la mappa ingrandita tornava alla vista d'insieme.

## Da fare

### 1. Pulizia e chiusura di M12

- Togliere quello che resta del vecchio gioco in stile atWar:
  - in `packages/engine`, tenere solo schema e controlli del tabellone, errori e numeri casuali;
  - eliminare `data/maps`, `data/rules` e gli strumenti delle vecchie mappe.
- Riscrivere `docs/progetto.md`, che descrive ancora il vecchio gioco.
- Unire `m12-partita` in `main`.

## Lasciati indietro di proposito

- Salvataggi delle partite senza fsync e senza copia di riserva.
- Le segnalazioni salvate in locale contengono i token dei giocatori.
- L'etichetta "Pacifico del Nord" finisce a cavallo del bordo della mappa.
- Niente partita con più giocatori sullo stesso PC: si gioca solo online. Per provare servono più browser.
