// Step 6: Freebuff-style progress and scope questions. Pure helpers, no network.

// Specialist roles -> the step label Freebuff shows. Only specialists that actually ran (not "pending") become rows.
const STEP_LABELS = {
  discover: 'Read files', file_picker: 'Read files', code_searcher: 'Searched code', researcher: 'Researched',
  thinker: 'Thought', plan: 'Planned', planner: 'Planned', implement: 'Proposed edits', editor: 'Proposed edits',
  verify: 'Checked the plan', reviewer: 'Reviewed', basher: 'Proposed a command',
};

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

export function progressSteps(children) {
  return (Array.isArray(children) ? children : [])
    .filter((child) => child && child.status && child.status !== 'pending')
    .map((child) => ({
      role: child.role,
      label: STEP_LABELS[child.role] || String(child.role || 'Step').replace(/_/g, ' '),
      status: child.status,
      summary: child.result?.summary || '',
      details: [...(child.result?.findings || []), ...(child.error ? [child.error] : [])].map(String),
    }));
}

// Start = agent created; end = last logged event once the run is no longer working. Both are real timestamps.
export function workTimes(agent, now = Date.now() / 1000) {
  const start = Number(agent?.created) || now;
  const working = agent?.state === 'orchestrating';
  const log = Array.isArray(agent?.log) ? agent.log : [];
  const last = log.length ? Number(log[log.length - 1].t) || start : start;
  return { working, seconds: Math.max(0, (working ? now : last) - start) };
}

const LARGE = /\b(full[ -]?stack|website|web ?site|web ?app|webapp|application|platform|dashboard|e-?commerce|online store|shop|saas|portal|clone|from scratch|entire|complete|whole|multi[- ]page|social network|marketplace|crm|booking system|management system)\b/i;
const STACK = /\b(html|css|javascript|react|vue|svelte|angular|next\.?js|vite|flask|fastapi|django|node|express|php|laravel|python|typescript)\b/i;
const PAGES = /\b(pages?|screens?|sections?)\b\s*[:(]|\bhome\b.*\b(about|contact|login)\b/i;

const Q_PLACE = { id: 'place', label: 'Where should it live?', options: [
  { title: 'In this project', description: 'Add the files to the project that is open now.', recommended: true },
  { title: 'In a new folder', description: 'Keep it in its own folder inside this project.' },
  { title: 'Replace what is there', description: 'Rework the existing files instead of adding new ones.' },
] };
const Q_STACK = { id: 'stack', label: 'Which stack should it use?', options: [
  { title: 'Plain HTML, CSS and JavaScript', description: 'Simplest to run and preview. No build step.', recommended: true },
  { title: 'React with Vite', description: 'Components and a dev server; needs npm.' },
  { title: 'Python backend with a simple frontend', description: 'Flask or FastAPI serving the pages and an API.' },
] };
const Q_PAGES = { id: 'pages', label: 'Which pages first?', options: [
  { title: 'Home plus one core page', description: 'Small first version you can review quickly.', recommended: true },
  { title: 'Home, About and Contact', description: 'A standard small site.' },
  { title: 'Full set', description: 'Home, list, detail and account pages.' },
] };

// Up to 3 deterministic scope questions, only for large or vague build requests, skipping what the prompt already says.
export function scopeQuestions(prompt) {
  const text = String(prompt || '');
  if (!LARGE.test(text)) return [];
  return [Q_PLACE, ...(STACK.test(text) ? [] : [Q_STACK]), ...(PAGES.test(text) ? [] : [Q_PAGES])];
}

// answers[i]: { choice: option index } | { custom: 'text' } | null (skipped). Skipped questions add nothing.
export function mergeAnswers(prompt, questions, answers) {
  const lines = (questions || []).map((q, i) => {
    const a = answers?.[i];
    const value = a?.custom?.trim() ? a.custom.trim() : Number.isInteger(a?.choice) ? q.options[a.choice]?.title : '';
    return value ? `- ${q.label} ${value}` : '';
  }).filter(Boolean);
  return lines.length ? `${prompt}\n\nScope answers:\n${lines.join('\n')}` : prompt;
}