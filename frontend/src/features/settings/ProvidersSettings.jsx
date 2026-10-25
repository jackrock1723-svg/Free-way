import { useEffect, useState } from 'react';
import { settingsApi } from './settingsApi.js';

function messageFor(error) {
  return error?.message && error.message !== 'network'
    ? error.message
    : 'Provider status could not be read from this workspace.';
}

export default function ProvidersSettings() {
  const [providers, setProviders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.readProviders()
      .then((result) => {
        if (!cancelled) setProviders(Array.isArray(result?.providers) ? result.providers : []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(messageFor(requestError));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="settings-section" aria-labelledby="providers-settings-title">
      <div className="settings-section-heading">
        <h2 id="providers-settings-title">Model Providers</h2>
        <p>Only providers supported by this build are listed. API keys are never shown here.</p>
      </div>
      <div className="settings-group">
        <h3>API providers</h3>
        {loading && <p className="settings-save-status" role="status">Loading provider status…</p>}
        {error && <p className="settings-inline-error" role="alert">{error}</p>}
        {providers && !loading && (
          <div className="provider-list">
            {providers.map((provider) => (
              <article className="provider-row" data-testid="provider-row" key={provider.name}>
                <h4>{provider.name}</h4>
                <span className="state-badge">{provider.configured === true ? 'Configured' : 'Not configured'}</span>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="settings-group">
        <h3>Local coding tools</h3>
        <p className="settings-help">Downloads are disabled until their permissions and availability are reviewed separately.</p>
        <div className="settings-row"><div className="settings-row-copy"><strong>Claude Code</strong></div><button className="button button-secondary" type="button" disabled>Download Claude Code</button></div>
        <div className="settings-row"><div className="settings-row-copy"><strong>Codex</strong></div><button className="button button-secondary" type="button" disabled>Download Codex</button></div>
      </div>
    </section>
  );
}
