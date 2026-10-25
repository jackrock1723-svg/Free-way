import { useEffect, useState } from 'react';
import { settingsApi } from './settingsApi.js';

function messageFor(error) {
  return error?.message && error.message !== 'network'
    ? error.message
    : 'Account status could not be read from this workspace.';
}

export default function AccountSettings() {
  const [state, setState] = useState({ loading: true, auth: null, session: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([settingsApi.readAuthConfig(), settingsApi.readAuthSession()])
      .then(([auth, session]) => {
        if (cancelled) return;
        if (typeof auth?.enabled !== 'boolean' || typeof session?.authenticated !== 'boolean') {
          throw new Error('Account status is unavailable.');
        }
        setState({ loading: false, auth, session, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, auth: null, session: null, error: messageFor(error) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="settings-section" aria-labelledby="account-settings-title">
      <div className="settings-section-heading">
        <h2 id="account-settings-title">Account</h2>
        <p>This page shows only identity and sign-in state reported by this workspace.</p>
      </div>
      {state.loading && <p className="settings-save-status" role="status">Loading account status…</p>}
      {state.error && <p className="settings-inline-error" role="alert">{state.error}</p>}
      {state.auth && state.session && (
        <div className="settings-group">
          <dl className="settings-facts">
            <div><dt>Identity</dt><dd>{state.session.authenticated ? 'Signed-in workspace session' : 'Local workspace'}</dd></div>
            <div><dt>Google Sign-In</dt><dd>{state.auth.enabled ? 'Enabled; no sign-in action is available here.' : 'Google Sign-In is off.'}</dd></div>
          </dl>
          <p className="settings-help">Profile identity is unavailable in this build.</p>
          {state.session.authenticated && (
            <div className="settings-actions">
              <button className="button button-secondary" type="button" data-google-signout>Sign out</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
