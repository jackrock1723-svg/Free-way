import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import './admin.css';

const TOKEN_KEY = 'fw-admin-token';
const TABS = [
  ['overview', 'Overview'],
  ['users', 'Users'],
  ['revenue', 'Revenue'],
  ['errors', 'Errors'],
];

function readToken() {
  try { return window.sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function saveToken(value) {
  try {
    if (value) window.sessionStorage.setItem(TOKEN_KEY, value);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: keep the token in memory only */ }
}

function when(seconds) {
  if (!seconds) return 'never';
  return new Date(Number(seconds) * 1000).toLocaleString();
}

function duration(seconds) {
  const s = Number(seconds) || 0;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function errorText(error) {
  // Admins see the real server message so problems can be fixed quickly.
  if (error instanceof ApiError) return error.status ? `${error.message} (HTTP ${error.status})` : 'Network error: the server could not be reached.';
  return String(error?.message || error);
}

function Stat({ label, value, tone }) {
  return (
    <div className={`fw-admin-stat${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Overview({ data }) {
  const { counts, health, agents, sandbox } = data;
  return (
    <div className="fw-admin-grid" aria-label="Overview">
      <section className="fw-admin-card">
        <h2>People</h2>
        <div className="fw-admin-stats">
          <Stat label="Users" value={counts.users} />
          <Stat label="Sign-ins" value={counts.logins} />
          <Stat label="Errors (24h)" value={counts.errors_24h} tone={counts.errors_24h ? 'warn' : 'good'} />
        </div>
      </section>
      <section className="fw-admin-card">
        <h2>System health</h2>
        <ul className="fw-admin-list">
          <li><span>Status</span><b className={health.ok ? 'is-good' : 'is-bad'}>{health.ok ? 'Healthy' : 'Storage unreachable'}</b></li>
          <li><span>Storage</span><b>{health.storage === 'postgres' ? 'Postgres / Supabase' : 'Local files'}</b></li>
          {health.storage_warning ? <li><span>Storage warning</span><b className="is-warn">{health.storage_warning}</b></li> : null}
          <li><span>Version</span><b>{health.version}</b></li>
          <li><span>Uptime</span><b>{duration(health.uptime_s)}</b></li>
          <li><span>Sign-in</span><b>{health.google_sign_in ? (health.multi_user ? 'Google (everyone)' : 'Google (owner only)') : 'Local / token'}</b></li>
          <li><span>Ads</span><b>{health.ads_enabled ? 'On' : 'Off'}</b></li>
        </ul>
      </section>
      <section className="fw-admin-card">
        <h2>Agents</h2>
        <ul className="fw-admin-list">
          <li><span>Mode</span><b>{agents.mode}</b></li>
          <li><span>Runs (this session)</span><b>{agents.total}</b></li>
          <li><span>Running now</span><b>{agents.running}</b></li>
        </ul>
      </section>
      <section className="fw-admin-card">
        <h2>Sandbox</h2>
        <ul className="fw-admin-list">
          <li><span>Mode</span><b>{sandbox.mode}</b></li>
          <li><span>Docker</span><b className={sandbox.available ? 'is-good' : 'is-warn'}>{sandbox.available ? 'Available' : 'Not available'}</b></li>
          <li><span>Network in sandbox</span><b>{sandbox.network ? 'On' : 'Off'}</b></li>
        </ul>
      </section>
    </div>
  );
}

function UserDetail({ user, busy, onToggle, onClose }) {
  return (
    <section className="fw-admin-card fw-admin-detail" aria-label="User details">
      <header>
        <div>
          <h2>{user.name || user.email || user.id}</h2>
          <p>{user.email || 'No email (local owner)'}</p>
        </div>
        <div className="fw-admin-actions">
          {user.id !== 'owner' ? (
            <button type="button" className={user.disabled ? 'fw-admin-btn' : 'fw-admin-btn is-danger'} disabled={busy} onClick={() => onToggle(user)}>
              {user.disabled ? 'Enable user' : 'Disable user'}
            </button>
          ) : null}
          <button type="button" className="fw-admin-btn is-ghost" onClick={onClose}>Close</button>
        </div>
      </header>
      <div className="fw-admin-stats">
        <Stat label="Status" value={user.disabled ? 'Disabled' : 'Active'} tone={user.disabled ? 'bad' : 'good'} />
        <Stat label="Projects" value={user.projects.length} />
        <Stat label="Active sessions" value={user.active_sessions} />
      </div>
      <h3>Usage</h3>
      {Object.keys(user.usage).length ? (
        <ul className="fw-admin-list">
          {Object.entries(user.usage).map(([kind, total]) => <li key={kind}><span>{kind.replace('_', ' ')}</span><b>{total}</b></li>)}
        </ul>
      ) : <p className="fw-admin-empty">No usage yet.</p>}
      <h3>Projects</h3>
      {user.projects.length ? <p className="fw-admin-chips">{user.projects.map((p) => <span key={p}>{p}</span>)}</p> : <p className="fw-admin-empty">No projects yet.</p>}
      <h3>Recent sign-ins</h3>
      {user.logins.length ? (
        <table className="fw-admin-table" aria-label="Sign-ins">
          <thead><tr><th>Time</th><th>IP</th><th>Device</th><th>Result</th></tr></thead>
          <tbody>
            {user.logins.map((l, i) => (
              <tr key={i}><td>{when(l.at)}</td><td>{l.ip || '—'}</td><td className="fw-admin-ua">{l.user_agent || '—'}</td><td>{l.success ? 'OK' : 'Rejected'}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="fw-admin-empty">No sign-ins recorded.</p>}
    </section>
  );
}

function Users({ users, detail, busy, onView, onToggle, onClose }) {
  return (
    <div className="fw-admin-stack">
      <section className="fw-admin-card">
        <h2>All users ({users.length})</h2>
        <table className="fw-admin-table" aria-label="Users">
          <thead><tr><th>User</th><th>Last sign-in</th><th>Sign-ins</th><th>Projects</th><th>Status</th><th><span className="fw-sr">Actions</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name || (u.id === 'owner' ? 'Owner (local)' : u.id)}</b><br /><small>{u.email || ''}</small></td>
                <td>{when(u.last_login_at)}</td>
                <td>{u.logins}</td>
                <td>{u.projects}</td>
                <td><span className={`fw-admin-pill ${u.disabled ? 'is-bad' : 'is-good'}`}>{u.disabled ? 'Disabled' : 'Active'}</span></td>
                <td><button type="button" className="fw-admin-btn is-small" onClick={() => onView(u.id)} aria-label={`View ${u.email || u.id}`}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {detail ? <UserDetail user={detail} busy={busy} onToggle={onToggle} onClose={onClose} /> : null}
    </div>
  );
}

function Revenue({ data, call, reload, onError, onNotice }) {
  const events = Object.entries(data.events || {});
  const dash = data.dashboard;
  const cfg = data.config || {};
  const [limits, setLimits] = useState(() => ({
    max_per_day: cfg.max_per_day ?? 12, min_gap_s: cfg.min_gap_s ?? 120, max_per_run: cfg.max_per_run ?? 1, min_relevance: cfg.min_relevance ?? 0.5,
  }));
  const [saving, setSaving] = useState(false);
  const save = async (patch, done) => {
    setSaving(true);
    try { await call('/api/admin/ads/config', { method: 'POST', body: patch }); onNotice(done); await reload('revenue'); }
    catch (e) { onError(errorText(e)); }
    finally { setSaving(false); }
  };
  const submitLimits = (event) => {
    event.preventDefault();
    const patch = Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, Number(v)]));
    if (Object.values(patch).some((v) => !Number.isFinite(v) || v < 0)) { onError('Limits must be numbers of 0 or more.'); return; }
    save(patch, 'Ad limits saved.');
  };
  const field = (key, label, step = '1') => (
    <label className="fw-admin-field" key={key}>
      <span>{label}</span>
      <input type="number" min="0" step={step} value={limits[key]} onChange={(e) => setLimits((l) => ({ ...l, [key]: e.target.value }))} />
    </label>
  );
  return (
    <div className="fw-admin-stack" aria-label="Revenue">
      <div className="fw-admin-grid">
        <section className="fw-admin-card">
          <h2>Ad events</h2>
          {events.length ? (
            <div className="fw-admin-stats">{events.map(([k, v]) => <Stat key={k} label={k} value={v} />)}</div>
          ) : <p className="fw-admin-empty">No ad events recorded yet.</p>}
        </section>
        <section className="fw-admin-card">
          <h2>Ads network</h2>
          {!data.available ? <p className="fw-admin-empty">{data.reason || 'Ads are not part of this build.'}</p> : dash ? (
            <ul className="fw-admin-list">
              {Object.entries(dash).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => <li key={k}><span>{k.replaceAll('_', ' ')}</span><b>{String(v)}</b></li>)}
            </ul>
          ) : null}
        </section>
      </div>
      {data.available ? (
        <section className="fw-admin-card" aria-label="Ad controls">
          <h2>Ad controls</h2>
          <div className="fw-admin-actions">
            <span className={`fw-admin-pill ${cfg.enabled ? 'is-good' : 'is-bad'}`}>{cfg.enabled ? 'Ads on' : 'Ads off'}</span>
            <button type="button" className={cfg.enabled ? 'fw-admin-btn is-danger' : 'fw-admin-btn'} disabled={saving}
              onClick={() => save({ enabled: cfg.enabled ? 0 : 1 }, cfg.enabled ? 'Ads turned off for everyone.' : 'Ads turned on.')}>
              {cfg.enabled ? 'Turn ads off' : 'Turn ads on'}
            </button>
          </div>
          <form className="fw-admin-form" onSubmit={submitLimits}>
            {field('max_per_day', 'Max ads per user per day')}
            {field('min_gap_s', 'Minimum seconds between ads')}
            {field('max_per_run', 'Max ads per run')}
            {field('min_relevance', 'Minimum relevance (0–1)', '0.05')}
            <button type="submit" className="fw-admin-btn" disabled={saving}>Save limits</button>
          </form>
        </section>
      ) : null}
      {data.available ? (
        <section className="fw-admin-card">
          <h2>Targeting signals</h2>
          {data.signals?.length ? (
            <table className="fw-admin-table" aria-label="Targeting signals">
              <thead><tr><th>User</th><th>Top categories</th><th>Stack</th><th>Shown</th><th>Closed</th><th>Stack ads</th><th>Updated</th></tr></thead>
              <tbody>
                {data.signals.map((s) => (
                  <tr key={s.user_id}>
                    <td>{s.user_id}</td>
                    <td>{(s.categories || []).map((c) => `${c.category} ${c.score}`).join(', ') || '—'}</td>
                    <td>{[...(s.frameworks || []), ...(s.languages || [])].join(', ') || '—'}</td>
                    <td>{s.shown}</td><td>{s.closed}</td><td>{s.use_stack ? 'On' : 'Off'}</td><td>{when(s.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="fw-admin-empty">No targeting signals yet. They appear after the first ad request.</p>}
        </section>
      ) : null}
    </div>
  );
}

function Errors({ errors }) {
  if (!errors.length) return <section className="fw-admin-card"><h2>Error log</h2><p className="fw-admin-empty">No errors logged. Nice.</p></section>;
  return (
    <section className="fw-admin-card" aria-label="Errors">
      <h2>Error log ({errors.length})</h2>
      <table className="fw-admin-table" aria-label="Error log">
        <thead><tr><th>Time</th><th>Source</th><th>Message</th><th>Where</th><th>User</th></tr></thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={i}>
              <td>{when(e.at)}</td>
              <td><span className={`fw-admin-pill ${e.level === 'error' ? 'is-bad' : 'is-warn'}`}>{e.source}</span></td>
              <td className="fw-admin-msg">{e.message}</td>
              <td>{e.path || '—'}</td>
              <td>{e.user_id || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState(readToken);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState('checking');
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const call = useCallback((path, options = {}) => api.request(path, {
    ...options,
    headers: token ? { 'X-Admin-Token': token } : undefined,
  }), [token]);

  useEffect(() => {
    let live = true;
    call('/api/admin/whoami').then((who) => {
      if (!live) return;
      if (who.admin) setState('ready');
      else {
        if (token) { setError('That admin token was not accepted.'); saveToken(''); setToken(''); }
        setState('locked');
      }
    }).catch((e) => { if (live) { setError(errorText(e)); setState('locked'); } });
    return () => { live = false; };
  }, [call, token]);

  const load = useCallback(async (which = tab) => {
    setError('');
    try {
      const path = { overview: '/api/admin/overview', users: '/api/admin/users', revenue: '/api/admin/ads', errors: '/api/admin/errors' }[which];
      setData({ tab: which, value: await call(path) });
    } catch (e) {
      setError(errorText(e));
    }
  }, [call, tab]);

  useEffect(() => { if (state === 'ready') load(tab); }, [state, tab, load]);

  const unlock = (event) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) { setError('Paste the admin token from your admin access file.'); return; }
    setError('');
    saveToken(value);
    setDraft('');
    setState('checking');
    setToken(value);
  };

  const lock = () => {
    saveToken('');
    setToken('');
    setData(null);
    setDetail(null);
    setNotice('');
    setState('locked');
  };

  const view = async (id) => {
    setError('');
    try { setDetail(await call(`/api/admin/users/${encodeURIComponent(id)}`)); } catch (e) { setError(errorText(e)); }
  };

  const toggle = async (user) => {
    setBusy(true);
    setError('');
    try {
      await call(`/api/admin/users/${encodeURIComponent(user.id)}/${user.disabled ? 'enable' : 'disable'}`, { method: 'POST', body: {} });
      setNotice(`${user.email || user.id} is now ${user.disabled ? 'active' : 'disabled'}.`);
      await view(user.id);
      await load('users');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fw-admin">
      <div className="fw-admin-glow" aria-hidden="true" />
      <header className="fw-admin-top">
        <a className="fw-admin-brand" href="/" aria-label="Back to Free way">
          <img src="/icon.svg" alt="" width="28" height="28" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>Free way <em>Admin</em></span>
        </a>
        {state === 'ready' ? (
          <div className="fw-admin-actions">
            <button type="button" className="fw-admin-btn is-ghost" onClick={() => load(tab)}>Refresh</button>
            <button type="button" className="fw-admin-btn is-ghost" onClick={lock}>Lock</button>
          </div>
        ) : null}
      </header>

      {error ? <div className="fw-admin-alert" role="alert">{error}</div> : null}
      {notice && state === 'ready' ? <div className="fw-admin-notice" role="status">{notice}</div> : null}

      {state === 'checking' ? <p className="fw-admin-empty fw-admin-center">Checking access…</p> : null}

      {state === 'locked' ? (
        <form className="fw-admin-card fw-admin-unlock" onSubmit={unlock}>
          <h1>Admin panel</h1>
          <p>Paste the admin token from your admin access file, or sign in with an admin Google account.</p>
          <label htmlFor="fw-admin-token">Admin token</label>
          <input id="fw-admin-token" type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="fw-admin-btn">Unlock</button>
          <a className="fw-admin-link" href="/">Back to Free way</a>
        </form>
      ) : null}

      {state === 'ready' ? (
        <main className="fw-admin-main">
          <nav className="fw-admin-tabs" role="tablist" aria-label="Admin sections">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''}
                onClick={() => { setTab(id); setNotice(''); if (id !== 'users') setDetail(null); }}>{label}</button>
            ))}
          </nav>
          {data?.tab === 'overview' && tab === 'overview' ? <Overview data={data.value} /> : null}
          {data?.tab === 'users' && tab === 'users' ? (
            <Users users={data.value} detail={detail} busy={busy} onView={view} onToggle={toggle} onClose={() => setDetail(null)} />
          ) : null}
          {data?.tab === 'revenue' && tab === 'revenue' ? <Revenue key={JSON.stringify(data.value.config || {})} data={data.value} call={call} reload={load} onError={setError} onNotice={setNotice} /> : null}
          {data?.tab === 'errors' && tab === 'errors' ? <Errors errors={data.value} /> : null}
        </main>
      ) : null}
    </div>
  );
}
