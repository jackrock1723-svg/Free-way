// One honest line under each reply: which model answered, how long it took, and whether it fell back.
const PROVIDERS = { nim: 'NVIDIA NIM', openrouter: 'OpenRouter', groq: 'Groq', mistral: 'Mistral', cloudflare: 'Cloudflare AI', github: 'GitHub Models' };

export function modelOptionLabel(model) {
  return model?.available === false ? `${model.name} \u2014 needs key` : (model?.name || '');
}

export function routeLabel(route, models = []) {
  if (!route || typeof route !== 'object') return null;
  if (route.provider === 'local') return { text: 'Instant reply (no model call)', fallback: false };
  if (route.provider === 'mock') return { text: 'Demo reply (no model call)', fallback: false };
  const secs = Number.isFinite(route.ms) ? Math.max(1, Math.round(route.ms / 1000)) : null;
  const via = PROVIDERS[route.provider] || route.provider || 'unknown provider';
  const name = route.name || route.model || 'unknown model';
  const time = secs ? `Worked for ${secs}s \u00b7 ` : '';
  if (route.fallback) {
    const asked = models.find((m) => m.id === route.requested)?.name || route.requested || 'The selected model';
    return { text: `${time}${asked} was unavailable \u2014 answered by ${name} via ${via}`, fallback: true };
  }
  return { text: `${time}${name} via ${via}`, fallback: false };
}
