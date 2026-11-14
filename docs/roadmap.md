# Roadmap di OnPeace

Cosa resta da fare, in ordine. Si lavora un punto alla volta, con calma, anche su più sessioni.

## Come si lavora

- Per tutto quello che si vede: prima 3-4 proposte da confrontare dal vivo su una pagina di prova (come `tabellone.html`), poi si sceglie, poi si fa per bene nel gioco.
- Un punto è chiuso quando funziona nel gioco vero, nei due temi, con i test verdi, provato nel browser e salvato su git.
- Il layout di riferimento è **essenziale**: tutto si progetta prima per quello.

## Già fatto (14/11)

- **M12.3 — niente più lag.** La mappa si ridisegna in 10-45 ms invece di ~800.
- **M12.4 — nuovo inizio partita.** Prima la carta dell'obiettivo al centro, poi i territori scelti a turno, poi il piazzamento.
- **M12.4b — due bug.** "Esci" ora torna alla home; la barra in alto resta cliccabile mentre la carta è aperta.
- **M12.5 — carta dell'obiettivo (proposta C).** La mappa accende i continenti da prendere, oppure cadono le pedine da contare o il bersaglio finisce nel mirino; sotto, la frase e i numeri. Il server manda l'obiettivo con i suoi dati, non solo la frase. La stessa carta, piccola e ferma, sta tra le carte. Pagina di prova: `carta.html`.

## Da fare

### 1. Pannello comandi dell'essenziale

Il problema: durante i rinforzi il pannello si attacca al territorio cliccato, si riapre a ogni clic e copre proprio la zona su cui stai lavorando.

Proposte da preparare (3-4), con questi vincoli: non copre dove clicchi, si vede sempre cosa devi fare e quante armate restano, Conferma e Ricomincia sempre a portata, Invio ed Esc funzionano. Idee di partenza:
- barra compatta fissa in basso al centro;
- striscia sotto la barra in alto;
- contatore piccolo vicino al cursore, con la conferma in un punto fisso;
- pannello stretto sul bordo, che si può chiudere.

**Da decidere dopo.** Se togliere i layout "plancia laterale" e "comandi in basso". Prima di toglierli si chiede.

### 2. Scena della battaglia

Hai chiesto: quando si combatte, una schermata dedicata con una transizione d'ingresso e i dadi messi in scena, molto più strutturata e "figa", sempre con i dadi.

**Da decidere con le proposte:**
- a tutto schermo o in un grande riquadro sopra la mappa;
- "fino in fondo" (tanti tiri di fila): scena veloce con il conto delle perdite che scorre, oppure tiro per tiro;
- cosa vedono chi difende e chi guarda;
- quanto dura: non deve rallentare la partita, quindi si salta con un clic e i tiri successivi vanno più veloci;
- i suoni.

Idee di partenza:
- il tavolo dei dadi visto dall'alto;
- il duello tra le due pedine;
- la mappa che zooma sui due territori, con i dadi in primo piano.

### 3. Pesca della carta a fine turno

Il problema: oggi la carta arriva senza che te ne accorgi. Vuoi cliccare un mazzo e ricevere la carta in modo scenico.

**Da decidere.** Il clic può essere solo scena (la carta la decide comunque il server e le regole non cambiano), oppure una mossa vera con tempo limite e pesca automatica se non clicchi. Consiglio la prima: è più semplice e non rallenta la partita.

Servono 2-3 proposte: il mazzo, il gesto della pesca, la carta che si gira e vola nella mano.

### 4. Mappa più leggibile

Hai segnalato che pedine, numeri, colori e confini sono poco chiari. In più, l'ho visto in prova: col tema vetro, durante la scelta a turno, i territori liberi sono tutti grigi e i continenti non si distinguono.

Servono 3-4 proposte su: forma e dimensione delle pedine e dei numeri, colori dei giocatori, territori attivi o spenti, confini tra continenti.

### 5. "Cosa devo fare adesso" e il resto dell'interfaccia

Ogni fase deve dire chiaramente cosa fare: fasi nella barra in alto, istruzioni, avvisi. Nell'essenziale vanno sistemati anche i cassetti "Carte e obiettivo" e "Registro e chat". In parte si chiude insieme al punto 1.

### 6. Pulizia e chiusura di M12

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
