import assert from 'node:assert/strict';
import test from 'node:test';

async function loadSettingsApi() {
  try {
    const module = await import('../../frontend/src/features/settings/settingsApi.js');
    assert.ok(module.settingsApi, 'settingsApi export should be present');
    return module.settingsApi;
  } catch (error) {
    assert.fail(`settingsApi is not available yet: ${error.code || error.message}`);
  }
}

function installFakeFetch(t) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, ...options });
    return {
      ok: true,
      status: 200,
      async json() { return { schema_version: 1, preferences: {} }; },
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return calls;
}

test('settingsApi uses the shared API client for global reads and writes', async (t) => {
  const calls = installFakeFetch(t);
  const settingsApi = await loadSettingsApi();

  await settingsApi.read();
  await settingsApi.update({ advanced_mode: true });

  assert.deepEqual(
    calls.map(({ path, method, body }) => ({ path, method, body })),
    [
      { path: '/api/settings', method: 'GET', body: undefined },
      { path: '/api/settings', method: 'PUT', body: JSON.stringify({ advanced_mode: true }) },
    ],
  );
});

test('settingsApi uses the project-scoped routes for project reads and writes', async (t) => {
  const calls = installFakeFetch(t);
  const settingsApi = await loadSettingsApi();

  await settingsApi.readProject('demo-1');
  await settingsApi.updateProject('demo-1', { startup_command: 'npm run dev' });

  assert.deepEqual(
    calls.map(({ path, method, body }) => ({ path, method, body })),
    [
      { path: '/api/settings/projects/demo-1', method: 'GET', body: undefined },
      {
        path: '/api/settings/projects/demo-1',
        method: 'PUT',
        body: JSON.stringify({ startup_command: 'npm run dev' }),
      },
    ],
  );
});

test('settingsApi reads account, usage, and provider status through the shared client', async (t) => {
  const calls = installFakeFetch(t);
  const settingsApi = await loadSettingsApi();

  await settingsApi.readAuthConfig();
  await settingsApi.readAuthSession();
  await settingsApi.readUsage('30d');
  await settingsApi.readProviders();

  assert.deepEqual(
    calls.map(({ path, method }) => ({ path, method })),
    [
      { path: '/api/auth/config', method: 'GET' },
      { path: '/api/auth/session', method: 'GET' },
      { path: '/api/settings/usage?period=30d', method: 'GET' },
      { path: '/api/settings/providers', method: 'GET' },
    ],
  );
});

test('settingsApi rejects invalid startup command text before sending a request', async (t) => {
  const calls = installFakeFetch(t);
  const settingsApi = await loadSettingsApi();

  await assert.rejects(
    settingsApi.updateProject('demo', { startup_command: 'x'.repeat(2001) }),
    /2,000 characters/i,
  );
  await assert.rejects(
    settingsApi.updateProject('demo', { startup_command: 'run\u0000unsafe' }),
    /control character/i,
  );
  assert.deepEqual(calls, []);
});
