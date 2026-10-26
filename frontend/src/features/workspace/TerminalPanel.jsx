// Bottom terminal panel. Real only on a local Free way server: commands run in the chosen project's folder
// through the same safety check as approved agent commands. Hosted Free way says plainly that it is unavailable.
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

export default function TerminalPanel({ project, onClose }) {
  const [state, setState] = useState(null);
  const [command, setCommand] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    let live = true;
    api.request('/api/terminal')
      .then((result) => { if (live) setState(result); })
      .catch(() => { if (live) setState({ available: false, reason: 'The terminal could not be reached on this server.' }); });
    return () => { live = false; };
  }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [log]);

  async function run(event) {
    event.preventDefault();
    const text = command.trim();
    if (!text || busy) return;
    setBusy(true); setCommand('');
    try {
      const result = await api.request('/api/terminal', { method: 'POST', body: { project, command: text } });
      setLog((items) => [...items, { command: text, output: result.output || '', code: result.exit_code }]);
    } catch (error) {
      setLog((items) => [...items, { command: text, output: error?.message || 'The command could not run.', code: null, blocked: true }]);
    } finally { setBusy(false); }
  }

  let body;
  if (!state) body = <p className="fw-term-note" role="status">Checking the terminal.</p>;
  else if (!state.available) body = <p className="fw-term-note" role="status">{state.reason}</p>;
  else if (!project) body = <p className="fw-term-note" role="status">Choose a project to run commands in its folder.</p>;
  else body = <>
    <div className="fw-term-log" role="log" aria-label="Terminal output">
      {log.length === 0 && <p className="fw-term-note">Runs in {project}. Pipes, redirects and risky commands are blocked.</p>}
      {log.map((item, index) => <div className="fw-term-entry" key={index}>
        <div className="fw-term-cmd">$ {item.command}</div>
        {item.output && <pre className={item.blocked ? 'is-error' : undefined}>{item.output}</pre>}
        {item.code !== null && item.code !== undefined && item.code !== 0 && <div className="fw-term-exit">exit code {item.code}</div>}
      </div>)}
      <div ref={end} />
    </div>
    <form className="fw-term-input" onSubmit={run}>
      <span aria-hidden="true">$</span>
      <input aria-label="Terminal command" value={command} onChange={(event) => setCommand(event.target.value)} disabled={busy}
        placeholder={busy ? 'Running.' : 'Type a command, for example node --version'} autoComplete="off" spellCheck={false} />
    </form>
  </>;

  return (
    <section className="fw-terminal" aria-label="Terminal">
      <header className="fw-term-head">
        <span>Terminal</span>
        {state?.available && project && <span className="fw-term-project">{project}</span>}
        <button type="button" className="fw-top-toggle" aria-label="Close terminal" title="Close terminal" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      {body}
    </section>
  );
}
