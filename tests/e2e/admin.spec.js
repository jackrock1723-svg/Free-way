import { expect, test } from '@playwright/test';

// Test-only token; its hash is set by tests/python/server_fixture.py for the temporary server.
const ADMIN_TOKEN = 'fw-e2e-admin-token-0123456789';

async function unlock(page) {
  await page.goto('/#admin');
  await expect(page.getByRole('heading', { name: 'Admin panel' })).toBeVisible();
  await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
}

test('admin panel stays locked without a token and explains a wrong token', async ({ page }) => {
  await page.goto('/#admin');
  await expect(page.getByRole('heading', { name: 'Admin panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText('Paste the admin token');
  await page.getByLabel('Admin token').fill('not-the-right-token-123');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText('was not accepted');
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
  const denied = await page.request.get('/api/admin/users');
  expect(denied.status()).toBe(403);
});

test('overview shows health, agent mode and sandbox status; Refresh reloads', async ({ page }) => {
  await unlock(page);
  const overview = page.getByLabel('Overview');
  await expect(overview.getByText('System health')).toBeVisible();
  await expect(overview.getByText('Healthy')).toBeVisible();
  await expect(overview.getByText('Local files')).toBeVisible();
  await expect(overview.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await expect(overview.getByRole('heading', { name: 'Sandbox' })).toBeVisible();
  const reload = page.waitForResponse((r) => r.url().endsWith('/api/admin/overview') && r.status() === 200);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await reload;
});

test('users tab lists sign-ins, View opens details, Disable and Enable work, Close hides details', async ({ page }) => {
  await unlock(page);
  await page.getByRole('tab', { name: 'Users' }).click();
  const users = page.getByRole('table', { name: 'Users' });
  await expect(users.getByText('tester@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'View tester@example.com' }).click();
  const detail = page.getByLabel('User details');
  await expect(detail.getByRole('heading', { name: 'Test User' })).toBeVisible();
  await expect(detail.getByText('203.0.113.20')).toBeVisible();
  await expect(detail.getByText('tester-site')).toBeVisible();
  await expect(detail.getByText('agent run')).toBeVisible();
  await detail.getByRole('button', { name: 'Disable user' }).click();
  await expect(page.getByRole('status')).toContainText('is now disabled');
  await expect(users.getByText('Disabled')).toBeVisible();
  await detail.getByRole('button', { name: 'Enable user' }).click();
  await expect(page.getByRole('status')).toContainText('is now active');
  await expect(detail.getByRole('button', { name: 'Disable user' })).toBeVisible();
  await detail.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByLabel('User details')).toHaveCount(0);
});

test('revenue tab and error log viewer show real data', async ({ page }) => {
  await page.goto('/');
  const reported = await page.request.post('/api/errors/report', { data: { message: 'E2E sample browser error', path: '/e2e' } });
  expect(reported.status()).toBe(202);
  await unlock(page);
  await page.getByRole('tab', { name: 'Revenue' }).click();
  await expect(page.getByRole('heading', { name: 'Ad events' })).toBeVisible();
  await expect(page.getByText('No ad events recorded yet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ads network' })).toBeVisible();
  await expect(page.getByText('No ad publisher is configured.')).toBeVisible();
  await page.getByRole('tab', { name: 'Errors' }).click();
  await expect(page.getByRole('table', { name: 'Error log' }).getByText('E2E sample browser error').first()).toBeVisible();
});

test('Lock clears the admin session and the token is required again', async ({ page }) => {
  await unlock(page);
  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByRole('heading', { name: 'Admin panel' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin panel' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
});

test('ad controls: turn ads off and on, save limits, see targeting signals', async ({ page }) => {
  await unlock(page);
  await page.getByRole('tab', { name: 'Revenue' }).click();
  const controls = page.getByLabel('Ad controls');
  await expect(controls.getByText('Ads on')).toBeVisible();
  await controls.getByRole('button', { name: 'Turn ads off' }).click();
  await expect(page.getByRole('status')).toContainText('Ads turned off for everyone.');
  await expect(controls.getByText('Ads off')).toBeVisible();
  await controls.getByRole('button', { name: 'Turn ads on' }).click();
  await expect(page.getByRole('status')).toContainText('Ads turned on.');
  await controls.getByLabel('Max ads per user per day').fill('7');
  await controls.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByRole('status')).toContainText('Ad limits saved.');
  await expect(controls.getByLabel('Max ads per user per day')).toHaveValue('7');
  await controls.getByLabel('Max ads per user per day').fill('12');
  await controls.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByRole('status')).toContainText('Ad limits saved.');
  await expect(page.getByRole('heading', { name: 'Targeting signals' })).toBeVisible();
});
