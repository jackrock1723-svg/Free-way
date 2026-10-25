import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './admin/AdminApp.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import App from './App.jsx';
import { restoreLegacyUrlToken } from './api.js';
import './styles/tokens.css';
import './styles.css';

// Report unexpected browser errors to the admin error log (bounded; never includes tokens or form values).
let reportedErrors = 0;
function reportBrowserError(message) {
  if (reportedErrors >= 5) return;
  reportedErrors += 1;
  try {
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(message || 'browser error').slice(0, 500), path: window.location.pathname }),
      credentials: 'same-origin',
    }).catch(() => {});
  } catch { /* reporting must never break the app */ }
}
window.addEventListener('error', (event) => reportBrowserError(event?.message));
window.addEventListener('unhandledrejection', (event) => reportBrowserError(event?.reason?.message || 'unhandled promise rejection'));

const root = document.getElementById('root');
if (!root) throw new Error('Free way root element is missing.');

function renderApp() {
  const isAdmin = window.location.hash.startsWith('#admin');
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>{isAdmin ? <AdminApp /> : <App />}</ErrorBoundary>
    </StrictMode>,
  );
  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#admin') !== isAdmin) window.location.reload();
  });
}

restoreLegacyUrlToken().then(renderApp, renderApp);
