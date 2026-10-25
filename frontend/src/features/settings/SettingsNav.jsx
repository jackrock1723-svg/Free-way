import { useState } from 'react';

const SECTIONS = [
  'General',
  'Account',
  'Usage',
  'Billing',
  'Earn',
  'Ads & privacy',
  'Integrations',
  'Model Providers',
  'Developer API',
  'Skills',
  'Appearance',
  'Keyboard shortcuts',
  'Archived',
  'Browser',
  'MCP',
  'Updates',
  'Project settings',
];

export function SettingsNav({ activeSection, onSelectSection, projects = [], projectId, onSelectProject }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visibleSections = SECTIONS.filter((section) => section.toLowerCase().includes(query));

  return (
    <aside className="settings-nav-panel" aria-label="Settings navigation">
      <label className="settings-nav-search" htmlFor="settings-section-search">
        <span>Search settings</span>
        <input id="settings-section-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <nav className="settings-nav" aria-label="Settings sections">
        {visibleSections.length === 0
          ? <p className="settings-nav-empty" role="status">No settings sections match this search.</p>
          : visibleSections.map((section) => (
            <button
              className={`settings-nav-item ${activeSection === section ? 'is-current' : ''}`}
              type="button"
              aria-current={activeSection === section ? 'page' : undefined}
              onClick={() => onSelectSection(section)}
              key={section}
            >
              <span>{section}</span>
            </button>
          ))}
      </nav>
      {activeSection === 'Project settings' && projects.length > 0 && (
        <div className="settings-project-list" role="group" aria-label="Projects">
          <p className="settings-nav-label">Projects</p>
          {projects.map((project) => (
            <button
              className={`settings-project-item ${projectId === project.id ? 'is-current' : ''}`}
              type="button"
              aria-pressed={projectId === project.id}
              onClick={() => onSelectProject(project.id)}
              key={project.id}
            >
              <span>{project.name || project.id}</span>
              <small>{project.id}</small>
            </button>
          ))}
        </div>
      )}
      <p className="settings-nav-note">Only features supported by this build are listed.</p>
    </aside>
  );
}
