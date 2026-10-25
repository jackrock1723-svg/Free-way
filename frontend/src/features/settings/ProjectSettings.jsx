import { useEffect, useRef, useState } from 'react';
import { settingsApi, validateStartupCommand } from './settingsApi.js';

function errorMessage(error) {
  return error?.message && error.message !== 'network'
    ? error.message
    : 'Project settings could not be saved. Try again.';
}

export default function ProjectSettings({ project = { id: 'demo', name: 'Free way' } }) {
  const [command, setCommand] = useState('');
  const [savedCommand, setSavedCommand] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [dependencyPolicy, setDependencyPolicy] = useState('ask');
  const [savedDependencyPolicy, setSavedDependencyPolicy] = useState('ask');
  const [autoFix, setAutoFix] = useState(false);
  const [savedAutoFix, setSavedAutoFix] = useState(false);
  const [dependencyError, setDependencyError] = useState('');
  const inputRef = useRef(null);
  const projectId = project.id || 'demo';

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setStatus('');
    settingsApi.readProject(projectId).then((document) => {
      if (!current) return;
      const value = typeof document?.preferences?.startup_command === 'string' ? document.preferences.startup_command : '';
      const savedPolicy = ['ask', 'never', 'project-local'].includes(document?.preferences?.dependency_install_policy)
        ? document.preferences.dependency_install_policy
        : 'ask';
      const savedRepair = document?.preferences?.auto_fix === true;
      setCommand(value);
      setSavedCommand(value);
      setDependencyPolicy(savedPolicy);
      setSavedDependencyPolicy(savedPolicy);
      setAutoFix(savedRepair);
      setSavedAutoFix(savedRepair);
      setDependencyError('');
    }).catch((requestError) => {
      if (!current) return;
      setCommand('');
      setSavedCommand('');
      setDependencyPolicy('ask');
      setSavedDependencyPolicy('ask');
      setAutoFix(false);
      setSavedAutoFix(false);
      setDependencyError(errorMessage(requestError));
      setError(errorMessage(requestError));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [projectId]);

  async function saveValue(value) {
    const validationError = validateStartupCommand(value);
    if (validationError) {
      setError(validationError);
      setStatus('');
      inputRef.current?.focus();
      return;
    }

    setError('');
    setStatus('Saving…');
    setSaving(true);
    const previous = savedCommand;
    setCommand(value);
    try {
      const document = await settingsApi.updateProject(projectId, { startup_command: value });
      const saved = typeof document?.preferences?.startup_command === 'string' ? document.preferences.startup_command : value;
      setCommand(saved);
      setSavedCommand(saved);
      setStatus('Saved on this device.');
    } catch (requestError) {
      setCommand(previous);
      setStatus('');
      setError(errorMessage(requestError));
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  async function saveDependencyPreference(name, value) {
    const previousPolicy = savedDependencyPolicy;
    const previousAutoFix = savedAutoFix;
    const nextPolicy = name === 'dependency_install_policy' ? value : dependencyPolicy;
    const nextAutoFix = name === 'auto_fix' ? value : autoFix;
    setDependencyPolicy(nextPolicy);
    setAutoFix(nextAutoFix);
    setDependencyError('');
    setStatus('Saving…');
    setSaving(true);
    try {
      const document = await settingsApi.updateProject(projectId, { [name]: value });
      const preferences = document?.preferences || {};
      const policy = ['ask', 'never', 'project-local'].includes(preferences.dependency_install_policy)
        ? preferences.dependency_install_policy
        : nextPolicy;
      const repair = typeof preferences.auto_fix === 'boolean' ? preferences.auto_fix : nextAutoFix;
      setDependencyPolicy(policy);
      setSavedDependencyPolicy(policy);
      setAutoFix(repair);
      setSavedAutoFix(repair);
      setStatus('Saved on this device.');
    } catch (requestError) {
      setDependencyPolicy(previousPolicy);
      setSavedDependencyPolicy(previousPolicy);
      setAutoFix(previousAutoFix);
      setSavedAutoFix(previousAutoFix);
      setStatus('');
      setDependencyError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    void saveValue(command);
  }

  const disabled = loading || saving;
  return (
    <section className="settings-section" aria-labelledby="project-settings-title">
      <div className="settings-section-heading">
        <h2 id="project-settings-title">Project settings</h2>
        <p>Settings for <strong>{project.name || projectId}</strong> are separate from the active Home project selector.</p>
      </div>
      <div className="settings-group">
        <h3>Project scope</h3>
        <div className="settings-choice-row project-scope" role="group" aria-label="Project scope">
          <button className="settings-choice is-selected" type="button" aria-pressed="true">This computer</button>
          <button className="settings-choice" type="button" disabled aria-pressed="false">Cloud</button>
        </div>
        <p className="settings-help">Cloud project storage is not configured for this workspace.</p>
      </div>

      <div className="settings-group">
        <h3>Dependency setup</h3>
        <div className="settings-row dependency-settings-row">
          <div className="settings-row-copy">
            <label htmlFor="dependency-install-policy">Dependency install policy</label>
            <p id="dependency-install-help">Ask is the default; install actions still wait for your approval. Never blocks them. Project-local is an explicit opt-in limited to lockfile installs inside the isolated agent worktree. Installer scripts are disabled; only lockfile installs in that worktree are considered, while global flags, arbitrary package scripts, remote npx, and unsupported package managers are rejected. Changing this setting never installs packages.</p>
          </div>
          <select id="dependency-install-policy" aria-describedby="dependency-install-help" value={dependencyPolicy} disabled={disabled} onChange={(event) => void saveDependencyPreference('dependency_install_policy', event.target.value)}>
            <option value="ask">Ask every time</option>
            <option value="never">Never install dependencies</option>
            <option value="project-local">Allow project-local lockfile installs</option>
          </select>
        </div>
        <div className="settings-row dependency-settings-row">
          <div className="settings-row-copy">
            <label htmlFor="automatic-repair">Automatic repair</label>
            <p id="automatic-repair-help">Off by default. Repairs remain bounded to the existing rounds and retry only failed checks; every proposed fix still requires an approved action. Repeated identical failures stop and leave the diff in review. Preview errors also remain in review unless enabled.</p>
          </div>
          <input id="automatic-repair" type="checkbox" aria-describedby="automatic-repair-help" checked={autoFix} disabled={disabled} onChange={(event) => void saveDependencyPreference('auto_fix', event.target.checked)} />
        </div>
        {dependencyError && <p className="settings-inline-error" role="alert">{dependencyError}</p>}
      </div>

      <div className="settings-group">
        <h3>Startup command</h3>
        <p id="startup-command-help" className="settings-help">Stored as text only, up to 2,000 characters. Saving never runs the command.</p>
        <form className="startup-command-form" onSubmit={submit}>
          <label htmlFor="startup-command">Startup command</label>
          <textarea
            ref={inputRef}
            id="startup-command"
            value={command}
            aria-describedby={`startup-command-help${error ? ' startup-command-error' : ''}`}
            aria-invalid={Boolean(error)}
            rows={4}
            disabled={disabled}
            onChange={(event) => { setCommand(event.target.value); setError(''); setStatus('Unsaved changes.'); }}
          />
          {error && <p id="startup-command-error" className="settings-inline-error" role="alert">{error}</p>}
          <div className="settings-save-row">
            <p className="settings-save-status" data-testid="project-settings-save-status" role="status">{status || (loading ? 'Loading project settings…' : 'No unsaved changes.')}</p>
            <div className="settings-actions">
              <button className="button button-secondary" type="button" disabled={disabled || savedCommand === ''} onClick={() => void saveValue('')}>Reset startup command</button>
              <button className="button button-primary" type="submit" disabled={disabled || command === savedCommand}>Save startup command</button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
