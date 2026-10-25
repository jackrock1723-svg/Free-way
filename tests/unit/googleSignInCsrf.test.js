import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const authScriptUrl = new URL('../../frontend/public/google-signin.js', import.meta.url);

function makeMockedAuthClient() {
  const calls = [];
  const window = {};
  const context = {
    window,
    document: { addEventListener() {} },
    location: {
      protocol: 'https:',
      origin: 'https://freecode.test',
      href: 'https://freecode.test/settings',
    },
    history: { replaceState() {} },
    URL,
    fetch: async (path, options = {}) => {
      calls.push({ path, options });
      const body = path === '/api/auth/config'
        ? { enabled: true, client_id: 'fixture.apps.googleusercontent.com' }
        : { authenticated: true, csrf: 'fixture-csrf-token' };
      return { ok: true, status: 200, async json() { return body; } };
    },
  };
  vm.runInNewContext(readFileSync(authScriptUrl, 'utf8'), context);
  return { auth: window.GoogleSignIn, calls };
}

test('GoogleSignIn attaches the owner CSRF token to settings PUT requests', async () => {
  const { auth, calls } = makeMockedAuthClient();
  await auth.ready;

  const prepared = await auth.prepare('/api/settings', 'PUT', { 'Content-Type': 'application/json' });

  assert.equal(prepared.headers['X-FC-CSRF'], 'fixture-csrf-token');
  assert.equal(prepared.credentials, 'same-origin');
  assert.deepEqual(calls.map((call) => call.path), ['/api/auth/config', '/api/auth/session']);
});
