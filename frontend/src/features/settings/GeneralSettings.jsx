import { useEffect, useState } from 'react';
import { api } from '../../api.js';

function SettingToggle({ id, label, description, checked, disabled, onChange }) {
  const helpId = `${id}-help`;
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <label htmlFor={id}>{label}</label>
        <p id={helpId}>{description}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

export const AGENT_MODES = [
  { value: 'base2', label: 'Default', help: 'File Picker, Code Searcher, Researcher, Thinker, Editor, Reviewer and Basher. Balanced quality and speed.' },
  { value: 'lite', label: 'Lite', help: 'Skips the Researcher and Thinker for faster, lighter runs on simple tasks.' },
  { value: 'max', label: 'Max', help: 'Three editors try different strategies and a selector keeps the best proposal. Slower, uses more free-model calls.' },
  { value: 'plan', label: 'Plan', help: 'Plan only: agents read and plan, but never propose file writes or commands.' },
];

function messageFor(error) {
  return error?.message && error.message !== 'network'
    ? error.message
    : 'Settings could not be saved. Try again.';
}

export default function GeneralSettings({ preferences = {}, onSave, disabled = false }) {
  const [status, setStatus] = useState('No unsaved changes.');
  const [error, setError] = useState('');
  const [showFullAccessWarning, setShowFullAccessWarning] = useState(false);
  const [sandboxState, setSandboxState] = useState(null);
  const sandboxMode = preferences.sandbox || 'off';

  useEffect(() => {
    let cancelled = false;
    api.request('/api/sandbox/status').then((state) => { if (!cancelled) setSandboxState(state); })
      .catch(() => { if (!cancelled) setSandboxState({ available: false, reason: 'Sandbox status could not be checked.' }); });
    return () => { cancelled = true; };
  }, [sandboxMode]);

  async function savePreference(patch) {
    setError('');
    setStatus('Saving…');
    try {
      await onSave(patch);
      setStatus('Saved on this device.');
      return true;
    } catch (requestError) {
      setStatus('');
      setError(messageFor(requestError));
      return false;
    }
  }

  function changeBoolean(key, value) {
    if (key === 'full_access' && value) {
      setShowFullAccessWarning(true);
      return;
    }
    void savePreference({ [key]: value });
  }

  async function confirmFullAccess() {
    if (await savePreference({ full_access: true })) setShowFullAccessWarning(false);
  }

  return (
    <section className="settings-section" aria-labelledby="general-settings-title">
      <div className="settings-section-heading">
        <h2 id="general-settings-title">General</h2>
        <p>Preferences are saved through this local workspace. Items not connected to a runtime are labeled below.</p>
      </div>
      <p className="settings-save-status" data-testid="settings-save-status" role="status">{status}</p>
      {error && <p className="settings-inline-error" role="alert">{error}</p>}

      <div className="settings-group">
        <h3>Agents</h3>
        <div className="settings-row">
          <div className="settings-row-copy">
            <label htmlFor="agent-mode">Agent mode</label>
            <p id="agent-mode-help">{AGENT_MODES.find((item) => item.value === (preferences.agent_mode || 'base2'))?.help}</p>
          </div>
          <select
            id="agent-mode"
            aria-describedby="agent-mode-help"
            value={preferences.agent_mode || 'base2'}
            disabled={disabled}
            onChange={(event) => void savePreference({ agent_mode: event.target.value })}
          >
            {AGENT_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <h3>Sandbox</h3>
        <div className="settings-row">
          <div className="settings-row-copy">
            <label htmlFor="sandbox-mode">Run approved commands in</label>
            <p id="sandbox-mode-help">Docker runs each approved command in a throwaway container with only the project mounted, no secrets, and CPU, memory and time limits.</p>
          </div>
          <select id="sandbox-mode" aria-describedby="sandbox-mode-help" value={sandboxMode} disabled={disabled}
            onChange={(event) => void savePreference({ sandbox: event.target.value })}>
            <option value="off">This computer</option>
            <option value="docker">Docker sandbox</option>
          </select>
        </div>
        <p className="settings-sandbox-status" data-testid="sandbox-status" role="status">
          {!sandboxState ? 'Checking Docker.' : sandboxState.available
            ? `Docker engine ${sandboxState.version || ''} is running.`
            : `${sandboxState.reason || 'Docker is unavailable.'}${sandboxMode === 'docker' ? ' Commands will run on this computer until Docker is available.' : ''}`}
        </p>
        <SettingToggle
          id="sandbox-network"
          label="Allow network inside the sandbox"
          description="Off by default. Turn on only when a command must download packages."
          checked={Boolean(preferences.sandbox_network)}
          disabled={disabled || sandboxMode !== 'docker'}
          onChange={(value) => changeBoolean('sandbox_network', value)}
        />
      </div>

      <div className="settings-group">
        <h3>Workspace preferences</h3>
        <SettingToggle
          id="advanced-mode"
          label="Advanced Mode"
          description="Saved preference only; advanced controls are not available yet."
          checked={Boolean(preferences.advanced_mode)}
          disabled={disabled}
          onChange={(value) => changeBoolean('advanced_mode', value)}
        />
        <SettingToggle
          id="notification-sounds"
          label="Notification sounds"
          description="The preference is saved, but this build does not play sound alerts."
          checked={Boolean(preferences.notification_sounds)}
          disabled={disabled}
          onChange={(value) => changeBoolean('notification_sounds', value)}
        />
        <SettingToggle
          id="auto-next-session"
          label="Automatically start the next session"
          description="Saved as a preference; automatic session starting is not wired in this build."
          checked={Boolean(preferences.auto_next_session)}
          disabled={disabled}
          onChange={(value) => changeBoolean('auto_next_session', value)}
        />
        <SettingToggle
          id="include-agents-md"
          label="Include AGENTS.md"
          description="Saved as a preference; the current agent loader does not use it yet."
          checked={Boolean(preferences.include_agents_md)}
          disabled={disabled}
          onChange={(value) => changeBoolean('include_agents_md', value)}
        />
        <SettingToggle
          id="pre-sync-projects"
          label="Pre-sync projects to Cloud"
          description="Unavailable because this workspace has no cloud project-sync service."
          checked={false}
          disabled
          onChange={() => {}}
        />
        <SettingToggle
          id="full-access"
          label="Full access"
          description="Saved preference only; every agent action still requires explicit approval in this build."
          checked={Boolean(preferences.full_access)}
          disabled={disabled}
          onChange={(value) => changeBoolean('full_access', value)}
        />
      </div>

      <div className="settings-group">
        <h3>Chat history</h3>
        <div className="settings-row">
          <div className="settings-row-copy">
            <label htmlFor="local-chat-auto-archive">Local chat auto-archive</label>
            <p id="local-chat-auto-archive-help">Saved as a preference; automatic archiving is not applied in this build.</p>
          </div>
          <select
            id="local-chat-auto-archive"
            aria-label="Local chat auto-archive"
            aria-describedby="local-chat-auto-archive-help"
            value={preferences.local_auto_archive || 'never'}
            disabled={disabled}
            onChange={(event) => void savePreference({ local_auto_archive: event.target.value })}
          >
            <option value="never">Never</option>
            <option value="1d">After 1 day</option>
            <option value="7d">After 1 week</option>
            <option value="30d">After 1 month</option>
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <label htmlFor="cloud-chat-auto-archive">Cloud chat auto-archive</label>
            <p id="cloud-chat-auto-archive-help">Unavailable because cloud chat storage is not configured.</p>
          </div>
          <select id="cloud-chat-auto-archive" aria-label="Cloud chat auto-archive" aria-describedby="cloud-chat-auto-archive-help" value="unavailable" disabled>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <h3>Connections</h3>
        <SettingToggle
          id="phone-mirror"
          label="Mirror to my phone"
          description="Phone mirroring is unavailable because no phone-pairing service is configured."
          checked={false}
          disabled
          onChange={() => {}}
        />
        <SettingToggle
          id="discord-status"
          label="Show in Discord status"
          description="Discord status is unavailable because this build has no Discord connection."
          checked={false}
          disabled
          onChange={() => {}}
        />
      </div>

      {showFullAccessWarning && (
        <div className="modal-backdrop">
          <section className="modal settings-warning" role="dialog" aria-modal="true" aria-labelledby="full-access-warning-title" aria-describedby="full-access-warning-copy">
            <h2 id="full-access-warning-title">Full access warning</h2>
            <p id="full-access-warning-copy">This preference does not change approval behavior in this build. All agent actions still require your explicit approval. Saving it only records your choice for this workspace.</p>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" autoFocus disabled={disabled} onClick={() => setShowFullAccessWarning(false)}>Cancel</button>
              <button className="button button-warning" type="button" disabled={disabled} onClick={confirmFullAccess}>Save preference</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
