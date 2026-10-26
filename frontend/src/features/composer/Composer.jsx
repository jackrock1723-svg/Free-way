import { COMPOSER_MODES, composerPlaceholder } from './composerModel.js';

// Freebuff-style composer. Every control either does its real job or is disabled with a reason.
export default function Composer({ value, onChange, onSubmit, onStop, busy, stoppable, queued, mode, onMode, models, model, onModel, skills, skill, onSkill, skillsReason, location }) {
  const current = COMPOSER_MODES.find((item) => item.value === mode) || COMPOSER_MODES[0];
  const skillsOff = !skills.length;
  function keyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  return (
    <form className="composer" onSubmit={onSubmit} aria-label="Composer">
      <div className="composer-modes" role="radiogroup" aria-label="Run mode">
        {COMPOSER_MODES.map((item) => {
          const off = item.value === 'skills' && skillsOff;
          return <label key={item.value} className={`composer-mode${mode === item.value ? ' is-active' : ''}${off ? ' is-disabled' : ''}`} title={off ? (skillsReason || 'No local skills found') : item.help}>
            <input type="radio" name="composer-mode" value={item.value} checked={mode === item.value} disabled={off} onChange={() => onMode(item.value)} />{item.label}
          </label>;
        })}
      </div>
      <textarea id="build-prompt" aria-label="Build prompt" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={keyDown} placeholder={composerPlaceholder(busy)} rows="3" />
      <div className="composer-bar">
        <button type="button" className="composer-icon" aria-label="Attach file" title="Not available yet" disabled>+</button>
        {mode === 'skills' && !skillsOff && <select className="composer-select" aria-label="Skill" value={skill} onChange={(event) => onSkill(event.target.value)}>
          {skills.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>}
        <select className="composer-select" aria-label="Model" value={model} onChange={(event) => onModel(event.target.value)}>
          {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span className="composer-location" title={location.title} aria-label={`Runs on: ${location.label}`}>{location.label}</span>
        <span className="composer-spacer" />
        {queued > 0 && <span className="composer-queue" role="status">{queued} queued</span>}
        {busy && stoppable
          ? <button type="button" className="composer-send is-stop" aria-label="Stop" onClick={onStop}>■</button>
          : <button type="submit" className="composer-send" aria-label="Send">↑</button>}
      </div>
      <p className="composer-help subtle">{current.help}</p>
    </form>
  );
}
