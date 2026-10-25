import { useEffect, useState } from 'react';
import { settingsApi } from './settingsApi.js';

function messageFor(error) {
  return error?.message && error.message !== 'network' ? error.message : 'The local skills list could not be loaded.';
}

export default function SkillsSettings() {
  const [search, setSearch] = useState('');
  const [skills, setSkills] = useState([]);
  const [sourceAvailable, setSourceAvailable] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    settingsApi.readSkills(search)
      .then((result) => {
        if (!current) return;
        setSourceAvailable(result?.available === true);
        setSkills(Array.isArray(result?.skills) ? result.skills : []);
      })
      .catch((requestError) => {
        if (!current) return;
        setSkills([]);
        setError(messageFor(requestError));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [search]);

  async function inspect(skill) {
    setSelectedSkill(skill);
    setDetailError('');
    setDetailLoading(true);
    try {
      const result = await settingsApi.readSkill(skill.id);
      setSelectedSkill(result?.skill || skill);
    } catch (requestError) {
      setDetailError(requestError?.message || 'The skill instructions could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  }

  if (selectedSkill) {
    return (
      <section className="settings-section" aria-labelledby="skills-detail-title">
        <div className="settings-section-heading">
          <h2 id="skills-detail-title">{selectedSkill.name} instructions</h2>
          <p>Local instructions are displayed as text and are not executed here.</p>
        </div>
        <div className="settings-actions">
          <button className="button button-secondary" type="button" onClick={() => setSelectedSkill(null)}>Back to skills</button>
        </div>
        {detailError && <p className="settings-inline-error" role="alert">{detailError}</p>}
        {detailLoading
          ? <p className="settings-save-status" role="status">Loading instructions…</p>
          : <pre className="settings-code-text">{selectedSkill.instructions || ''}</pre>}
      </section>
    );
  }

  return (
    <section className="settings-section" aria-labelledby="skills-title">
      <div className="settings-section-heading">
        <h2 id="skills-title">Skills</h2>
        <p>Search and inspect skills stored in this app’s local data folder.</p>
      </div>
      <label className="settings-search-field" htmlFor="local-skills-search">
        <span>Search local skills</span>
        <input id="local-skills-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {error && <p className="settings-inline-error" role="alert">{error}</p>}
      {loading && <p className="settings-save-status" role="status">Loading local skills…</p>}
      {!loading && !error && !sourceAvailable && <p className="settings-metadata-empty">No local skills source is configured.</p>}
      {!loading && !error && sourceAvailable && skills.length === 0 && <p className="settings-metadata-empty">No local skills match this search.</p>}
      {!loading && !error && skills.length > 0 && <div className="settings-metadata-list" aria-label="Local skills">
        {skills.map((skill) => <article className="settings-metadata-item" key={skill.id}>
          <div>
            <h3>{skill.name}</h3>
            <p>{skill.description}</p>
          </div>
          <button className="button button-secondary" type="button" aria-label={`Review instructions for ${skill.name}`} onClick={() => inspect(skill)}>Review instructions</button>
        </article>)}
      </div>}
      <div className="settings-group">
        <h3>Remote skills</h3>
        <p className="settings-help">Remote sources and permission checks are not configured in this build.</p>
        <div className="settings-actions">
          <button className="button button-secondary" type="button" disabled title="Remote skill provenance and permission support are not available.">Add remote skill</button>
        </div>
      </div>
    </section>
  );
}
