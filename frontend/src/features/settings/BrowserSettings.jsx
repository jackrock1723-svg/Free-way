import { useState } from 'react';
import { settingsApi } from './settingsApi.js';

function messageFor(error) {
  return error?.message && error.message !== 'network' ? error.message : 'Browser profile metadata could not be read.';
}

export default function BrowserSettings() {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function checkProfiles() {
    setLoading(true);
    setError('');
    try {
      setMetadata(await settingsApi.readBrowserProfiles());
    } catch (requestError) {
      setMetadata(null);
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="browser-settings-title">
      <div className="settings-section-heading">
        <h2 id="browser-settings-title">Browser</h2>
        <p>Check supported browser profile folder names. Cookies, passwords, and sessions are never read.</p>
      </div>
      <div className="settings-actions">
        <button className="button button-secondary" type="button" onClick={checkProfiles} disabled={loading}>{loading ? 'Checking…' : 'Check again'}</button>
      </div>
      {error && <p className="settings-inline-error" role="alert">{error}</p>}
      {!metadata && !loading && !error && <p className="settings-metadata-empty" role="status">Browser profiles have not been checked yet. Check again to read profile folder names.</p>}
      {loading && <p className="settings-save-status" role="status">Checking browser profile folders…</p>}
      {metadata && <div className="settings-metadata-list" aria-label="Supported browser profiles">
        {(Array.isArray(metadata.browsers) ? metadata.browsers : []).map((browser) => {
          const profiles = Array.isArray(browser.profiles) ? browser.profiles : [];
          const count = Number.isInteger(browser.profile_count) ? browser.profile_count : profiles.length;
          return <article className="settings-group" key={browser.name}>
            <div className="settings-metadata-item-heading">
              <h3>{browser.name}</h3>
              <span className="state-badge">{count} {count === 1 ? 'profile' : 'profiles'}</span>
            </div>
            {profiles.length > 0
              ? <ul className="settings-profile-list">{profiles.map((profile) => <li key={profile}>{profile}</li>)}</ul>
              : <p className="settings-help">{browser.status === 'unavailable' ? 'Profile folder is unavailable.' : 'No supported profile folders were found.'}</p>}
          </article>;
        })}
        {metadata.available === false && <p className="settings-metadata-empty">{metadata.reason || 'No supported browser profile folders were found.'}</p>}
      </div>}
    </section>
  );
}
