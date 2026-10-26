import { COMPOSER_MODES, composerPlaceholder } from './composerModel.js';
import { modelOptionLabel } from '../chat/routeLabel.js';

// Freebuff-style composer. Every control either does its real job or is disabled with a reason.
export default function Composer({ value, onChange, onSubmit, onStop, busy, stoppable, queued, mode, onMode, models, model, onModel, skills, skill, onSkill, skillsReason, location }) {
  const current = COMPOSER_MODES.find((item) => item.value === mode) || COMPOSER_MODES[0];
  const skillsOff = !skills.length;
  function keyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  return (
    <form className="composer" onSubmit={onSubmit} aria-label="Composer">
      <textarea id="build-prompt" aria-label="Build prompt" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={keyDown} placeholder={composerPlaceholder(busy)} rows="3" />
      <div className="composer-bar">
        <select className="composer-select composer-mode-select" aria-label="Run mode" value={mode} title={current.help} onChange={(event) => onMode(event.target.value)}>
          {COMPOSER_MODES.map((item) => { const off = item.value === 'skills' && skillsOff; return <option key={item.value} value={item.value} disabled={off} title={off ? (skillsReason || 'No local skills found') : item.help}>{item.label}{off ? ' (none found)' : ''}</option>; })}
        </select>
        {mode === 'skills' && !skillsOff && <select className="composer-select" aria-label="Skill" value={skill} onChange={(event) => onSkill(event.target.value)}>
          {skills.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>}
        <select className="composer-select" aria-label="Model" value={model} onChange={(event) => onModel(event.target.value)}>
          {models.map((item) => <option key={item.id} value={item.id} disabled={item.available === false} title={item.available === false ? `Add a ${item.needs_key.join(' or ')} key in Settings > Model Providers` : item.tag}>{modelOptionLabel(item)}</option>)}
        </select>
        <span className="composer-location" title={location.title} aria-label={`Runs on: ${location.label}`}>{location.label}</span>
        <span className="composer-spacer" />
        <button type="button" className="composer-icon" aria-label="Attach file" title="Not available yet" disabled>+</button>
        {queued > 0 && <span className="composer-queue" role="status">{queued} queued</span>}
        {busy && stoppable
          ? <button type="button" className="composer-send is-stop" aria-label="Stop" onClick={onStop}>■</button>
          : <button type="submit" className="composer-send" aria-label="Send">↑</button>}
      </div>
    </form>
  );
}
