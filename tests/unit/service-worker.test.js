import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

async function loadServiceWorker(existingCaches = []) {
  const listeners = new Map();
  const cacheWrites = [];
  const fetchCalls = [];
  const deletedCaches = [];
  const context = {
    self: {
      location: { origin: 'http://localhost' },
      addEventListener(name, handler) { listeners.set(name, handler); },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      keys: async () => existingCaches,
      delete: async (name) => { deletedCaches.push(name); return true; },
      open: async (name) => ({
        put: async (request) => { cacheWrites.push({ name, url: request.url }); },
      }),
      match: async () => undefined,
    },
    fetch: async (request, options) => {
      fetchCalls.push({ url: request.url, options });
      return { ok: true, clone: () => ({ url: request.url }) };
    },
    URL,
    Promise,
    Response: { error: () => ({ type: 'error' }) },
  };
  const source = await readFile(new URL('../../frontend/public/sw.js', import.meta.url), 'utf8');
  runInNewContext(source, context, { filename: 'frontend/public/sw.js' });
  return { handlers: listeners, handler: listeners.get('fetch'), cacheWrites, fetchCalls, deletedCaches };
}

function dispatch(handler, request) {
  let responsePromise;
  const waitUntilPromises = [];
  handler({
    request,
    respondWith(promise) { responsePromise = Promise.resolve(promise); },
    waitUntil(promise) { waitUntilPromises.push(Promise.resolve(promise)); },
  });
  return {
    intercepted: responsePromise !== undefined,
    async settle() {
      if (responsePromise === undefined) return;
      await responsePromise;
      await Promise.all(waitUntilPromises);
    },
  };
}

function getRequest(url, { mode = 'cors', destination = 'empty' } = {}) {
  return { url: `http://localhost${url}`, method: 'GET', mode, destination };
}

test('service worker bypasses navigations, query URLs, APIs, previews, and non-static paths', async () => {
  const worker = await loadServiceWorker();
  const requests = [
    getRequest('/?token=legacy-test-token', { mode: 'navigate', destination: 'document' }),
    getRequest('/?tab=home', { mode: 'navigate', destination: 'document' }),
    getRequest('/assets/app.js?token=legacy-test-token', { destination: 'script' }),
    getRequest('/assets/app.js?access_token=legacy-test-token', { destination: 'script' }),
    getRequest('/api/auth/session?token=legacy-test-token'),
    getRequest('/preview/demo'),
    getRequest('/account'),
  ];

  for (const request of requests) {
    const result = dispatch(worker.handler, request);
    assert.equal(result.intercepted, false, `must bypass ${request.url}`);
  }
  assert.deepEqual(worker.fetchCalls, []);
  assert.deepEqual(worker.cacheWrites, []);
});

test('activation removes the previous React cache but preserves legacy app caches', async () => {
  const worker = await loadServiceWorker(['fc-react-shell-v1', 'fc-react-shell-v2', 'fc-v18']);
  const pending = [];
  worker.handlers.get('activate')({ waitUntil(promise) { pending.push(Promise.resolve(promise)); } });

  await Promise.all(pending);
  assert.deepEqual(worker.deletedCaches, ['fc-react-shell-v1']);
});

test('service worker caches same-origin static assets without query strings', async () => {
  const worker = await loadServiceWorker();
  const request = getRequest('/assets/index-123.js', { destination: 'script' });
  const result = dispatch(worker.handler, request);

  assert.equal(result.intercepted, true);
  await result.settle();
  assert.deepEqual(worker.fetchCalls.map(({ url, options }) => [url, options.cache]), [
    ['http://localhost/assets/index-123.js', 'no-cache'],
  ]);
  assert.deepEqual(worker.cacheWrites, [
    { name: 'fc-react-shell-v2', url: 'http://localhost/assets/index-123.js' },
  ]);
});
