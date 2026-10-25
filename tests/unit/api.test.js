import assert from 'node:assert/strict';
import test from 'node:test';

async function loadApi() {
  try {
    return await import('../../frontend/src/api.js');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function requireApi() {
  const module = await loadApi();
  assert.ok(module?.api?.request, 'frontend api.request should be available');
  return module;
}

async function withBrowser(windowValue, fetchValue, run) {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const hadLocalStorage = Object.hasOwn(globalThis, 'localStorage');
  const previousLocalStorage = globalThis.localStorage;
  globalThis.window = windowValue;
  globalThis.localStorage = windowValue.localStorage;
  globalThis.fetch = fetchValue;
  try {
    return await run();
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
    if (hadLocalStorage) globalThis.localStorage = previousLocalStorage;
    else delete globalThis.localStorage;
    globalThis.fetch = previousFetch;
  }
}

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}

test('api.request preserves bearer, CSRF, credentials, JSON body, and abort signal', async () => {
  const { api } = await requireApi();
  let prepared;
  let sent;
  const controller = new AbortController();
  const auth = {
    enabled: true,
    prepare(path, method, headers) {
      prepared = { path, method, headers: { ...headers } };
      return Promise.resolve({
        headers: { ...headers, 'X-FC-CSRF': 'csrf-test-value' },
        credentials: 'same-origin',
      });
    },
    handleUnauthorized() {},
  };

  const result = await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => 'saved-token-value' } },
    async (path, options) => {
      sent = { path, options };
      return jsonResponse(200, { id: 'demo' });
    },
    () => api.request('/api/projects', {
      method: 'POST',
      body: { id: 'demo' },
      signal: controller.signal,
    }),
  );

  assert.deepEqual(result, { id: 'demo' });
  assert.equal(prepared.path, '/api/projects');
  assert.equal(prepared.method, 'POST');
  assert.equal(prepared.headers.Authorization, 'Bearer saved-token-value');
  assert.equal(sent.path, '/api/projects');
  assert.equal(sent.options.headers.Authorization, 'Bearer saved-token-value');
  assert.equal(sent.options.headers['X-FC-CSRF'], 'csrf-test-value');
  assert.equal(sent.options.credentials, 'same-origin');
  assert.equal(sent.options.body, JSON.stringify({ id: 'demo' }));
  assert.equal(sent.options.signal, controller.signal);
});

test('api.request exposes typed HTTP errors without losing server text', async () => {
  const { api, ApiError } = await requireApi();
  const auth = {
    enabled: false,
    prepare: async (_path, _method, headers) => ({ headers, credentials: 'same-origin' }),
    handleUnauthorized() {},
  };

  await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => null } },
    async () => jsonResponse(503, { error: 'Project service unavailable.' }),
    async () => {
      await assert.rejects(api.request('/api/projects'), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.name, 'ApiError');
        assert.equal(error.message, 'Project service unavailable.');
        assert.equal(error.status, 503);
        assert.equal(error.final, true);
        return true;
      });
    },
  );
});

test('api.request delegates 401 handling to the configured sign-in client', async () => {
  const { api, ApiError } = await requireApi();
  let handled = 0;
  const auth = {
    enabled: true,
    prepare: async (_path, _method, headers) => ({ headers, credentials: 'same-origin' }),
    handleUnauthorized() { handled += 1; },
  };

  await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => null } },
    async () => jsonResponse(401, { error: 'Authentication request rejected' }),
    async () => {
      await assert.rejects(api.request('/api/private'), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 401);
        return true;
      });
    },
  );
  assert.equal(handled, 1);
});


test('restoreLegacyUrlToken waits for disabled auth and removes the token while preserving other URL state', async () => {
  const { restoreLegacyUrlToken } = await requireApi();
  assert.equal(typeof restoreLegacyUrlToken, 'function');

  let storedToken = null;
  let replacement;
  let resolveAuth;
  const ready = new Promise((resolve) => { resolveAuth = resolve; });
  const auth = { mode: 'pending', ready };
  const localStorage = {
    getItem: () => storedToken,
    setItem(key, value) {
      assert.equal(key, 'fc.token');
      storedToken = value;
    },
  };
  const browser = {
    GoogleSignIn: auth,
    localStorage,
    location: { href: 'http://localhost/?token=legacy-test-token&tab=home#chat' },
    history: { replaceState(_state, _title, url) { replacement = url; } },
  };

  const migrated = await withBrowser(browser, globalThis.fetch, async () => {
    const pending = restoreLegacyUrlToken();
    await Promise.resolve();
    assert.equal(storedToken, null, 'token must wait until auth mode is known');
    auth.mode = 'disabled';
    resolveAuth();
    return pending;
  });

  assert.equal(migrated, true);
  assert.equal(storedToken, 'legacy-test-token');
  assert.equal(replacement, '/?tab=home#chat');
});

test('restoreLegacyUrlToken does not store a bearer token when auth is enabled or unknown', async () => {
  const { restoreLegacyUrlToken } = await requireApi();
  assert.equal(typeof restoreLegacyUrlToken, 'function');

  for (const mode of ['enabled', 'unknown']) {
    let storedToken = null;
    let replacement;
    const browser = {
      GoogleSignIn: { mode, ready: Promise.resolve() },
      localStorage: {
        getItem: () => storedToken,
        setItem(_key, value) { storedToken = value; },
      },
      location: { href: 'http://localhost/?token=legacy-test-token' },
      history: { replaceState(_state, _title, url) { replacement = url; } },
    };

    const migrated = await withBrowser(browser, globalThis.fetch, () => restoreLegacyUrlToken());
    assert.equal(migrated, false, `mode ${mode} must not migrate token links`);
    assert.equal(storedToken, null, `mode ${mode} must not store bearer tokens`);
    assert.equal(replacement, undefined, `mode ${mode} must not rewrite the URL`);
  }
});


