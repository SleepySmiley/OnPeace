/** "Come si gioca": le regole della partita in corso (numeri presi dalle regole vere) e i comandi. */
import { useEffect } from 'react';
import type { ConquestRules } from '@onpeace/conquista';
import { diceRules } from '../play/describe';

export function GuideModal({ rules, onClose }: { rules: ConquestRules; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const sets = rules.cards.sets;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <p className="kicker">Guida</p>
        <h1 id="guide-title">Come si gioca</h1>
        <div className="guide-cols">
          <section>
            <h2>L'inizio</h2>
            <p>
              Prima ognuno legge il suo obiettivo. Poi i territori{' '}
              {rules.setup.distribution === 'draft'
                ? 'si scelgono a turno: ognuno prende un territorio libero e ci mette un\'armata, finché sono presi tutti'
                : 'si distribuiscono a caso, un\'armata su ognuno'}
              . Le armate rimaste si piazzano{' '}
              {rules.setup.placement === 'rounds' ? `a giri, ${rules.setup.perRound} per volta` : 'tutti insieme, alla cieca'}.
            </p>
            <h2>Il turno</h2>
            <ol>
              <li>
                <b>Rinforzi.</b> Un'armata ogni {rules.reinforcements.divisor} territori (almeno {rules.reinforcements.minimum}), più il bonus di
                ogni continente che tieni per intero. Prima puoi giocare un tris di carte.
              </li>
              <li>
                <b>Attacchi.</b> Da un tuo territorio con almeno 2 armate verso un nemico confinante (le linee tratteggiate in mare contano
                come confini). Attacca quante volte vuoi.
              </li>
              <li>
                <b>Spostamento.</b> Alla fine, {rules.fortify.moves === 1 ? 'uno spostamento' : `${rules.fortify.moves} spostamenti`} di armate verso
                un tuo territorio {rules.fortify.reach === 'adjacent' ? 'confinante' : 'collegato'}. Poi tocca al prossimo.
              </li>
            </ol>
            <h2>I dadi</h2>
            <p>{diceRules(rules.dice)}</p>
          </section>
          <section>
            <h2>Le carte</h2>
            <p>
              Se nel tuo turno conquisti almeno un territorio, a fine turno peschi una carta. Tre carte fanno un tris: tre artiglierie{' '}
              {sets.threeOfAKind.artillery}, tre fanterie {sets.threeOfAKind.infantry}, tre cavallerie {sets.threeOfAKind.cavalry}, una per tipo{' '}
              {sets.oneOfEach}, jolly e due uguali {sets.jokerPlusPair}. Ogni carta che mostra un tuo territorio vale +{rules.cards.ownedTerritoryBonus}.
            </p>
            <h2>Come si vince</h2>
            <p>
              Con gli obiettivi segreti vince chi completa il suo per primo; nella conquista del mondo, chi resta da solo. Nessuno può essere
              eliminato prima della fine del {rules.elimination.protectedRounds}° giro; chi elimina un giocatore ne prende le carte.
            </p>
            <h2>Comandi</h2>
            <ul className="keys">
              <li>Clic su un tuo territorio: +1 armata (rinforzi) o lo scegli (attacco, spostamento)</li>
              <li>Maiusc+clic: tutte le armate lì · tasto destro: −1</li>
              <li>Clic su un nemico: lo prendi di mira; clic di nuovo: tiri i dadi</li>
              <li>Trascina per spostare la vista, rotella per ingrandire</li>
            </ul>
          </section>
        </div>
        <div className="button-row">
          <button type="button" className="primary" onClick={onClose} autoFocus>
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
