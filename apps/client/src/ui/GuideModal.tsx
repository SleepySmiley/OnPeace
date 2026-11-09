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
            <b>Turni simultanei</b>: tutti danno gli ordini nello stesso momento. Il turno finisce allo scadere del tempo (la
            linea sotto la barra in alto si accorcia, diventa ambra e poi rossa) o quando tutti hanno premuto{' '}
            <span className="ui">Fine turno</span>. Puoi ripensarci con <span className="ui">Riprendi il turno</span> finché gli
            altri non hanno finito. Ogni nuovo turno si apre con un breve riepilogo in alto.
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
          <b>Mappa</b>: trascina il fondo per spostarti, rotellina per lo zoom, <kbd>Home</kbd> o <kbd>0</kbd> per rivedere
          tutto. Passando sopra città e pile vedi i dettagli. I paesi grigi sono neutrali; quelli colorati sono dei giocatori.
        </li>
        <li>
          <b>Comprare</b>: clicca una tua città, scegli le quantità con <span className="ui">+</span> e{' '}
          <span className="ui">−</span>, poi <span className="ui">Ordina</span>. Dallo stesso pannello costruisci gli edifici.
          Le unità comprate si possono muovere subito. Passando sopra un'unità o un edificio si apre la sua scheda: a cosa
          serve, statistiche, prezzo e mantenimento.
        </li>
        <li>
          <b>Muovere e attaccare</b>: <b>trascina</b> una tua pila sulla destinazione. Il cerchio è il raggio d'azione e la
          freccia non ne esce. La freccia è <span className="c-ok">verde</span> se il movimento va bene,{' '}
          <span className="c-attack">arancione</span> se è un attacco, <span className="c-bad">rossa</span> se non si può; in
          basso c'è scritto cosa succederà.
        </li>
        <li>
          Per muovere solo una parte della pila, cliccala e scegli le unità nel pannello (si parte da nessuna); senza scelta si
          muovono tutte quelle libere.
        </li>
        <li>
          Tieni <kbd>Maiusc</kbd> mentre rilasci per mettere una tappa: il cerchio si sposta lì e si restringe a quanto resta da
          percorrere; poi clicca la destinazione. <kbd>Esc</kbd> o il clic destro annullano.
        </li>
        <li>
          <b>Stretti e tunnel</b> (tratteggio chiaro sulla mappa, per esempio Manica e Gibilterra): le truppe di terra li
          attraversano da sole quando la destinazione è dall'altra parte; la deviazione conta nel raggio.
        </li>
        <li>
          <b>Mare</b>: terra, mare e aria si muovono separatamente. Per attraversare il mare compra una Nave da trasporto in un
          porto, porta le truppe nella stessa città, premi <span className="ui">Imbarca</span> nel pannello della pila, trascina
          la nave e poi usa <span className="ui">Sbarca…</span>: tutto nello stesso turno.
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
          {R.reinforcements.cycleTurns} turni{R.reinforcements.accumulate ? '' : ' (quelle non usate non si accumulano)'}. In
          alto vedi quante ne puoi ancora arruolare e a che turno si ricaricano; cliccando, il dettaglio per città. Chi conquista
          una città riceve subito delle Milizie gratuite.
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
