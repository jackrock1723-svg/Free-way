export default function BillingSettings({ section = 'Billing' }) {
  const isDeveloperApi = section === 'Developer API';
  const title = isDeveloperApi ? 'Developer API' : 'Billing';

  return (
    <section className="settings-section" aria-labelledby="billing-settings-title">
      <div className="settings-section-heading">
        <h2 id="billing-settings-title">{title}</h2>
        <p>{isDeveloperApi ? 'API credit and top-up features are not connected in this build.' : 'This workspace has no billing account or payment service.'}</p>
      </div>
      <div className="settings-group">
        {isDeveloperApi ? (
          <>
            <h3>Developer API credits</h3>
            <p className="settings-help">Credits are unavailable because no Developer API billing service is configured.</p>
            <div className="settings-actions">
              <button className="button button-secondary" type="button" disabled>Add credits</button>
              <button className="button button-secondary" type="button" disabled>Automatic top-up unavailable</button>
            </div>
          </>
        ) : (
          <>
            <h3>Billing account</h3>
            <p className="settings-help">No billing service is configured for this workspace.</p>
            <div className="settings-actions">
              <button className="button button-secondary" type="button" disabled>Checkout unavailable</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
