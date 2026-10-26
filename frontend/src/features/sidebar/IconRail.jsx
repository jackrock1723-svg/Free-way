// Freebuff-style far-left icon rail: primary pages as icons, Earn, collapse toggle, avatar at the bottom.
const extraIcons = {
  Earn: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S10 7 12 7zm0 0c1.5-3 5-3.5 5-1.5S14 7 12 7z',
  Panel: 'M4 4h16v16H4zM9 4v16',
};

function Glyph({ d }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

export default function IconRail({ sections, view, settingsSection, onGo, onEarn, onToggle, collapsed, onProfile, Icon }) {
  const earnCurrent = view === 'Settings' && settingsSection === 'Earn';
  return (
    <div className="fw-rail-wrap">
      <button type="button" className="fw-rail-btn fw-rail-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`} aria-expanded={!collapsed} onClick={onToggle}><Glyph d={extraIcons.Panel} /></button>
      <nav className="side-nav fw-rail" aria-label="Primary navigation">
        {sections.map((section) => {
          const current = view === section && !(section === 'Settings' && earnCurrent);
          return <button type="button" key={section} className={`nav-item fw-rail-btn${current ? ' is-current' : ''}`} aria-label={section} title={section} aria-current={current ? 'page' : undefined} onClick={() => onGo(section)}><Icon name={section} /><span className="fw-rail-label">{section}</span></button>;
        })}
        <button type="button" className={`nav-item fw-rail-btn fw-rail-extra${earnCurrent ? ' is-current' : ''}`} aria-label="Earn" title="Invite friends & earn" aria-current={earnCurrent ? 'page' : undefined} onClick={onEarn}><Glyph d={extraIcons.Earn} /><span className="fw-rail-label">Earn</span></button>
      </nav>
      <button type="button" className="profile-button fw-rail-avatar" aria-label="Profile" title="Profile" onClick={onProfile}>P</button>
    </div>
  );
}
