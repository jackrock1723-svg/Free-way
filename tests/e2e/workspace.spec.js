import { expect, test } from '@playwright/test';

// This spec exercises the built-in demo sample project, which is no longer selected by default.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

async function openOfflineWorkspace(page, beforeNavigation) {
  const externalRequests = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
    } else {
      externalRequests.push(url.origin);
      await route.abort();
    }
  });
  if (beforeNavigation) await beforeNavigation();
  await page.goto('/');
  await settleServer(page);
  return externalRequests;
}

// Earlier specs share this server; best-effort finish of their leftover runs so the parallel-agent limit is not hit.
async function settleServer(page) {
  const busyStates = ['planning', 'orchestrating', 'needs_plan_approval', 'needs_milestone_approval', 'working'];
  for (let i = 0; i < 10; i += 1) {
    const res = await page.request.get('/api/agents');
    if (!res.ok()) return;
    const busy = (await res.json()).filter((a) => busyStates.includes(a.state));
    if (busy.length === 0) return;
    for (const a of busy) {
      if (a.state === 'orchestrating') await page.request.post(`/api/orchestrations/${a.id}/cancel`, { data: {} });
      else await page.request.post(`/api/agents/${a.id}/reject`, { data: {} });
    }
    await page.waitForTimeout(300);
  }
}

const primary = (page) => page.getByRole('navigation', { name: 'Primary navigation' });