test('restoreLegacyUrlToken strips the token from the URL when storage rejects the write', async () => {
  const { restoreLegacyUrlToken } = await requireApi();
  let replacement;
  const browser = {
    GoogleSignIn: { mode: 'disabled', ready: Promise.resolve() },
    localStorage: {
      getItem: () => null,
      setItem() { throw new Error('storage unavailable'); },
    },
    location: { href: 'http://localhost/?token=legacy-test-token&tab=home' },
    history: { replaceState(_state, _title, url) { replacement = url; } },
  };

  const migrated = await withBrowser(browser, globalThis.fetch, () => restoreLegacyUrlToken());

  assert.equal(migrated, false);
  assert.equal(replacement, '/?tab=home');
});


test('api.streamChat forwards SSE deltas and the completion payload', async () => {
  const { api } = await requireApi();
  const deltas = [];
  let completed;
  const auth = { prepare: async (_path, _method, headers) => ({ headers, credentials: 'same-origin' }) };
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"Demo "}\n\nevent: delta\ndata: {"text":"reply"}\n\nevent: done\ndata: {"reply":"Demo reply"}\n\n'));
      controller.close();
    },
  });

  await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => null } },
    async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    () => api.streamChat({ mode: 'chat' }, { onDelta: (text) => deltas.push(text), onComplete: (data) => { completed = data; } }),
  );

  assert.deepEqual(deltas, ['Demo ', 'reply']);
  assert.deepEqual(completed, { reply: 'Demo reply' });
});

test('api.streamChat falls back to JSON chat when SSE is unsupported', async () => {
  const { api } = await requireApi();
  const paths = [];
  let completed;
  const auth = { prepare: async (_path, _method, headers) => ({ headers, credentials: 'same-origin' }) };

  await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => null } },
    async (path) => {
      paths.push(path);
      return path === '/api/chat/stream'
        ? jsonResponse(501, { error: 'stream unsupported' })
        : jsonResponse(200, { reply: 'fallback reply' });
    },
    () => api.streamChat({ mode: 'chat' }, { onComplete: (data) => { completed = data; } }),
  );

  assert.deepEqual(paths, ['/api/chat/stream', '/api/chat']);
  assert.deepEqual(completed, { reply: 'fallback reply' });
});

test('api.streamChat reconnects once before falling back when the first stream connection fails', async () => {
  const { api } = await requireApi();
  const paths = [];
  const auth = { prepare: async (_path, _method, headers) => ({ headers, credentials: 'same-origin' }) };

  await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => null } },
    async (path) => {
      paths.push(path);
      if (paths.length === 1) throw new Error('temporary connection reset');
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: done\ndata: {"reply":"reconnected"}\n\n'));
          controller.close();
        },
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    },
    () => api.streamChat({ mode: 'chat' }),
  );

  assert.deepEqual(paths, ['/api/chat/stream', '/api/chat/stream']);
});


test('api.streamChat parses CRLF event delimiters split across chunks', async () => {
  const { api } = await requireApi();
  const deltas = [];
  const auth = { prepare: async (_path, _method, headers) => ({ headers, credentials: 'same-origin' }) };
  const makeBody = () => new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: delta\r\ndata: {"text":"split"}\r\n\r'));
      controller.enqueue(new TextEncoder().encode('\nevent: done\r\ndata: {"reply":"split"}\r\n\r\n'));
      controller.close();
    },
  });

  const result = await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => null } },
    async () => new Response(makeBody(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    () => api.streamChat({ mode: 'chat' }, { onDelta: (text) => deltas.push(text) }),
  );
  assert.deepEqual(deltas, ['split']);
  assert.deepEqual(result, { reply: 'split' });
});


test('api.streamChat preserves auth headers and aborts without retry', async () => {
  const { api } = await requireApi();
  const controller = new AbortController();
  let prepared;
  let sent;
  let calls = 0;
  let reported;
  const auth = {
    enabled: true,
    prepare(path, method, headers) {
      prepared = { path, method, headers: { ...headers } };
      return Promise.resolve({ headers: { ...headers, 'X-FC-CSRF': 'stream-csrf' }, credentials: 'include' });
    },
    handleUnauthorized() {},
  };

  await assert.rejects(
    withBrowser(
      { GoogleSignIn: auth, localStorage: { getItem: () => 'stream-token' } },
      async (path, options) => {
        calls += 1;
        sent = { path, options };
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
      () => api.streamChat({ mode: 'chat', messages: [] }, { signal: controller.signal, onError: (error) => { reported = error; } }),
    ),
    { name: 'AbortError' },
  );

  assert.equal(prepared.path, '/api/chat/stream');
  assert.equal(prepared.method, 'POST');
  assert.equal(prepared.headers.Authorization, 'Bearer stream-token');
  assert.equal(sent.options.headers['X-FC-CSRF'], 'stream-csrf');
  assert.equal(sent.options.credentials, 'include');
  assert.equal(sent.options.signal, controller.signal);
  assert.equal(calls, 1);
  assert.equal(reported.name, 'AbortError');
});


test('api.streamChat cancels an open reader after receiving completion', async () => {
  const { api } = await requireApi();
  let cancelled = false;
  const auth = { prepare: async (_path, _method, headers) => ({ headers, credentials: 'same-origin' }) };
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: done\ndata: {"reply":"complete"}\n\n'));
    },
    cancel() { cancelled = true; },
  });

  const result = await withBrowser(
    { GoogleSignIn: auth, localStorage: { getItem: () => null } },
    async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    () => api.streamChat({ mode: 'chat' }),
  );
  assert.deepEqual(result, { reply: 'complete' });
  assert.equal(cancelled, true);
});
