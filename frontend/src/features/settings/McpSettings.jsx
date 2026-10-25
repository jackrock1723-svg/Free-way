import { useEffect, useState } from 'react';
import { settingsApi } from './settingsApi.js';

function messageFor(error) {
  return error?.message && error.message !== 'network' ? error.message : 'MCP status could not be read.';
}

function statusLabel(status) {
  return ({ connected: 'Connected', unavailable: 'Unavailable', 'not checked': 'Not checked' })[status] || 'Not checked';
}

export default function McpSettings() {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refreshStatus() {
    setLoading(true);
    setError('');
    try {
      setMetadata(await settingsApi.readMcpStatus());
    } catch (requestError) {
      setMetadata(null);
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshStatus(); }, []);

  const servers = Array.isArray(metadata?.servers) ? metadata.servers : [];
  return (
    <section className="settings-section" aria-labelledby="mcp-settings-title">
      <div className="settings-section-heading">
        <h2 id="mcp-settings-title">MCP</h2>
        <p>Review configured server metadata. Refresh reads the current local status and never starts a server.</p>
      </div>
      <div className="settings-actions">
        <button className="button button-secondary" type="button" onClick={refreshStatus} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        <button className="button button-secondary" type="button" disabled title="Secure server validation and explicit-consent management are not available.">Add server</button>
      </div>
      {error && <p className="settings-inline-error" role="alert">{error}</p>}
      {loading && <p className="settings-save-status" role="status">Reading local MCP status…</p>}
      {!loading && !error && servers.length === 0 && <p className="settings-metadata-empty">No configured MCP servers are available in this workspace.</p>}
      {!loading && !error && servers.length > 0 && <div className="settings-metadata-list" aria-label="Configured MCP servers">
        {servers.map((server) => <article className="settings-group" key={server.id}>
          <div className="settings-metadata-item-heading">
            <h3>{server.name}</h3>
            <span className="state-badge">{statusLabel(server.status)}</span>
          </div>
          <p className="settings-help">Transport: {server.transport}</p>
        </article>)}
      </div>}
    </section>
  );
}
