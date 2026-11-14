# Roadmap di OnPeace

Cosa resta da fare, in ordine. Si lavora un punto alla volta, con calma, anche su più sessioni.

## Come si lavora

- Per tutto quello che si vede: prima 3-4 proposte da confrontare dal vivo su una pagina di prova (come `tabellone.html`), poi si sceglie, poi si fa per bene nel gioco.
- Per provare il gioco senza server e senza altri browser c'è `prova.html`: una partita vera che gira nel browser contro quattro avversari automatici (`?da=inizio` per partire dall'obiettivo, `?stile=vetro` per l'altro tema).
- Un punto è chiuso quando funziona nel gioco vero, nei due temi, con i test verdi, provato nel browser e salvato su git.
- C'è una sola disposizione, l'**essenziale**: mappa a tutto schermo, giocatori in alto a sinistra, barra dei comandi in basso, carte e registro nei cassetti.

## Già fatto (14/11)

- **M12.3 — niente più lag.** La mappa si ridisegna in 10-45 ms invece di ~800.
- **M12.4 — nuovo inizio partita.** Prima la carta dell'obiettivo al centro, poi i territori scelti a turno, poi il piazzamento.
- **M12.4b — due bug.** "Esci" ora torna alla home; la barra in alto resta cliccabile mentre la carta è aperta.
- **M12.5 — carta dell'obiettivo (proposta C).** La mappa accende i continenti da prendere, oppure cadono le pedine da contare o il bersaglio finisce nel mirino; sotto, la frase e i numeri. Il server manda l'obiettivo con i suoi dati, non solo la frase. La stessa carta, piccola e ferma, sta tra le carte. Pagina di prova: `carta.html`.
- **M12.6 — barra dei comandi in basso (proposta A).** Nell'essenziale il pannello che si attaccava al territorio cliccato non c'è più: una barra fissa in basso al centro dice cosa fare, mostra il contatore o chi contro chi, dadi e armate, con Conferma e Ricomincia sempre lì. La mappa le lascia spazio, i bottoni e gli avvisi in basso stanno sopra. Esc nei rinforzi toglie le armate non confermate.
- **M12.7 — una sola disposizione.** Tolte "plancia laterale" e "comandi in basso": resta l'essenziale, e il menu Aspetto sceglie solo il tema. Via anche il vecchio pannello della mossa e le versioni dei pannelli che servivano solo a quelle due.
- **M12.8 — scena della battaglia coi carri armati (proposta E).** Su cinque proposte (tavolo, duello, mappa, riquadro, carri) hai scelto i carri: la camera vola sui due territori, su ciascuno i carri schierati (uno per armata, al massimo 8, le retrovie avanzano), i dadi 3D rotolano in primo piano, poi i carri si sparano: per ogni coppia di dadi spara chi la vince e il carro colpito esplode. Alla conquista tre carri entrano nel territorio preso. Clic salta, Esc chiude, Invio tira ancora; i comandi restano nella barra in basso. Chi guarda una battaglia degli altri la vede in piccolo in alto. Suoni nuovi (dadi, colpo d'aria, cannonata). Corretto anche un bug dei suoni: il volume delle battaglie degli altri veniva preso come ritardo.

## Da fare

### 1. Carri sulla mappa e ultime scelte della battaglia

Hai chiesto: al posto del numero di armate sui territori, i carri armati. Pagina di prova: `battaglia.html`, pannello in alto a destra, voce "Mappa". Quattro modi, da confrontare con i dischi di oggi:
- **A · Carro con la targa**: un carro di lato, il numero su una targhetta sotto;
- **B · Squadra e bandierina**: più armate, più carri (fino a 4), il numero su una bandierina;
- **C · Carro dall'alto**: visto dall'alto, il numero sulla torretta, il cannone verso il nemico più vicino;
- **D · Numero sulla fiancata**: un carro di lato più grosso, il numero dipinto sullo scafo.

I carri crescono avvicinandosi alla mappa (a mappa intera sono più piccoli, se no l'Europa si accavalla).

**Da scegliere ancora per la battaglia** (stessa pagina): carri di lato o dall'alto; "fino in fondo" tiro per tiro o col conto veloce; chi non combatte vede la battaglia in piccolo, intera o niente. Oggi: di lato, tiro per tiro, in piccolo.

**Da sistemare dopo la scelta:** il tempo del turno continua a scorrere durante la scena.

### 2. Pesca della carta a fine turno

Il problema: oggi la carta arriva senza che te ne accorgi. Vuoi cliccare un mazzo e ricevere la carta in modo scenico.

**Da decidere.** Il clic può essere solo scena (la carta la decide comunque il server e le regole non cambiano), oppure una mossa vera con tempo limite e pesca automatica se non clicchi. Consiglio la prima: è più semplice e non rallenta la partita.

Servono 2-3 proposte: il mazzo, il gesto della pesca, la carta che si gira e vola nella mano.

### 3. Mappa più leggibile

Hai segnalato che pedine, numeri, colori e confini sono poco chiari. In più, l'ho visto in prova: col tema vetro, durante la scelta a turno, i territori liberi sono tutti grigi e i continenti non si distinguono.

Le pedine le decide il punto 1 (i carri). Qui restano 3-4 proposte su: colori dei giocatori, territori attivi o spenti, confini tra continenti.

### 4. "Cosa devo fare adesso" e il resto dell'interfaccia

Ogni fase deve dire chiaramente cosa fare: fasi nella barra in alto, istruzioni, avvisi. Nell'essenziale vanno sistemati anche i cassetti "Carte e obiettivo" e "Registro e chat".

### 5. Pulizia e chiusura di M12

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
