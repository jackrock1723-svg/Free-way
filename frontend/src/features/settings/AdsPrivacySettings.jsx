import { useEffect, useState } from 'react';
import { api } from '../../api.js';

function friendly(error) {
  return error?.status === 404 ? 'Ads are not part of this build, so nothing is collected.' : 'Ad privacy settings could not be loaded. Please try again.';
}

export default function AdsPrivacySettings() {
  const [state, setState] = useState({ loading: true, error: '', privacy: null });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    api.request('/api/ads/privacy')
      .then((privacy) => { if (live) setState({ loading: false, error: '', privacy }); })
      .catch((error) => { if (live) setState({ loading: false, error: friendly(error), privacy: null }); });
    return () => { live = false; };
  }, []);

  const toggle = async (event) => {
    const next = event.target.checked;
    setSaving(true); setMessage('');
    try {
      const privacy = await api.request('/api/ads/privacy', { method: 'POST', body: { use_stack: next } });
      setState((s) => ({ ...s, privacy }));
      setMessage(next ? 'Stack-based ads are on.' : 'Stack-based ads are off. Only your current task is used.');
    } catch {
      setMessage('That change could not be saved. Please try again.');
    } finally { setSaving(false); }
  };

  const download = async () => {
    setMessage('');
    try {
      const data = await api.request('/api/ads/data');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'free-way-ad-data.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Your ad data was downloaded.');
    } catch { setMessage('Your ad data could not be downloaded. Please try again.'); }
  };

  const erase = async () => {
    setMessage('');
    try { await api.request('/api/ads/data', { method: 'DELETE' }); setMessage('Your ad data was deleted.'); }
    catch { setMessage('Your ad data could not be deleted. Please try again.'); }
  };

  const p = state.privacy;
  return (
    <section className="settings-section" aria-labelledby="ads-privacy-title">
      <div className="settings-section-heading">
        <h2 id="ads-privacy-title">Ads &amp; privacy</h2>
        <p>How the sponsored cards that keep Free way free are chosen.</p>
      </div>
      {state.loading ? <p className="settings-save-status" role="status">Loading…</p> : null}
      {state.error ? <p className="settings-help" role="status">{state.error}</p> : null}
      {p ? (
        <div className="settings-group">
          <h3>Privacy notice</h3>
          <p className="settings-help" data-testid="ads-privacy-notice">{p.notice}</p>
          {!p.enabled ? <p className="settings-help">Ads are currently turned off for everyone.</p> : null}
          <label className="check-row">
            <input type="checkbox" checked={p.use_stack} disabled={saving} onChange={toggle} />
            {' '}Use my project&apos;s stack (languages and frameworks) to pick relevant ads
          </label>
          <div className="settings-actions">
            <button className="button button-secondary" type="button" onClick={download}>Download my ad data</button>
            <button className="button button-secondary" type="button" onClick={erase}>Delete my ad data</button>
          </div>
        </div>
      ) : null}
      {message ? <p className="settings-save-status" role="status">{message}</p> : null}
    </section>
  );
}
