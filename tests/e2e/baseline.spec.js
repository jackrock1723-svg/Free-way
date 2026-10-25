import { expect, test } from '@playwright/test';

const providerHosts = /(?:openrouter\.ai|api\.nvidia\.com|api\.groq\.com|models\.github\.ai|api\.mistral\.ai|api\.cloudflare\.com)/i;

async function blockExternalRequests(page) {
  const externalRequests = [];
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === 'localhost') {
      await route.continue();
    } else {
      externalRequests.push(route.request().url());
      await route.abort();
    }
  });
  return externalRequests;
}

test('React shell loads without provider requests and Google Sign-In stays disabled', async ({ page }) => {
  const providerRequests = [];
  const externalRequests = await blockExternalRequests(page);
  page.on('request', (request) => {
    if (providerHosts.test(request.url())) providerRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Free way');
  await expect(page.getByRole('heading', { name: 'Build with clear intent.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveCount(1);
  await expect(page.locator('.runtime-panel')).toBeVisible();
  const authMode = await page.evaluate(async () => {
    if (!window.GoogleSignIn) return 'missing';
    await window.GoogleSignIn.ready;
    return window.GoogleSignIn.mode;
  });
  expect(authMode).toBe('disabled');
  expect(providerRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('legacy token URL is migrated before the React shell renders when Sign-In is disabled', async ({ page }) => {
  const externalRequests = await blockExternalRequests(page);

  await page.goto('/?token=legacy-test-token&tab=home#chat');
  await expect(page.getByRole('heading', { name: 'Build with clear intent.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    authMode: window.GoogleSignIn?.mode ?? 'missing',
    tokenStored: Boolean(localStorage.getItem('fc.token')),
    tokenQueryPresent: new URL(window.location.href).searchParams.has('token'),
    search: window.location.search,
    hash: window.location.hash,
  }))).toMatchObject({
    authMode: 'disabled',
    tokenStored: true,
    tokenQueryPresent: false,
    search: '?tab=home',
    hash: '#chat',
  });
  await expect(page).toHaveURL(/\?tab=home#chat$/);
  expect(externalRequests).toEqual([]);
});
