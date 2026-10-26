// Freebuff-style layout toggles at the top-left of the main area: sidebar, bottom terminal, split chat.
// A toggle is only shown when its handler is passed, so nothing appears that does not work.
const paths = {
  sidebar: 'M4 4h16v16H4zM9 4v16',
  terminal: 'M4 4h16v16H4zM4 15h16M7 18h3',
  split: 'M4 4h16v16H4zM12 4v16',
};

function Toggle({ icon, label, pressed, onClick, shortcut }) {
  return (
    <button type="button" className={`fw-top-toggle${pressed ? ' is-on' : ''}`} aria-label={label} aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={paths[icon]} /></svg>
    </button>
  );
}

export default function TopToggles({ sidebarOpen, onSidebar, sidebarShortcut, terminalOpen, onTerminal, terminalShortcut, splitOpen, onSplit }) {
  return (
    <div className="fw-top-toggles" role="group" aria-label="Layout">
      {onSidebar && <Toggle icon="sidebar" label="Show sidebar" pressed={Boolean(sidebarOpen)} onClick={onSidebar} shortcut={sidebarShortcut} />}
      {onTerminal && <Toggle icon="terminal" label="Show terminal" pressed={Boolean(terminalOpen)} onClick={onTerminal} shortcut={terminalShortcut} />}
      {onSplit && <Toggle icon="split" label="Split chat" pressed={Boolean(splitOpen)} onClick={onSplit} />}
    </div>
  );
}
