import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePreviewPath, previewBaseFor } from '../../frontend/src/preview.js';

test('previewBaseFor accepts only the same-origin capability URL for the selected agent', () => {
  const agent = { id: 'agent-7', preview_url: '/preview/k/key123/agent-7/' };
  assert.equal(previewBaseFor(agent, 'http://127.0.0.1:8790'), '/preview/k/key123/agent-7/');
  assert.equal(previewBaseFor({ ...agent, preview_url: 'https://example.net/preview/k/key123/agent-7/' }, 'http://127.0.0.1:8790'), '');
  assert.equal(previewBaseFor({ ...agent, preview_url: '/preview/k/key123/other-agent/' }, 'http://127.0.0.1:8790'), '');
});

test('normalizePreviewPath rejects absolute, protocol, encoded traversal, and malformed paths', () => {
  for (const value of ['/etc/passwd', '//example.net/file', 'https://example.net/', 'javascript%3Aalert(1)', '%2e%2e/secret', 'assets/%2E%2E/private', 'bad%zz']) {
    assert.throws(() => normalizePreviewPath(value), { name: 'TypeError' }, value);
  }
});

test('normalizePreviewPath allows local nested files and encodes spaces', () => {
  assert.equal(normalizePreviewPath('assets/my%20file.css'), 'assets/my%20file.css');
  assert.equal(normalizePreviewPath('pages/settings.html'), 'pages/settings.html');
  assert.equal(normalizePreviewPath(''), 'index.html');
});


test('previewPathFromLocation accepts only safe paths inside the active capability root', async () => {
  const { previewPathFromLocation } = await import('../../frontend/src/preview.js');
  const base = '/preview/k/key123/agent-7/';
  assert.equal(previewPathFromLocation(`${base}pages/next.html`, base), 'pages/next.html');
  assert.equal(previewPathFromLocation(`${base}%2e%2e/secret`, base), '');
  assert.equal(previewPathFromLocation('/preview/k/key123/other-agent/index.html', base), '');
  assert.equal(previewPathFromLocation('https://example.net/preview/k/key123/agent-7/index.html', base), '');
});
