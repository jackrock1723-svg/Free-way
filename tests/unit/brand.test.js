import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// User-visible product name is "Free way"; the Python package stays `freecode` internally.
const files = [
  'frontend/index.html', 'frontend/src/App.jsx', 'frontend/src/main.jsx',
  'frontend/src/features/settings/KeyboardSettings.jsx', 'frontend/src/features/settings/ProjectSettings.jsx',
  'frontend/public/manifest.webmanifest', 'frontend/public/google-signin.js',
  'web/index.html', 'web/app.js', 'web/app.css', 'web/manifest.webmanifest', 'web/google-signin.js',
];

for (const file of files) {
  test(`${file} shows "Free way", not the old name`, () => {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.equal(/Freecode/.test(text), false, `${file} still contains "Freecode"`);
  });
}

test('manifests and HTML titles use the Free way name', () => {
  for (const m of ['frontend/public/manifest.webmanifest', 'web/manifest.webmanifest']) {
    const json = JSON.parse(readFileSync(new URL(`../../${m}`, import.meta.url), 'utf8'));
    assert.equal(json.name, 'Free way');
    assert.equal(json.short_name, 'Free way');
  }
  for (const h of ['frontend/index.html', 'web/index.html']) {
    assert.match(readFileSync(new URL(`../../${h}`, import.meta.url), 'utf8'), /<title>Free way<\/title>/);
  }
});
