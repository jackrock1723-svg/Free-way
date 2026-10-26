import { expect, test } from '@playwright/test';

// This spec exercises the built-in demo sample project, which is no longer selected by default.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

async function openOfflineWorkspace(page) {
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
  await page.goto('/');
  return externalRequests;
}

const BASE2_LABELS = ['File Picker', 'Code Searcher', 'Researcher', 'Thinker', 'Editor', 'Reviewer', 'Basher'];

test('plan agent mode from General settings runs planners only and proposes no actions', async ({ page }) => {
  await openOfflineWorkspace(page);
  const put = (mode) => page.evaluate(async (value) => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_mode: value }) }).then((r) => r.status), mode);
  try {
    expect(await put('plan')).toBe(200);
    await page.reload();
    const createResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/orchestrations' && response.request().method() === 'POST');
    await page.getByLabel('Build prompt').fill('Plan a pricing section for this project');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const response = await createResponse;
    expect(response.request().postDataJSON().mode).toBe('plan');
    const created = await response.json();
    await page.getByRole('button', { name: 'Review plan' }).click();   // step 7: the run stays in the Home chat
    const progress = page.getByRole('region', { name: 'Specialist workflow progress' });
    await expect(progress.getByText('Planner', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(progress.getByText('Editor', { exact: true })).toHaveCount(0);
    await expect.poll(async () => page.evaluate(async (id) => fetch(`/api/agents/${id}`).then((r) => r.json()), created.id))
      .toMatchObject({ state: 'planned', actions: [] });
    await expect(page.getByRole('button', { name: 'Approve plan' })).toHaveCount(0);
  } finally {
    await put('base2');
  }
});

test('specialist progress preserves parent plan approval and per-action approval without auto-merge', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  const sideEffects = [];
  let requestId;
  let requestMode;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/orchestrations' && request.method() === 'POST') {
      requestId = request.postDataJSON()?.request_id;
      requestMode = request.postDataJSON()?.mode;
    }
    if (/\/(merge|deploy|pr)$/.test(url.pathname)) sideEffects.push(url.pathname);
  });

  const createResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/orchestrations' && response.request().method() === 'POST');
  await page.getByLabel('Build prompt').fill('Build a small accessible landing page for this project');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const response = await createResponse;
  expect(response.ok()).toBeTruthy();
  const created = await response.json();
  expect(created.id).toBeTruthy();
  expect(requestId).toBeTruthy();

  await page.getByRole('button', { name: 'Review plan' }).click();   // step 7: the run stays in the Home chat
  const progress = page.getByRole('region', { name: 'Specialist workflow progress' });
  await expect(progress).toBeVisible();
  expect(requestMode).toBe('base2');
  for (const role of BASE2_LABELS) {
    await expect(progress.getByText(role, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('status').filter({ hasText: /^Plan approval required$/ })).toBeVisible({ timeout: 15_000 });
  await expect(progress.getByText('Completed', { exact: true })).toHaveCount(BASE2_LABELS.length);
  await expect(page.getByRole('button', { name: 'Approve action 1' })).toHaveCount(0);

  const beforeApproval = await page.evaluate(async (id) => {
    const [agent, files] = await Promise.all([
      fetch(`/api/agents/${id}`).then((response) => response.json()),
      fetch(`/api/agents/${id}/files`).then((response) => response.json()),
    ]);
    return { agent, files };
  }, created.id);
  expect(beforeApproval.agent.state).toBe('needs_plan_approval');
  expect(beforeApproval.agent.actions.length).toBeGreaterThan(0);
  expect(beforeApproval.agent.actions.every((action) => action.status === 'pending')).toBeTruthy();
  expect(beforeApproval.files).toEqual(['README.md']);

  await page.getByRole('button', { name: 'Approve plan' }).click();
  await expect(page.getByRole('button', { name: 'Approve action 1' })).toBeVisible();
  const afterPlanApproval = await page.evaluate(async (id) => fetch(`/api/agents/${id}`).then((response) => response.json()), created.id);
  expect(afterPlanApproval.actions.every((action) => action.status === 'pending')).toBeTruthy();
  expect(sideEffects).toEqual([]);

  await page.getByRole('button', { name: 'Approve action 1' }).click();
  await expect.poll(async () => page.evaluate(async (id) => fetch(`/api/agents/${id}`).then((response) => response.json()), created.id))
    .toMatchObject({ state: 'working' });
  const afterOneAction = await page.evaluate(async (id) => {
    const [agent, files] = await Promise.all([
      fetch(`/api/agents/${id}`).then((response) => response.json()),
      fetch(`/api/agents/${id}/files`).then((response) => response.json()),
    ]);
    return { agent, files };
  }, created.id);
  expect(afterOneAction.agent.actions[0].status).toBe('done');
  expect(afterOneAction.agent.actions.slice(1).every((action) => action.status === 'pending')).toBeTruthy();
  expect(afterOneAction.files).toContain('index.html');
  expect(sideEffects).toEqual([]);
  expect(externalRequests).toEqual([]);
});
