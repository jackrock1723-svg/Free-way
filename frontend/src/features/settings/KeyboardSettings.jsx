import { useState } from 'react';

export const DEFAULT_SHORTCUTS = Object.freeze({
  toggle_sidebar: 'Ctrl+B',
  toggle_terminal: 'Ctrl+`',
  toggle_right_panel: 'Ctrl+Alt+B',
  search_chats: 'Ctrl+K',
  open_settings: 'Ctrl+,',
  open_project: 'Ctrl+O',
  new_chat: 'Ctrl+T',
  close_tab: 'Ctrl+W',
  next_tab: 'Ctrl+Tab',
  previous_tab: 'Ctrl+Shift+Tab',
  reopen_tab: 'Ctrl+Shift+T',
});

const ACTIONS = [
  { id: 'toggle_sidebar', label: 'Toggle left sidebar', reason: 'Unavailable: this browser reserves Ctrl+B for bookmarks.' },
  { id: 'toggle_terminal', label: 'Toggle bottom terminal', reason: 'Unavailable: this build has no in-app terminal.' },
  { id: 'toggle_right_panel', label: 'Toggle right panel', reason: 'Unavailable: this build has no right-side panel.' },
  { id: 'search_chats', label: 'Search chats', reason: 'Unavailable: chat search is not implemented and the browser may reserve Ctrl+K.' },
  { id: 'open_settings', label: 'Open settings', reason: 'Active in Free way. Browser-reserved chords are not used.' },
  { id: 'open_project', label: 'Open project', reason: 'Unavailable: Ctrl+O is reserved by the browser and no file picker is configured.' },
  { id: 'new_chat', label: 'New chat', reason: 'Unavailable: Ctrl+T is reserved by the browser for a new tab.' },
  { id: 'close_tab', label: 'Close tab', reason: 'Unavailable: Ctrl+W is reserved by the browser.' },
  { id: 'next_tab', label: 'Next tab', reason: 'Unavailable: tab switching is handled by the browser.' },
  { id: 'previous_tab', label: 'Previous tab', reason: 'Unavailable: tab switching is handled by the browser.' },
  { id: 'reopen_tab', label: 'Reopen closed tab', reason: 'Unavailable: Ctrl+Shift+T is reserved by the browser.' },
];

export function shortcutFromEvent(event) {
  if (!event || ['Alt', 'Control', 'Meta', 'Shift', 'Escape', 'Enter', 'Tab'].includes(event.key)) return '';
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (!modifiers.length) return '';
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join('+');
}

function canonical(chord) {
  return String(chord).split('+').map((part) => part.trim().toLowerCase()).join('+');
}

function errorMessage(error) {
  return error?.message && error.message !== 'network'
    ? error.message
    : 'Keyboard shortcuts could not be saved. Try again.';
}

export default function KeyboardSettings({ preferences = {}, onSave, disabled = false }) {
  const [shortcuts, setShortcuts] = useState(() => ({ ...DEFAULT_SHORTCUTS, ...(preferences.keyboard_shortcuts || {}) }));
  const [recordingId, setRecordingId] = useState('');
  const [status, setStatus] = useState('No unsaved changes.');
  const [error, setError] = useState('');

  async function save(next) {
    const previous = shortcuts;
    setShortcuts(next);
    setError('');
    setStatus('Saving…');
    try {
      await onSave({ keyboard_shortcuts: next });
      setStatus('Saved on this device.');
    } catch (requestError) {
      setShortcuts(previous);
      setStatus('');
      setError(errorMessage(requestError));
    }
  }

  function capture(event, action) {
    if (recordingId !== action.id) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setRecordingId('');
      setError('');
      return;
    }
    const chord = shortcutFromEvent(event);
    if (!chord) return;
    event.preventDefault();
    event.stopPropagation();

    const collision = Object.entries(shortcuts).find(([id, existing]) => id !== action.id && canonical(existing) === canonical(chord));
    if (collision) {
      const other = ACTIONS.find((item) => item.id === collision[0]);
      setError(`That shortcut is already assigned to ${other?.label || collision[0]}.`);
      return;
    }

    const next = { ...shortcuts, [action.id]: chord };
    setRecordingId('');
    void save(next);
  }

  function resetAll() {
    setRecordingId('');
    void save({ ...DEFAULT_SHORTCUTS });
  }

  return (
    <section className="settings-section" aria-labelledby="keyboard-settings-title">
      <div className="settings-section-heading">
        <h2 id="keyboard-settings-title">Keyboard shortcuts</h2>
        <p>Only Open settings is bound in this browser build. Other listed actions stay unbound when their feature is unavailable or the browser owns the chord.</p>
      </div>
      <p className="settings-save-status" data-testid="settings-save-status" role="status">{status}</p>
      {error && <p className="settings-inline-error" role="alert">{error}</p>}

      <div className="shortcut-table-wrap">
        <table className="shortcut-table">
          <thead><tr><th scope="col">Action</th><th scope="col">Shortcut</th><th scope="col">Availability</th></tr></thead>
          <tbody>
            {ACTIONS.map((action) => {
              const active = action.id === 'open_settings';
              return (
                <tr key={action.id}>
                  <th scope="row">{action.label}</th>
                  <td><kbd>{shortcuts[action.id]}</kbd></td>
                  <td>
                    <button
                      className="button button-secondary shortcut-change"
                      type="button"
                      aria-label={`Change shortcut for ${action.label}`}
                      disabled={disabled || !active}
                      onClick={() => { setError(''); setRecordingId(action.id); }}
                      onKeyDown={(event) => capture(event, action)}
                    >
                      {recordingId === action.id ? 'Press keys…' : 'Change shortcut'}
                    </button>
                    <span className={`shortcut-availability ${active ? 'is-active' : ''}`}>{active ? 'Active' : action.reason}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="settings-actions">
        <button className="button button-secondary" type="button" onClick={resetAll} disabled={disabled}>Reset all</button>
      </div>
    </section>
  );
}
