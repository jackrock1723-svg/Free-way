import { Component } from 'react';

function report(error, info) {
  try {
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        message: `UI crash: ${String(error?.message || error || 'unknown error').slice(0, 300)}${info?.componentStack ? ` | ${info.componentStack.trim().split('\n')[0].trim().slice(0, 150)}` : ''}`,
        path: window.location.pathname + window.location.hash,
      }),
    }).catch(() => {});
  } catch { /* reporting must never throw */ }
}

// Friendly crash screen with retry. Real details go to the admin error log, never to the user.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    report(error, info);
  }

  retry() {
    this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className={`error-screen ${this.props.compact ? 'is-compact' : ''}`} role="alert" aria-labelledby="error-screen-title">
        <h2 id="error-screen-title">Something went wrong</h2>
        <p>Free way hit a problem showing this {this.props.compact ? 'page' : 'screen'}. Your projects and chats are safe, and the problem was reported so it can be fixed.</p>
        <div className="error-screen-actions">
          <button type="button" className="button button-primary" onClick={this.retry}>Try again</button>
          <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>Reload Free way</button>
        </div>
      </section>
    );
  }
}

// Test hook: lets the Playwright suite prove the boundary works. Only active when a test sets this session flag.
export function CrashProbe() {
  let armed = false;
  try { armed = window.sessionStorage.getItem('fw.crashTest') === '1'; } catch { armed = false; }
  if (armed) throw new Error('Crash probe (test only)');
  return null;
}
