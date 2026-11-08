import { useEffect, useState, type ReactNode } from 'react';
import { ctx } from '../game/store';

/**
 * Guida rapida per chi gioca la prima volta. I numeri vengono dalle regole in data/rules,
 * così la guida resta giusta quando si cambiano i valori.
 */
const R = ctx.rules;
const G = ctx.catalog.rules.general;
const pct = (n: number) => `${n}%`;

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'breve',
    title: 'In due minuti',
    body: (
      <>
        <p className="guide-lead">
          Compri truppe nelle tue città, le muovi sulla mappa, conquisti città neutrali e avversarie. Ogni città dà soldi e
          nuove truppe: chi ne ha di più cresce più in fretta.
        </p>
        <ol>
          <li>
            <b>Sala d'attesa</b>: scegli il colore e, se attive, strategia e Generale. Quando ci sono tutti, l'host avvia la
            partita.
          </li>
          <li>
            <b>Scelta dei paesi</b>: a turno ognuno clicca un paese libero sulla mappa ({R.game.countrySelectSeconds} secondi a
            testa, poi si sceglie a caso). Il primo è il tuo paese natale.
          </li>
          <li>
            <b>Turni simultanei</b>: tutti danno gli ordini nello stesso momento. Il turno finisce allo scadere del tempo o
            quando tutti hanno premuto <span className="ui">Fine turno</span>. Puoi ripensarci con{' '}
            <span className="ui">Riprendi il turno</span> finché gli altri non hanno finito.
          </li>
          <li>
            <b>Esecuzione</b>: il server pesca a caso un giocatore ed esegue il suo prossimo ordine, poi un altro, e così via.{' '}
            <b>L'ordine degli ordini conta</b>: metti per primo quello più importante, per esempio l'attacco a una pila prima che
            scappi.
          </li>
          <li>
            <b>Resoconto</b>: dopo ogni turno vedi battaglie (con il replay), conquiste e proposte diplomatiche.
          </li>
        </ol>
        <p>
          Al turno {R.turn.peaceTurns === 1 ? '1' : `1–${R.turn.peaceTurns}`} non si possono attaccare gli altri giocatori,
          solo i paesi neutrali. Si è eliminati perdendo tutte le città. Vince chi resta in gioco (da solo o solo con alleati);
          all'ultimo turno (in alto: <span className="ui">Turno 3 / 50</span>) vince chi ha più punti, cioè unità distrutte e
          città conquistate.
        </p>
      </>
    ),
  },
  {
    id: 'comandi',
    title: 'Comandi',
    body: (
      <ul>
        <li>
          <b>Mappa</b>: trascina per spostarti, rotellina per lo zoom, <kbd>Home</kbd> o <kbd>0</kbd> per rivedere tutto.
          Passando sopra città e pile vedi i dettagli.
        </li>
        <li>
          <b>Comprare</b>: clicca una tua città, scegli le quantità con <span className="ui">+</span> e{' '}
          <span className="ui">−</span>, poi <span className="ui">Ordina</span>. Dallo stesso pannello costruisci gli edifici.
          Le unità comprate si possono muovere subito.
        </li>
        <li>
          <b>Muovere e attaccare</b>: clicca una tua pila (o la città e poi <span className="ui">Truppe in città</span>), scegli
          quante unità, premi <span className="ui">Muovi / attacca</span> e clicca la destinazione. La linea è{' '}
          <span className="c-ok">verde</span> se il movimento va bene, <span className="c-attack">arancione</span> se è un
          attacco, <span className="c-bad">rossa</span> se non si può.
        </li>
        <li>
          <kbd>Maiusc</kbd>+clic aggiunge una tappa al percorso; <kbd>Esc</kbd> o il clic destro annullano.
        </li>
        <li>
          <b>Mare</b>: terra, mare e aria si muovono separatamente. Per attraversare il mare compra una Nave da trasporto in un porto,
          usa <span className="ui">Carica</span>, muovi la nave e poi <span className="ui">Sbarca…</span>.
        </li>
        <li>
          <b>Ordini</b>: la scheda a destra elenca i tuoi ordini nell'ordine in cui li hai dati. Si tolgono con ✕ finché il
          turno non finisce; quelli che non si possono più eseguire diventano rossi.
        </li>
      </ul>
    ),
  },
  {
    id: 'soldi',
    title: 'Soldi e truppe',
    body: (
      <ul>
        <li>
          Il reddito arriva dalle città. <b>Si compra solo nelle città dei paesi di cui controlli la capitale</b>: prendere una
          capitale è il colpo grosso.
        </li>
        <li>
          Una città conquistata parte dal {pct(R.economy.ownedStartPct)} del reddito e sale del{' '}
          {pct(R.economy.ownedGrowthPct)} a turno. Le città di un paese di cui non hai la capitale rendono poco (al massimo il{' '}
          {pct(R.economy.foreignCapPct)}) e non producono truppe. Un paese intero dà il {pct(R.economy.fullCountryBonusPct)} in
          più.
        </li>
        <li>
          <b>Rinforzi</b>: ogni città può produrre solo un certo numero di unità, che si ricarica ogni{' '}
          {R.reinforcements.cycleTurns} turni. Chi conquista una città riceve subito delle Milizie gratuite.
        </li>
        <li>
          <b>Mantenimento</b>: a ogni turno ogni unità costa 1/{R.economy.upkeepDivisor} del suo prezzo. Con il saldo negativo
          non si compra.
        </li>
        <li>
          In alto a destra vedi i fondi dopo gli ordini e il bilancio del prossimo turno: cliccali per il dettaglio.
        </li>
      </ul>
    ),
  },
  {
    id: 'battaglie',
    title: 'Battaglie',
    body: (
      <ul>
        <li>
          Attacco e difesa sono il <b>danno massimo</b> di un colpo: ogni colpo è un tiro da 1 a quel valore, con una piccola
          probabilità di critico.
        </li>
        <li>
          I due lati si colpiscono finché uno non è eliminato. Chi attacca colpisce prima con l'unità più forte; chi difende
          incassa prima con quella che difende meglio. I superstiti tornano in piena salute.
        </li>
        <li>
          La pila più forte ha un vantaggio in più: attaccare con poco contro tanto conviene di rado. Se gli ultimi due si
          distruggono a vicenda, vince chi difende.
        </li>
        <li>
          <b>Intercettazione</b>: se il tuo attacco viene eseguito prima che la pila nemica si muova, la blocchi. Le pile con{' '}
          {R.turnblock.alwaysBlockMaxUnits} unità o meno restano sempre bloccate; quelle grandi possono scappare.
        </li>
        <li>
          <b>Linee difensive</b>: due tue pile di terra vicine formano un muro che il nemico non attraversa senza combattere.
        </li>
        <li>
          Le unità <b>stealth</b> (Incursori, Sottomarini, Caccia stealth) sono invisibili finché non vengono scoperte o non
          combattono. Gli aerei distruggono ma non conquistano le città.
        </li>
      </ul>
    ),
  },
  {
    id: 'diplomazia',
    title: 'Diplomazia',
    body: (
      <ul>
        <li>Tra giocatori si parte in guerra (ma al primo turno non ci si attacca).</li>
        <li>
          Dalla scheda <span className="ui">Giocatori</span> proponi pace o alleanza: l'altro risponde nel turno successivo, dal
          Resoconto.
        </li>
        <li>Gli alleati condividono la vista, possono mandarsi soldi e cedersi città, e vincono insieme.</li>
        <li>
          Tornare in guerra richiede preavviso: {R.diplomacy.peaceToWarTurns} turno dalla pace,{' '}
          {R.diplomacy.allianceToWarTurns} turni dall'alleanza.
        </li>
        <li>
          Per parlare c'è la scheda <span className="ui">Chat</span>.
        </li>
      </ul>
    ),
  },
  {
    id: 'dottrina',
    title: 'Strategia e Generale',
    body: (
      <ul>
        <li>
          <b>Strategia</b>: una tra {ctx.catalog.rules.strategies.length}, cambia i valori di alcune unità ed edifici (per
          esempio carri più forti o navi più economiche). Si sceglie in sala d'attesa o durante la scelta dei paesi; al turno 1
          si blocca e diventa pubblica.
        </li>
        <li>
          <b>Generale</b>: compare nella capitale del tuo paese natale al turno 1 e dà {G.picks} bonus alla pila in cui si trova,
          scelti all'inizio. È fragilissimo: se muore è perso, quindi tienilo in una pila forte.
        </li>
        <li>
          <b>Unità rare</b>: conquistando una città puoi trovarne una (la probabilità la sceglie l'host). Non costano
          mantenimento e alcune sono molto potenti.
        </li>
        <li>
          <b>Edifici</b>: uno per tipo in ogni città (Banca, Radar, Fortificazioni…). Passa sopra il nome per sapere cosa fa.
        </li>
      </ul>
    ),
  },
  {
    id: 'problemi',
    title: 'Se qualcosa va storto',
    body: (
      <ul>
        <li>
          <b>Chiuso il browser o caduta la linea?</b> Riapri il link della partita: il browser ricorda il tuo posto e gli ordini
          già dati restano.
        </li>
        <li>
          L'host può fermare il tempo con <span className="ui">Pausa</span>. Chi resta inattivo per{' '}
          {R.game.kickAfterInactiveTurns} turni può essere espulso: le sue città tornano neutrali, come per chi preme{' '}
          <span className="ui">Esci</span>.
        </li>
        <li>
          <b>Qualcosa non funziona o ti sembra sbagliato?</b> Premi <span className="ui">Segnala</span> in alto e scrivi cosa è
          successo: la segnalazione arriva a chi sviluppa il gioco insieme allo stato della partita.
        </li>
      </ul>
    ),
  },
];

const SEEN_KEY = 'onpeace.guideSeen';

/** La guida è già stata aperta su questo browser? (Finché no, il pulsante è evidenziato.) */
export function guideSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markGuideSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // non disponibile: pazienza
  }
}

/** Finestra "Come si gioca", divisa in sezioni. Si chiude con Esc o cliccando fuori. */
export function GuideModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(SECTIONS[0]!.id);
  const section = SECTIONS.find((s) => s.id === current) ?? SECTIONS[0]!;

  useEffect(() => {
    markGuideSeen();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop guide-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <nav className="guide-nav" aria-label="Sezioni della guida">
          <div className="panel-kicker">Come si gioca</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === current ? 'active' : ''}
              aria-current={s.id === current ? 'page' : undefined}
              onClick={() => setCurrent(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <article className="guide-body">
          <header className="guide-head">
            <h2 id="guide-title">{section.title}</h2>
            <button type="button" className="ghost tiny" onClick={onClose} aria-label="Chiudi la guida">
              Chiudi
            </button>
          </header>
          {section.body}
        </article>
      </div>
    </div>
  );
}
