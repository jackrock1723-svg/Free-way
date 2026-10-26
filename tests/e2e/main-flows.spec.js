import { expect, test } from '@playwright/test';

// This spec exercises the built-in demo sample project, which is no longer selected by default.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

// Click through every main button and flow; the app must never crash or leak raw server errors.
function guard(page) {
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function noCrash(page, problems) {
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  expect(problems).toEqual([]);
}

async function nav(page, name) {
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name, exact: true }).click();
}

test('home: new project dialog cancel and create, mission toggle, build starts', async ({ page }) => {
  test.setTimeout(45_000);
  const problems = guard(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New project' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill(`Flow ${Date.now().toString(36)}`);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(/Project created:/)).toBeVisible();
  await page.getByRole('radio', { name: 'Mission' }).check();
  await page.getByRole('radio', { name: 'Build' }).check();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Describe what you want built.');
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await page.getByLabel('Build prompt').fill('Add a short welcome line to index.html');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
  await expect(page.locator('.state-badge').first()).toBeVisible();
  // Leave the shared test server idle: cancel the run if specialists are still working.
  // Use the API (the button re-renders every poll on small screens), then wait until nothing is orchestrating.
  await expect.poll(async () => {
    const agents = await (await page.request.get('/api/agents')).json();
    const busy = agents.filter((a) => a.state === 'orchestrating');
    for (const a of busy) await page.request.post(`/api/orchestrations/${a.id}/cancel`, { data: {} });
    return busy.length;
  }, { timeout: 20_000 }).toBe(0);
  await noCrash(page, problems);
});

test('every primary section opens without crashing', async ({ page }) => {
  const problems = guard(page);
  await page.goto('/');
  for (const section of ['Home', 'Board', 'Apps', 'Preview', 'Me', 'Settings', 'Home']) {
    await nav(page, section);
    await expect(page.locator('.topbar p')).toHaveText(section);
    await noCrash(page, problems);
  }
});

test('chat: send, new chat, archived toggle', async ({ page }) => {
  const problems = guard(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  await page.getByLabel('New message').fill('Say hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.message-assistant').last()).not.toHaveText(/Thinking/);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.getByText(/Start a conversation/)).toBeVisible();
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await page.getByRole('button', { name: 'Back to chats' }).click();
  await noCrash(page, problems);
});

test('settings: every section opens, agent modes and sandbox controls change and restore', async ({ page }) => {
  const problems = guard(page);
  await page.goto('/');
  await nav(page, 'Settings');
  const sections = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button');
  const names = await sections.allInnerTexts();
  expect(names.length).toBeGreaterThan(10);
  for (const name of names) {
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: name.trim(), exact: true }).click();
    await noCrash(page, problems);
  }
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'General', exact: true }).click();
  const mode = page.getByLabel('Agent mode');
  for (const value of ['lite', 'max', 'plan', 'base2']) {
    await mode.selectOption(value);
    await expect(mode).toHaveValue(value);
    await expect(mode).toBeEnabled();
  }
  const sandbox = page.locator('#sandbox-mode');
  const original = await sandbox.inputValue();
  const options = await sandbox.locator('option').evaluateAll((items) => items.filter((o) => !o.disabled).map((o) => o.value));
  for (const value of options) {
    await sandbox.selectOption(value);
    await expect(sandbox).toHaveValue(value);
    await expect(sandbox).toBeEnabled();
  }
  await sandbox.selectOption(original);
  const network = page.getByLabel('Allow network inside the sandbox');
  if (await network.isEnabled()) {
    const before = await network.isChecked();
    await network.click();
    await expect(network).toBeChecked({ checked: !before });
    await expect(network).toBeEnabled();
    await network.click();
    await expect(network).toBeChecked({ checked: before });
  }
  await noCrash(page, problems);
});

test('server failures show a friendly message, never the raw error', async ({ page }) => {
  const problems = guard(page);
  await page.route('**/api/projects', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'KeyError: internal_table_xyz' }) })
    : route.continue()));
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('Will fail');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('alert')).toContainText('Something went wrong on our side. Please try again in a moment.');
  await expect(page.locator('body')).not.toContainText('internal_table_xyz');
  await noCrash(page, problems);
});

test('a crashing page shows the friendly screen, reports it, and Try again recovers', async ({ page }) => {
  const reports = [];
  await page.route('**/api/errors/report', async (route) => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/');
  await page.evaluate(() => window.sessionStorage.setItem('fw.crashTest', '1'));
  await nav(page, 'Me');
  const screen = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: 'Something went wrong' }) });
  await expect(screen).toBeVisible();
  await expect(screen).not.toContainText('Crash probe');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect.poll(() => reports.some((r) => String(r.message).includes('UI crash'))).toBe(true);
  await page.evaluate(() => window.sessionStorage.removeItem('fw.crashTest'));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Me', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});
