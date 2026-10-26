// Free models shown in the composer picker. Taken from /api/models (free tier only). The two "Optional · OpenRouter free"
// models are left out: they have no fallback and fail unless the user added an OpenRouter key.
export const COMPOSER_MODEL_IDS = ['auto', 'forge', 'flux', 'atlas', 'craft', 'spark', 'lite'];

export const COMPOSER_MODES = [
  { value: 'build', label: 'Build', help: 'Specialists propose changes; nothing is applied until you approve.' },
  { value: 'plan', label: 'Plan', help: 'Plan only. No files are written.' },
  { value: 'mission', label: 'Mission', help: 'Milestones with an approval at each step.' },
  { value: 'skills', label: 'Skills', help: 'Answer using one of your local skills.' },
];

export function pickFreeModels(list) {
  const rows = Array.isArray(list) ? list : [];
  return COMPOSER_MODEL_IDS.map((id) => rows.find((row) => row?.id === id && row.free === true && row.tier === 'free')).filter(Boolean);
}

export function composerPlaceholder(busy) {
  return busy ? 'Type a message — added to the queue' : 'Type a message — / for commands, @ for threads or files';
}

export function adDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
