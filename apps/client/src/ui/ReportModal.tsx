import { useEffect, useRef, useState } from 'react';
import { useSession } from '../store';

/** "Segnala un problema": il testo va nel registro del server insieme al contesto della partita. */
export function ReportModal({ onClose }: { onClose: () => void }) {
  const reportProblem = useSession((s) => s.reportProblem);
  const connected = useSession((s) => s.online.connected);
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = () => {
    if (!text.trim()) return;
    reportProblem(text.trim());
    onClose();
  };

  return (
    <div className="modal-backdrop guide-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal report" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="panel-kicker">Segnala un problema</div>
        <h2 id="report-title">Cosa è successo?</h2>
        <p className="hint-text">
          Un errore, una regola che sembra sbagliata, qualcosa che non si capisce. Insieme al testo arrivano il turno e lo stato
          della partita, così si può riprodurre.
        </p>
        <textarea
          ref={area}
          rows={5}
          maxLength={2000}
          value={text}
          placeholder="Es. ho attaccato il Brasile con 3 dadi ma il registro dice 2"
          aria-label="Descrizione del problema"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        {!connected && <p className="error-text">Non sei collegato al server: la segnalazione partirà appena torni online.</p>}
        <div className="button-row">
          <button type="button" className="primary" disabled={!text.trim()} onClick={send}>
            Invia
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
