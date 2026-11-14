import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../store';

interface State {
  error: Error | null;
}

/**
 * Se l'interfaccia va in errore, invece della pagina bianca mostra un avviso con "Ricarica"
 * e manda l'errore al server. Ricaricando si rientra nella partita (il browser ricorda il posto).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, info.componentStack ?? '');
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="panel-kicker">Errore dell'interfaccia</div>
          <h1>Qualcosa si è rotto</h1>
          <p className="lead">
            L'errore è stato segnalato. Ricarica la pagina: rientri nella partita e le mosse già fatte restano.
          </p>
          <p className="hint-text">{this.state.error.message}</p>
          <div className="button-row">
            <button type="button" className="primary" onClick={() => location.reload()}>
              Ricarica la pagina
            </button>
          </div>
        </div>
      </div>
    );
  }
}
