import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const providerHosts = /(?:openrouter\.ai|api\.nvidia\.com|api\.groq\.com|models\.github\.ai|api\.mistral\.ai|api\.cloudflare\.com)/i;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const legacyRoot = path.join(repoRoot, 'web');
const legacyAssets = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.css', 'app.css'],
  ['/app.js', 'app.js'],
  ['/phone.js', 'phone.js'],
  ['/google-signin.js', 'google-signin.js'],
  ['/favicon.svg', 'favicon.svg'],
  ['/icon.svg', 'icon.svg'],
  ['/icon-192.png', 'icon-192.png'],
  ['/icon-512.png', 'icon-512.png'],
  ['/icon-maskable-512.png', 'icon-maskable-512.png'],
  ['/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
  ['/sw.js', 'sw.js'],
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

test.use({ serviceWorkers: 'block' });

test('project creation API failure keeps the dialog open and active project unchanged', async ({ page }) => {
  const providerRequests = [];
  await page.addInitScript(() => localStorage.setItem('fc.project', 'demo'));
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === 'localhost') {
      const filename = legacyAssets.get(requestUrl.pathname);
      if (filename) {
        const headers = filename === 'sw.js' ? { 'Service-Worker-Allowed': '/' } : undefined;
        await route.fulfill({
          status: 200,
          contentType: contentTypes[path.extname(filename)] || 'application/octet-stream',
          body: await readFile(path.join(legacyRoot, filename)),
          headers,
        });
        return;
      }
      await route.continue();
      return;
    }
    if (providerHosts.test(route.request().url())) providerRequests.push(route.request().url());
    await route.abort();
  });
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        json: { error: 'Project creation is temporarily unavailable.' },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  const advancedOptions = page.locator('#advanced-options');
  if (!(await advancedOptions.evaluate((element) => element.open))) {
    await advancedOptions.locator('summary').click();
  }
  await page.locator('#projchip').click();
  await page.locator('#pm-new').click();
  await expect(page.locator('#newprojform')).toBeVisible();

  const projectId = `failure-${Date.now().toString(36)}`;
  await page.getByLabel('Project ID').fill(projectId);
  const failedPost = page.waitForResponse((response) =>
    response.url().endsWith('/api/projects') && response.request().method() === 'POST' && response.status() === 503,
  );
  await page.locator('#np-ok').click();
  await failedPost;

  await expect(page.locator('#newprojform')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('Project creation is temporarily unavailable.');
  await expect(page.locator('#toast')).not.toContainText('Switched to');
  await expect(page.locator('#projbar')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fc.project'))).toBe('demo');
  expect(providerRequests).toEqual([]);
});
