export default function EarnSettings() {
  return (
    <section className="settings-section" aria-labelledby="earn-settings-title">
      <div className="settings-section-heading">
        <h2 id="earn-settings-title">Earn</h2>
        <p>No funded publisher or rewards backend is configured for this workspace.</p>
      </div>
      <div className="settings-group">
        <h3>Rewards are unavailable</h3>
        <p className="settings-help">There are no verified payouts, referrals, contributions or reward balances to show.</p>
        <div className="settings-actions">
          <button className="button button-secondary" type="button" disabled>Referrals unavailable</button>
          <button className="button button-secondary" type="button" disabled>Contributions unavailable</button>
          <button className="button button-secondary" type="button" disabled>Cash out unavailable</button>
        </div>
      </div>
    </section>
  );
}
