import { useEffect, useState } from 'react';
import { formatDuration, progressSteps, workTimes } from './progressModel.js';

// Bordered "Working for Ns" box. Rows come only from specialists that really ran; each expands to its real output.
export default function ProgressBox({ agent }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  const { working, seconds } = workTimes(agent, now);
  useEffect(() => {
    if (!working) return undefined;
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, [working]);
  const steps = progressSteps(agent?.orchestration?.children);
  return (
    <section className="progress-box" aria-label="Agent progress">
      <p className="progress-head" role="timer">{working ? 'Working for ' : 'Worked for '}{formatDuration(seconds)}</p>
      {steps.length === 0 && working && <p className="progress-line">Starting…</p>}
      {steps.map((step) => (
        <div key={step.role} className="progress-step-wrap">
          {step.summary && <p className="progress-line">{step.summary}</p>}
          <details className={`progress-step progress-${step.status}`}>
            <summary><span className="progress-chevron" aria-hidden="true">›</span>{step.label}{step.status === 'running' ? '…' : step.status === 'failed' ? ' (failed)' : step.status === 'cancelled' ? ' (cancelled)' : ''}</summary>
            {step.details.length ? <ul>{step.details.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="subtle">No further details from this step.</p>}
          </details>
        </div>
      ))}
    </section>
  );
}