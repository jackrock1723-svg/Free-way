import { expect, test } from '@playwright/test';

async function openSettings(page, section) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: section, exact: true }).click();
  await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('Account shows only the local identity and current Google sign-in state', async ({ page }) => {
  await openSettings(page, 'Account');
  await expect(page.locator('.settings-content').getByText('Local workspace', { exact: true })).toBeVisible();
  await expect(page.getByText(/Google Sign-In is off/i)).toBeVisible();
  await expect(page.getByText(/profile identity is unavailable/i)).toBeVisible();
  await expect(page.getByText(/subscriber|email address|github account/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('Account offers sign-out only for an authenticated session', async ({ page }) => {
  let logoutCalls = 0;
  let loggedOut = false;
  await page.route('**/api/auth/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ enabled: true, client_id: 'synthetic.apps.googleusercontent.com' }),
  }));
  await page.route('**/api/auth/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: !loggedOut, csrf: loggedOut ? null : 'synthetic-session-token' }),
  }));
  await page.route('**/api/auth/logout', async (route) => {
    logoutCalls += 1;
    loggedOut = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.reload();
  await openSettings(page, 'Account');
  const signOut = page.getByRole('button', { name: 'Sign out' });
  await expect(signOut).toBeVisible();
  await signOut.click();
  await expect(signOut).toHaveCount(0);
  expect(logoutCalls).toBe(1);
});

test('Usage shows upstream counts or an explicit unavailable state, never estimates', async ({ page }) => {
  await openSettings(page, 'Usage');
  await expect(page.getByLabel('Usage period')).toHaveValue('7d');
  await expect(page.getByText(/no upstream usage records are available/i)).toBeVisible();
  await expect(page.getByText(/history keeps up to the latest 1,000 upstream records/i)).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(4);
  await expect(page.getByText(/estimated|based on message length/i)).toHaveCount(0);

  const response = page.waitForResponse((item) => item.url().includes('/api/settings/usage?period=all'));
  await page.getByLabel('Usage period').selectOption('all');
  await response;
  await expect(page.getByLabel('Usage period')).toHaveValue('all');
});

test('Billing, Developer API credits, and Earn actions remain disabled without real backends', async ({ page }) => {
  await openSettings(page, 'Billing');
  await expect(page.getByText(/no billing service is configured/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /checkout|add payment|manage plan/i })).toBeDisabled();

  await openSettings(page, 'Developer API');
  await expect(page.getByText(/credits are unavailable/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /add credits|top up/i })).toBeDisabled();

  await openSettings(page, 'Earn');
  await expect(page.getByText(/no funded publisher or rewards backend is configured/i)).toBeVisible();
  for (const action of ['Referrals unavailable', 'Contributions unavailable', 'Cash out unavailable']) {
    await expect(page.getByRole('button', { name: action, exact: true })).toBeDisabled();
  }
  await expect(page.locator('body')).not.toContainText(/\$\s?\d|\d+\s+credits|extra daily runs/i);
});

test('Model Providers lists supported providers and never renders unexpected credential fields', async ({ page }) => {
  const marker = 'synthetic-provider-key-must-not-render';
  await page.route('**/api/settings/providers', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      providers: [
        { name: 'OpenRouter', configured: true, api_key: marker, secret: marker },
        { name: 'NVIDIA NIM', configured: false },
        { name: 'Groq', configured: false },
        { name: 'GitHub Models', configured: false },
        { name: 'Mistral', configured: false },
        { name: 'Cloudflare AI', configured: false },
      ],
    }),
  }));
  await openSettings(page, 'Model Providers');
  for (const name of ['OpenRouter', 'NVIDIA NIM', 'Groq', 'GitHub Models', 'Mistral', 'Cloudflare AI']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Configured', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(marker);
  await expect(page.getByTestId('provider-row')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Download Claude Code' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download Codex' })).toBeDisabled();
});

test('Integrations shows all 12 screenshot tiles with actual catalog support and honest states', async ({ page }) => {
  const mutatingRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/connectors/') && request.method() !== 'GET') mutatingRequests.push(request.url());
  });

  await openSettings(page, 'Integrations');
  const tiles = page.getByTestId('integration-tile');
  await expect(tiles).toHaveCount(12);
  for (const supported of ['Gmail', 'Google Drive', 'Google Calendar', 'Slack', 'Notion', 'Linear', 'Outlook']) {
    await expect(page.getByRole('article', { name: new RegExp(supported) })).toContainText(/not configured|configured|coming soon/i);
  }
  for (const unavailable of ['PostHog', 'Sentry', 'Stripe', 'Supabase', 'HubSpot']) {
    const tile = page.getByRole('article', { name: new RegExp(unavailable) });
    await expect(tile).toContainText(/unavailable in this build/i);
  }
  expect(mutatingRequests).toEqual([]);
});

test('Integrations keeps all tiles visible with unknown status when the catalog is unavailable', async ({ page }) => {
  await page.route('**/api/connectors', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Synthetic connector catalog unavailable' }),
  }));
  await page.reload();
  await openSettings(page, 'Integrations');

  await expect(page.locator('.settings-content').getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('integration-tile')).toHaveCount(12);
  await expect(page.getByRole('article', { name: /Gmail/ })).toContainText(/status unavailable/i);
  await expect(page.getByRole('article', { name: /PostHog/ })).toContainText(/status unavailable/i);
});

test('Task 9 settings remain usable on a 390 by 844 viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page, 'Integrations');
  await expect(page.getByTestId('integration-tile')).toHaveCount(12);
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
});
