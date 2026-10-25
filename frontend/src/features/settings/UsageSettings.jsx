import { useEffect, useState } from 'react';
import { settingsApi } from './settingsApi.js';

const PERIODS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All retained history' },
];
const METRICS = [
  ['requests', 'Requests'],
  ['input_tokens', 'Input tokens'],
  ['output_tokens', 'Output tokens'],
  ['total_tokens', 'Total tokens'],
];

function metricText(value) {
  return Number.isSafeInteger(value) && value >= 0 ? new Intl.NumberFormat().format(value) : 'Unavailable';
}

function messageFor(error) {
  return error?.message && error.message !== 'network'
    ? error.message
    : 'Usage could not be read from this workspace.';
}

export default function UsageSettings() {
  const [period, setPeriod] = useState('7d');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    settingsApi.readUsage(period)
      .then((value) => {
        if (!cancelled) setReport(value);
      })
      .catch((requestError) => {
        if (!cancelled) { setReport(null); setError(messageFor(requestError)); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  return (
    <section className="settings-section" aria-labelledby="usage-settings-title">
      <div className="settings-section-heading">
        <h2 id="usage-settings-title">Usage</h2>
        <p>Counts appear only when a model provider reports them. This page does not estimate token usage.</p>
      </div>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-copy">
            <label htmlFor="usage-period">Usage period</label>
            <p id="usage-period-help">A period is filterable only when recorded events include their upstream time.</p>
          </div>
          <select id="usage-period" aria-label="Usage period" aria-describedby="usage-period-help" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {loading && <p className="settings-save-status" role="status">Loading usage…</p>}
        {error && <p className="settings-inline-error" role="alert">{error}</p>}
        {report && !loading && (
          <>
            <dl className="usage-metrics">
              {METRICS.map(([key, label]) => (
                <div className="usage-metric" key={key}>
                  <dt>{label}</dt>
                  <dd>{metricText(report[key])}</dd>
                </div>
              ))}
            </dl>
            {report.reason && <p className="settings-help" role="status">{report.reason}</p>}
            <p className="settings-help">History keeps up to the latest {metricText(report.history_limit)} upstream records; totals include only records retained here.</p>
            <p className="settings-help">Cost and credit balances are unavailable because no billing backend is configured.</p>
          </>
        )}
      </div>
    </section>
  );
}
