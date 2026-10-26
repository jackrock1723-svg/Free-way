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
    void savePreference({ [key]: value });
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
            <p className="settings-help">Used by the Build button. Default: all specialists, balanced. Lite: fewer specialists, faster. Max: three competing editors, slower. Plan: plans only, never writes files.</p>
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


    </section>
  );
}