test('new chat renders a streamed reply from the offline mock server', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  await page.getByLabel('New message').fill('hello from the workspace test');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Demo reply: hello from the workspace test')).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('project picker selects and creates a project successfully', async ({ page }) => {
  let releaseProjectList;
  const projectListGate = new Promise((resolve) => { releaseProjectList = resolve; });
  const externalRequests = await openOfflineWorkspace(page, async () => {
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'GET') await projectListGate;
      await route.continue();
    });
  });
  const project = page.getByLabel('Active project');
  try {
    await project.selectOption('demo');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name').fill('Workspace Sample');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(project).toHaveValue('workspace-sample');
  } finally {
    releaseProjectList();
  }
  await expect(project).toHaveValue('workspace-sample');
  await expect(page.getByText('Project created: workspace-sample', { exact: true })).toBeVisible();
  // The demo sample is not offered once the user has a real project.
  await expect(project.locator('option[value="demo"]')).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('plan and action approvals stay explicit through diff and review', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  const mergeRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/merge')) mergeRequests.push(request.url());
  });
  await page.getByLabel('Build prompt').fill('Build a small hello page');
  await page.getByRole('button', { name: 'Build' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Plan approval required$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Approve plan' }).click();
  await page.getByRole('button', { name: 'Approve action 1' }).click();
  await page.getByRole('button', { name: 'Reject action 2' }).click();
  // The mock's final shell action is environment-dependent; test the decision gate without executing it.
  await page.getByRole('button', { name: 'Reject action 3' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Ready for review$/ })).toBeVisible();
  await page.getByRole('button', { name: 'View diff' }).click();
  await expect(page.getByText('index.html', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run code review' }).click();
  await expect(page.getByText('Review verdict')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Merge to main' })).toBeVisible();
  expect(mergeRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('Mission milestone completion requires its own approval before the next plan', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  await page.getByLabel('Build prompt').fill('Create a mission workspace');
  await page.getByRole('checkbox', { name: 'Mission' }).check();
  await page.getByRole('button', { name: 'Build' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Plan approval required$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Approve plan' }).click();
  await page.getByRole('button', { name: 'Approve action 1' }).click();
  await expect(page.getByText('Milestone awaiting approval')).toBeVisible();
  await page.getByRole('button', { name: 'Approve milestone 1' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Plan approval required$/ })).toBeVisible();
  await expect(page.getByText('Milestone 2 of 3')).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('Apps shows real local connector status without attempting external connection', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  await primary(page).getByRole('button', { name: 'Apps' }).click();
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await expect(page.getByText('Connections are not configured', { exact: false })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('Preview provides refresh and in-session back/forward navigation after a completed action', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  await page.getByLabel('Build prompt').fill('Build a small hello page');
  await page.getByRole('button', { name: 'Build' }).click();
  await page.getByRole('button', { name: 'Approve plan' }).click();
  await page.getByRole('button', { name: 'Approve action 1' }).click();
  await page.getByRole('button', { name: 'Reject action 2' }).click();
  // The mock's final shell action is environment-dependent; test the decision gate without executing it.
  await page.getByRole('button', { name: 'Reject action 3' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Ready for review$/ })).toBeVisible();
  await page.route('**/preview/k/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const base = pathname.slice(0, pathname.lastIndexOf('/') + 1);
    if (pathname.endsWith('/index.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; connect-src 'none'" }, body: `<!doctype html><a href="${base}next.html">Open next page</a><script>parent.postMessage({fcloc:location.pathname}, '*')</script>` });
    } else if (pathname.endsWith('/next.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; connect-src 'none'" }, body: `<!doctype html><p>Second preview page</p><script>parent.postMessage({fcloc:location.pathname}, '*')</script>` });
    } else await route.continue();
  });
  await primary(page).getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await expect(page.getByTitle('Live preview')).toBeVisible();
  const address = page.getByLabel('Preview address');
  await page.frameLocator('iframe[title="Live preview"]').getByRole('link', { name: 'Open next page' }).click();
  await expect(address).toHaveValue('next.html');
  await expect(page.getByRole('button', { name: 'Back' })).toBeEnabled();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(address).toHaveValue('index.html');
  await address.fill('style.css');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(address).toHaveValue('style.css');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(address).toHaveValue('index.html');
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(address).toHaveValue('style.css');
  await page.getByRole('button', { name: 'Refresh preview' }).click();
  expect(externalRequests).toEqual([]);
});

test('responsive navigation reaches all six core workspace sections', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  const nav = primary(page);
  for (const section of ['Home', 'Board', 'Apps', 'Preview', 'Me']) {
    const control = nav.getByRole('button', { name: section, exact: true });
    await expect(control).toBeVisible();
    await control.click();
    if (section === 'Home') await expect(page.getByRole('heading', { name: 'Build with clear intent.', exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
  }
  expect(externalRequests).toEqual([]);
});


test('failed project creation preserves the active project and keeps the dialog open', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Project service unavailable.' }) });
    } else await route.continue();
  });
  const project = page.getByLabel('Active project');
  await project.selectOption('demo');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('Broken Sample');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(project).toHaveValue('demo');
  await expect(page.getByLabel('Project name')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Project service unavailable.');
  await expect(page.getByText('Project created: broken-sample', { exact: true })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('blocked actions never expose an approval control', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  const blockedAgent = { id: 'blocked-action-test', project: 'demo', title: 'Blocked action test', state: 'working', plan: { summary: 'Unsafe file write', steps: ['Do not write outside the project'] }, actions: [{ type: 'write_file', path: '../outside.txt', status: 'pending', risk: 'blocked: path outside worktree' }] };
  await page.route('**/api/orchestrations', async (route) => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(blockedAgent) });
    else await route.continue();
  });
  await page.getByLabel('Build prompt').fill('Try a blocked action');
  await page.getByRole('button', { name: 'Build' }).click();
  await expect(page.getByText('pending · blocked', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve action 1' })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('failed-check merge requires an explicit override confirmation and sends override true', async ({ page }) => {
  const failedAgent = { id: 'failed-check-test', project: 'demo', title: 'Failed checks', state: 'review', checks: 'failed', plan: { summary: 'A change with failed checks', steps: ['Run tests'] }, actions: [{ type: 'run_command', command: 'node test.js', status: 'done', risk: 'command', result: { exit_code: 1 } }], preview_url: '/preview/k/test-key/failed-check-test/' };
  let mergePayload;
  const externalRequests = await openOfflineWorkspace(page, async () => {
    await page.route('**/api/agents', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([failedAgent]) });
      else await route.continue();
    });
    await page.route('**/api/agents/failed-check-test/merge', async (route) => {
      mergePayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...failedAgent, state: 'merged' }) });
    });
  });
  await primary(page).getByRole('button', { name: 'Board' }).click();
  await page.getByRole('button', { name: 'Merge anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Override failed checks and merge?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(mergePayload).toBeUndefined();
  await page.getByRole('button', { name: 'Merge anyway' }).click();
  await page.getByRole('button', { name: 'Confirm override and merge' }).click();
  await expect.poll(() => mergePayload).toEqual({ override: true });
  expect(externalRequests).toEqual([]);
});
