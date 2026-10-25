export default function UpdatesSettings({ version }) {
  const runningVersion = typeof version === 'string' && version.trim() ? version : 'Unavailable';
  return (
    <section className="settings-section" aria-labelledby="updates-settings-title">
      <div className="settings-section-heading">
        <h2 id="updates-settings-title">Updates</h2>
        <p>See the version currently running in this app.</p>
      </div>
      <dl className="settings-facts">
        <div><dt>Running version</dt><dd>{runningVersion}</dd></div>
        <div><dt>Update source</dt><dd>Not configured</dd></div>
      </dl>
      <p className="settings-metadata-empty">Update source is not configured. This build cannot check for or download updates.</p>
      <div className="settings-actions">
        <button className="button button-secondary" type="button" disabled title="No update source is configured.">Check for updates</button>
      </div>
    </section>
  );
}
