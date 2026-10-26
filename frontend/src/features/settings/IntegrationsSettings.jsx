import { useMemo, useState } from 'react';

const TILES = [
  { id: 'gmail', name: 'Gmail' },
  { id: 'gdrive', name: 'Google Drive' },
  { id: 'gcal', name: 'Google Calendar' },
  { id: 'slack', name: 'Slack' },
  { id: 'notion', name: 'Notion' },
  { id: 'linear', name: 'Linear' },
  { id: 'posthog', name: 'PostHog' },
  { id: 'sentry', name: 'Sentry' },
  { id: 'stripe', name: 'Stripe' },
  { id: 'supabase', name: 'Supabase' },
  { id: 'hubspot', name: 'HubSpot' },
  { id: 'outlook', name: 'Outlook' },
];

export default function IntegrationsSettings({ connectors = [], loading = false, error = '' }) {
  const [search, setSearch] = useState('');
  const connectorById = useMemo(
    () => new Map((Array.isArray(connectors) ? connectors : []).filter((item) => item && typeof item.id === 'string').map((item) => [item.id, item])),
    [connectors],
  );
  const visibleTiles = TILES.filter((tile) => tile.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <section className="settings-section" aria-labelledby="integrations-settings-title">
      <div className="settings-section-heading">
        <h2 id="integrations-settings-title">Integrations</h2>
        <p>Status comes from the local connector catalog. This page does not contact external accounts.</p>
      </div>
      <div className="settings-group">
        <label className="integration-search-label" htmlFor="integration-search">Search integrations</label>
        <input id="integration-search" className="integration-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" />
        <p className="settings-help">Account authorization and connection changes are unavailable in this build.</p>
        {loading && <p className="settings-save-status" role="status">Loading connector catalog…</p>}
        {error && <p className="settings-inline-error" role="alert">{error}</p>}
        <div className="integration-grid">
          {visibleTiles.map((tile) => {
            const connector = connectorById.get(tile.id);
            const status = error
              ? 'Status unavailable'
              : loading
                ? 'Checking catalog…'
                : connector
                  ? (connector.connected === true ? 'Configured' : 'Connect coming soon')
                  : 'Unavailable in this build';
            return (
              <article className="integration-tile" data-testid="integration-tile" aria-labelledby={`integration-${tile.id}-title`} key={tile.id}>
                <h3 id={`integration-${tile.id}-title`}>{tile.name}</h3>
                <p className={`state-badge ${connector?.connected === true && !error ? 'is-connected' : ''}`}>{status}</p>
              </article>
            );
          })}
        </div>
        {!loading && visibleTiles.length === 0 && <p className="empty-state">No integrations match this search.</p>}
      </div>
    </section>
  );
}
