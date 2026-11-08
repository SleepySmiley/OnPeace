import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { reportClientError } from './game/store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root mancante');

// gli errori fuori da React (eventi, timer, promesse) arrivano comunque nel registro del server
window.addEventListener('error', (e) => reportClientError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => reportClientError(e.reason));

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
