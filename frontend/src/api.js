export class ApiError extends Error {
  constructor(message, status = 0, final = false, detail = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.final = final;
    this.detail = detail || message;
  }
}

export const FRIENDLY_SERVER_ERROR = 'Something went wrong on our side. Please try again in a moment.';
export const FRIENDLY_RATE_LIMIT = 'You are going a little fast. Please wait a moment and try again.';
export const FRIENDLY_NETWORK_ERROR = 'Free way could not be reached. Check your connection and try again.';

// Users see friendly text; the raw server text stays on error.detail (and the server logs it for the admin).
// Messages the server writes for people (4xx and 503 "unavailable" notes) are kept as they are.
export function friendlyError(status, serverMessage) {
  if (status === 429) return FRIENDLY_RATE_LIMIT;
  if (status >= 500 && status !== 503) return FRIENDLY_SERVER_ERROR;
  if (serverMessage) return serverMessage;
  return status >= 500 ? FRIENDLY_SERVER_ERROR : `The request could not be completed (HTTP ${status}).`;
}

function savedToken() {
  try {
    return globalThis.localStorage?.getItem('fc.token') || '';
  } catch {
    return '';
  }
}

export async function restoreLegacyUrlToken() {
  const browser = globalThis.window;
  const auth = browser?.GoogleSignIn;
  if (!auth?.ready) return false;

  try {
    await auth.ready;
  } catch {
    return false;
  }
  if (auth.mode !== 'disabled') return false;

  let url;
  try {
    url = new URL(browser.location.href);
  } catch {
    return false;
  }
  const token = url.searchParams.get('token');
  if (!token) return false;

  let stored = false;
  try {
    const storage = globalThis.localStorage;
    if (storage) {
      storage.setItem('fc.token', token);
      stored = true;
    }
  } catch {
    // Still remove the token from browser history if persistence is unavailable.
  }
  try {
    url.searchParams.delete('token');
    browser.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    return false;
  }
  return stored;
}

async function request(path, { method, body, signal, headers: extraHeaders } = {}) {
  const verb = method || (body ? 'POST' : 'GET');
  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
  const token = savedToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const auth = globalThis.window?.GoogleSignIn;
  let response;
  try {
    const prepared = auth
      ? await auth.prepare(path, verb, headers)
      : { headers };
    response = await fetch(path, {
      method: verb,
      headers: prepared.headers,
      credentials: prepared.credentials,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('network', 0, false);
  }

  if (response.status === 401 && auth?.enabled) auth.handleUnauthorized();
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = typeof data.error === 'string' ? data.error : '';
    throw new ApiError(friendlyError(response.status, raw), response.status, Boolean(raw), raw || `HTTP ${response.status}`);
  }
  return data;
}

async function streamChat(body, { onDelta, onComplete, onError, signal } = {}) {
  const fallback = async () => {
    const result = await request('/api/chat', { method: 'POST', body, signal });
    onComplete?.(result);
    return result;
  };
  let receivedDelta = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    const headers = { 'Content-Type': 'application/json' };
    const token = savedToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const auth = globalThis.window?.GoogleSignIn;

    try {
      const prepared = auth
        ? await auth.prepare('/api/chat/stream', 'POST', headers)
        : { headers, credentials: 'same-origin' };
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: prepared.headers,
        credentials: prepared.credentials || 'same-origin',
        body: JSON.stringify(body),
        signal,
      });
      if (response.status === 401 && auth?.enabled) auth.handleUnauthorized();
      if ([404, 405, 406, 415, 501].includes(response.status) && !receivedDelta) return fallback();
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(data.error || `HTTP ${response.status}`, response.status, Boolean(data.error));
      }
      const contentType = response.headers?.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/event-stream') || !response.body) {
        if (!receivedDelta) return fallback();
        throw new ApiError('Chat stream ended before completion.', 0, false);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      const dispatch = (block) => {
        let event = 'message';
        const dataLines = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) return null;
        let payload;
        try { payload = JSON.parse(dataLines.join('\n')); }
        catch { throw new ApiError('Invalid chat stream response.', 0, true); }
        if (event === 'delta') {
          if (typeof payload.text === 'string') {
            receivedDelta = true;
            onDelta?.(payload.text);
          }
        } else if (event === 'done') {
          completed = true;
          onComplete?.(payload);
          return payload;
        } else if (event === 'error') {
          throw new ApiError(payload.error || 'Chat stream failed.', 500, true);
        }
        return null;
      };

      try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        buffer = buffer.replace(/\r\n/g, '\n');
        let separator = buffer.indexOf('\n\n');
        while (separator !== -1) {
          const result = dispatch(buffer.slice(0, separator));
          if (result) return result;
          buffer = buffer.slice(separator + 2);
          separator = buffer.indexOf('\n\n');
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const result = dispatch(buffer);
        if (result) return result;
      }
      if (!completed) throw new ApiError('Chat stream ended before completion.', 0, false);
      return null;
      } finally {
        try { await reader.cancel(); } catch {}
        try { reader.releaseLock(); } catch {}
      }
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') {
        onError?.(error);
        throw error;
      }
      const canReconnect = attempt === 0 && !receivedDelta && !(error instanceof ApiError && error.status > 0);
      if (canReconnect) continue;
      onError?.(error);
      throw error;
    }
  }
  throw new ApiError('Chat connection failed.', 0, false);
}

async function createOrchestration(body) {
  return request('/api/orchestrations', { method: 'POST', body });
}

async function cancelOrchestration(id) {
  return request(`/api/orchestrations/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
}

export const api = Object.freeze({ request, streamChat, createOrchestration, cancelOrchestration });

export function userMessage(error) {
  if (!error) return FRIENDLY_SERVER_ERROR;
  if (error.name === 'AbortError') return 'The request was cancelled.';
  if (error instanceof ApiError) return error.status === 0 ? FRIENDLY_NETWORK_ERROR : error.message;
  return FRIENDLY_SERVER_ERROR;
}
