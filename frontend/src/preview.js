export function previewBaseFor(agent, origin = globalThis.location?.origin) {
  if (!agent || typeof agent.id !== 'string' || !agent.id || typeof agent.preview_url !== 'string' || !origin) return '';
  try {
    const url = new URL(agent.preview_url, origin);
    if (url.origin !== origin || url.search || url.hash || !url.pathname.endsWith('/')) return '';
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 4 || segments[0] !== 'preview' || segments[1] !== 'k' || !segments[2] || segments[3] !== agent.id) return '';
    return url.pathname;
  } catch {
    return '';
  }
}

export function normalizePreviewPath(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return 'index.html';
  if (raw.startsWith('/') || raw.startsWith('\\') || raw.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    throw new TypeError('Preview paths must be relative to the active preview.');
  }

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new TypeError('Preview path encoding is invalid.');
  }
  if (decoded.startsWith('/') || decoded.includes('\\')) throw new TypeError('Preview paths must be relative.');
  const segments = decoded.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':') || /[\u0000-\u001f\u007f]/.test(segment))) {
    throw new TypeError('Preview paths cannot escape the active preview.');
  }
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}


export function previewPathFromLocation(pathname, base) {
  if (typeof pathname !== 'string' || typeof base !== 'string' || !base.endsWith('/') || !pathname.startsWith(base)) return '';
  try {
    return normalizePreviewPath(pathname.slice(base.length));
  } catch {
    return '';
  }
}
