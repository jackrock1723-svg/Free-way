import { expect, test } from '@playwright/test';

async function openSettings(page, section) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const sectionButton = page.getByRole('button', { name: section, exact: true });
  await expect(sectionButton).toBeVisible();
  await sectionButton.click();
  await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
}

async function respond(route, status, body) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('Settings search filters sections and can open an advanced settings page', async ({ page }) => {
  await openSettings(page, 'General');
  const search = page.getByRole('searchbox', { name: 'Search settings' });
  await expect(search).toBeVisible();
  await search.fill('browser');
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav.getByRole('button', { name: 'Browser', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'General', exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Browser', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser', exact: true })).toBeVisible();
});

test('Skills searches local entries, inspects instructions as text, returns Back, and keeps remote Add disabled', async ({ page }) => {
  const requests = [];
  await page.route('**/api/settings/skills**', async (route) => {
    requests.push({ method: route.request().method(), url: route.request().url() });
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/safe-local')) {
      await respond(route, 200, { available: true, skill: {
        id: 'safe-local', name: 'Local Review Notes', description: 'A local offline review skill',
        instructions: '# Review notes\n<script>window.localSkillRan = true</script>',
      } });
      return;
    }
    await respond(route, 200, { available: true, skills: [{
      id: 'safe-local', name: 'Local Review Notes', description: 'A local offline review skill', source: 'local',
    }] });
  });

  await openSettings(page, 'Skills');
  const search = page.getByLabel('Search local skills');
  await search.fill('offline');
  await expect(page.getByRole('button', { name: 'Review instructions for Local Review Notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Review instructions for Local Review Notes' }).click();
  await expect(page.getByRole('heading', { name: 'Local Review Notes instructions', exact: true })).toBeVisible();
  await expect(page.locator('.settings-code-text')).toContainText('<script>window.localSkillRan = true</script>');
  await expect(page.locator('.settings-code-text script')).toHaveCount(0);
  expect(await page.evaluate(() => window.localSkillRan)).toBeUndefined();
  await page.getByRole('button', { name: 'Back to skills', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review instructions for Local Review Notes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add remote skill', exact: true })).toBeDisabled();
  expect(requests.every((request) => request.method === 'GET')).toBe(true);
});

test('Archived lists searchable local chats, restores transcripts, and confirms permanent deletion', async ({ page }) => {
  await page.addInitScript((data) => localStorage.setItem('fc.chats.v2', JSON.stringify(data)), {
    schemaVersion: 2,
    chats: [
      { id: 'archived-one', mode: 'chat', title: 'Archived local note', at: 10, msgs: [{ role: 'user', content: 'Keep this archived transcript' }], pinned: false, archived: true },
      { id: 'archived-two', mode: 'chat', title: 'Archived delete note', at: 8, msgs: [{ role: 'user', content: 'Remove only after confirmation' }], pinned: false, archived: true },
      { id: 'active-one', mode: 'chat', title: 'Active local note', at: 9, msgs: [{ role: 'user', content: 'Leave this active transcript' }], pinned: false, archived: false },
    ],
  });
  await page.reload();
  await openSettings(page, 'Archived');
  const rows = page.locator('.chat-history-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Archived local note');
  await expect(rows.first()).not.toContainText('Active local note');
  await page.getByLabel('Search archived chats').fill('archived local');
  await expect(rows).toHaveCount(1);
  await rows.getByRole('button', { name: 'Actions for Archived local note' }).click();
  await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
  await page.getByLabel('Search archived chats').fill('');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Archived delete note');
  await rows.getByRole('button', { name: 'Actions for Archived delete note' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete chat permanently?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await rows.getByRole('button', { name: 'Actions for Archived delete note' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete chat permanently?' }).getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByText('No archived chats.', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.chats.v2')));
  expect(stored.chats.find((chat) => chat.id === 'archived-one').msgs[0].content).toBe('Keep this archived transcript');
  expect(stored.chats.find((chat) => chat.id === 'archived-one').archived).toBe(false);
  expect(stored.chats.some((chat) => chat.id === 'archived-two')).toBe(false);
});

test('Browser profiles are checked only after a click and only allow-listed metadata is rendered', async ({ page }) => {
  let requests = 0;
  const marker = 'synthetic-browser-secret-must-not-render';
  await page.route('**/api/settings/browser', async (route) => {
    requests += 1;
    await respond(route, 200, {
      available: true,
      browsers: [
        { name: 'Google Chrome', profiles: ['Default', 'Profile 1'], profile_count: 2, cookies: marker, passwords: marker, session: marker },
        { name: 'Microsoft Edge', profiles: [], profile_count: 0 },
      ],
    });
  });

  await openSettings(page, 'Browser');
  expect(requests).toBe(0);
  await expect(page.locator('p.settings-metadata-empty[role="status"]')).toContainText('Browser profiles have not been checked yet');
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByText('Google Chrome', { exact: true })).toBeVisible();
  await expect(page.getByText('2 profiles', { exact: true })).toBeVisible();
  await expect(page.getByText('Default', { exact: true })).toBeVisible();
  await expect(page.getByText('Profile 1', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(marker);
  expect(requests).toBe(1);
});

test('MCP shows its empty state, disabled Add, and refreshes status without connecting servers', async ({ page }) => {
  let requests = 0;
  const mutations = [];
  await page.on('request', (request) => {
    if (request.url().includes('/api/settings/mcp') && request.method() !== 'GET') mutations.push(request.method());
  });
  await page.route('**/api/settings/mcp', async (route) => {
    requests += 1;
    await respond(route, 200, { available: true, servers: [] });
  });

  await openSettings(page, 'MCP');
  await expect(page.getByText(/no configured MCP servers/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add server', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  expect(mutations).toEqual([]);
});

test('MCP refresh shows a read error and recovers without enabling Add', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/settings/mcp', async (route) => {
    requests += 1;
    if (requests === 1) {
      await respond(route, 503, { error: 'Synthetic MCP metadata unavailable' });
      return;
    }
    await respond(route, 200, { available: true, servers: [{ id: 'memory', name: 'Memory', transport: 'stdio', status: 'not checked' }] });
  });

  await openSettings(page, 'MCP');
  await expect(page.getByRole('alert')).toContainText('Synthetic MCP metadata unavailable');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Memory', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add server', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Updates shows the running version and unavailable source without offering a download', async ({ page }) => {
  const response = await page.request.get('/api/config');
  const config = await response.json();
  await openSettings(page, 'Updates');
  await expect(page.getByText(config.version, { exact: true })).toBeVisible();
  await expect(page.getByText(/update source is not configured/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /download|install update/i })).toHaveCount(0);
});

test('advanced Settings pages remain usable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page, 'Updates');
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
});
