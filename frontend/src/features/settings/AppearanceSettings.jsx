import { useState } from 'react';

const THEMES = [
  { id: 'auto', name: 'Auto', scheme: 'dark', swatch: '#2fd46b' },
  { id: 'dark', name: 'Dark', scheme: 'dark', swatch: '#a5a5b5' },
  { id: 'light', name: 'Light', scheme: 'light', swatch: '#15803d' },
  { id: 'og-shine', name: 'OG Shine', scheme: 'dark', swatch: '#a296ff' },
  { id: 'alpine', name: 'Alpine', scheme: 'dark', swatch: '#8be0b7' },
  { id: 'dune', name: 'Dune', scheme: 'dark', swatch: '#ffd08a' },
  { id: 'tide', name: 'Tide', scheme: 'dark', swatch: '#7edbed' },
  { id: 'blossom', name: 'Blossom', scheme: 'dark', swatch: '#f0acd0' },
  { id: 'orbit', name: 'Orbit', scheme: 'dark', swatch: '#9fb2ff' },
  { id: 'after-rain', name: 'After rain', scheme: 'dark', swatch: '#9ad9c4' },
  { id: 'ember', name: 'Ember', scheme: 'dark', swatch: '#ff9a72' },
  { id: 'kanagawa', name: 'Kanagawa', scheme: 'dark', swatch: '#e8c98a' },
  { id: 'aurora', name: 'Aurora', scheme: 'dark', swatch: '#8fe2d1' },
  { id: 'violet-hour', name: 'Violet hour', scheme: 'dark', swatch: '#c3a4ff' },
  { id: 'phosphor', name: 'Phosphor', scheme: 'dark', swatch: '#b0e881' },
  { id: 'mirage', name: 'Mirage', scheme: 'dark', swatch: '#f0a8b5' },
  { id: 'nebula', name: 'Nebula', scheme: 'dark', swatch: '#b9a9ff' },
  { id: 'frost', name: 'Frost', scheme: 'light', swatch: '#3c83aa' },
  { id: 'paper', name: 'Paper', scheme: 'light', swatch: '#5b4c9d' },
  { id: 'carbon', name: 'Carbon', scheme: 'dark', swatch: '#c0ccd2' },
];

const STYLES = [
  { id: 'flat', name: 'Flat', description: 'Crisp surfaces with minimal depth.' },
  { id: '3d', name: '3D', description: 'Layered surfaces with a stronger edge.' },
  { id: 'shine', name: 'Shine', description: 'A brighter edge and a softer highlight.' },
];

function errorMessage(error) {
  return error?.message && error.message !== 'network'
    ? error.message
    : 'Appearance could not be saved. Try again.';
}

export default function AppearanceSettings({ preferences = {}, onSave, disabled = false }) {
  const [filter, setFilter] = useState('All');
  const [status, setStatus] = useState('No unsaved changes.');
  const [error, setError] = useState('');

  async function savePreference(patch) {
    setError('');
    setStatus('Saving…');
    try {
      await onSave(patch);
      setStatus('Saved on this device.');
    } catch (requestError) {
      setStatus('');
      setError(errorMessage(requestError));
    }
  }

  const currentStyle = preferences.appearance_style || 'flat';
  const currentTheme = preferences.appearance_preset || 'auto';
  const visibleThemes = THEMES.filter((theme) => filter === 'All' || theme.scheme === filter.toLowerCase());

  return (
    <section className="settings-section" aria-labelledby="appearance-settings-title">
      <div className="settings-section-heading">
        <h2 id="appearance-settings-title">Appearance</h2>
        <p>Styles and color presets change the workspace immediately and are saved on this device.</p>
      </div>
      <p className="settings-save-status" data-testid="settings-save-status" role="status">{status}</p>
      {error && <p className="settings-inline-error" role="alert">{error}</p>}

      <div className="settings-group">
        <h3>Style</h3>
        <div className="settings-choice-row" role="group" aria-label="Appearance style">
          {STYLES.map((style) => (
            <button
              className={`settings-choice ${currentStyle === style.id ? 'is-selected' : ''}`}
              type="button"
              aria-label={style.name}
              aria-describedby={`appearance-style-${style.id}-description`}
              aria-pressed={currentStyle === style.id}
              disabled={disabled}
              onClick={() => void savePreference({ appearance_style: style.id })}
              key={style.id}
            >
              <span>{style.name}</span>
              <small id={`appearance-style-${style.id}-description`}>{style.description}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-heading">
          <div>
            <h3>Color preset</h3>
            <p>Pick a real palette; the filter only narrows the list.</p>
          </div>
          <div className="settings-filter" role="group" aria-label="Theme filter">
            {['All', 'Dark', 'Light'].map((item) => (
              <button type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} key={item}>{item}</button>
            ))}
          </div>
        </div>
        <div className="theme-grid" role="group" aria-label="Color presets">
          {visibleThemes.map((theme) => (
            <button
              className={`theme-choice ${currentTheme === theme.id ? 'is-selected' : ''}`}
              type="button"
              aria-pressed={currentTheme === theme.id}
              disabled={disabled}
              onClick={() => void savePreference({ appearance_preset: theme.id })}
              key={theme.id}
            >
              <span className="theme-swatch" style={{ backgroundColor: theme.swatch }} aria-hidden="true" />
              <span>{theme.name}</span>
            </button>
          ))}
        </div>
        <p className="settings-help">Gradients are unavailable in this build because no gradient assets are configured.</p>
      </div>
    </section>
  );
}
