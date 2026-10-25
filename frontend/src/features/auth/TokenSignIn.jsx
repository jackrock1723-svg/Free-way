import { useState } from 'react';
import { saveToken, tokenWorks } from '../../api.js';

export const NEEDS_TOKEN = /cloud token/i;

export default function TokenSignIn({ onSignedIn }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (!value.trim()) { setProblem('Paste your access token first.'); return; }
    setBusy(true); setProblem('');
    const ok = await tokenWorks(value);
    setBusy(false);
    if (!ok) { setProblem('That access token was not accepted. Check it and try again.'); return; }
    saveToken(value);
    setValue('');
    (onSignedIn || (() => globalThis.location.reload()))();
  }
  return (
    <form className="token-signin" aria-label="Sign in with access token" onSubmit={submit}>
      <h2>Sign in to Free way</h2>
      <p>This Free way server is private. Paste the access token the owner gave you, then press Sign in. It is saved only in this browser.</p>
      <div className="token-signin-row">
        <input type="password" autoComplete="off" spellCheck="false" aria-label="Access token" placeholder="Paste access token"
          value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} />
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
      </div>
      {problem && <p className="token-signin-error" role="alert">{problem}</p>}
    </form>
  );
}
