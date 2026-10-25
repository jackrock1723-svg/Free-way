import { expect, test } from '@playwright/test';

// This spec exercises the built-in demo sample project, which is no longer selected by default.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

function makeAgent() {
  return {
    id: 'task12-agent',
    project: 'demo',
    title: 'Locked dependency setup',
    prompt: 'Use the project lockfile',
    model: 'auto',
    state: 'needs_plan_approval',
    policy: 'ask',
    plan: { summary: 'Install the existing locked dependencies.', steps: ['Review the lockfile', 'Run the approved local install'] },
    actions: [{
      type: 'run_command',
      command: 'npm ci --ignore-scripts',
      status: 'pending',
      risk: 'command',
      attempts: 0,
    }],
    fix_round: 0,
    checks: null,
  };
}

async function boot(page) {
  const state = {
    projectPreferences: {},
    agent: makeAgent(),
    runtimeReads: 0,
    actionApprovals: 0,
  };
  page.task12State = state;

  await page.route('**/api/settings/projects/**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { schema_version: 1, preferences: state.projectPreferences } });
      return;
    }
    if (request.method() === 'PUT') {
      const patch = request.postDataJSON();
      if (Object.keys(patch).some((key) => !['startup_command', 'dependency_install_policy', 'auto_fix'].includes(key))) {
        await route.fulfill({ status: 400, json: { error: 'Project settings contain an invalid value.' } });
        return;
      }
      state.projectPreferences = { ...state.projectPreferences, ...patch };
      await route.fulfill({ json: { schema_version: 1, preferences: state.projectPreferences } });
      return;
    }
    await route.fulfill({ status: 405, json: { error: 'Method not allowed.' } });
  });

  await page.route(/\/api\/projects\/demo\/runtimes$/, async (route) => {
    state.runtimeReads += 1;
    await route.fulfill({ json: { runtimes: [
      { language: 'Node.js', marker: 'package.json', toolchain: 'node', available: true },
      { language: 'Python', marker: 'pyproject.toml', toolchain: 'python', available: false },
    ] } });
  });

  await page.route(/\/api\/agents\/task12-agent(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/approve_plan') && request.method() === 'POST') {
      state.agent = { ...state.agent, state: 'working' };
      await route.fulfill({ json: state.agent });
      return;
    }
    if (path.endsWith('/actions/0/approve') && request.method() === 'POST') {
      state.actionApprovals += 1;
      state.agent = { ...state.agent, actions: [{ ...state.agent.actions[0], status: 'running' }] };
      await route.fulfill({ json: state.agent });
      return;
    }
    if (path === '/api/agents/task12-agent' && request.method() === 'GET') {
      await route.fulfill({ json: state.agent });
      return;
    }
    await route.fulfill({ status: 404, json: { error: 'not found' } });
  });

  await page.route(/\/api\/agents\/?$/, async (route) => {
    await route.fulfill({ json: [state.agent] });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
}

async function openProjectSettings(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project settings', exact: true })).toBeVisible();
  await expect(page.getByTestId('project-settings-save-status')).toContainText('No unsaved changes');
}

test.beforeEach(async ({ page }) => {
  await boot(page);
});

test('dependency installs default to Ask; Never and project-local opt-in save independently; automatic repair defaults off', async ({ page }) => {
  await openProjectSettings(page);

  const policy = page.getByLabel('Dependency install policy');
  const autoFix = page.getByRole('checkbox', { name: 'Automatic repair' });
  await expect(policy).toHaveValue('ask');
  await expect(policy.locator('option')).toHaveText([
    'Ask every time',
    'Never install dependencies',
    'Allow project-local lockfile installs',
  ]);
  await expect(autoFix).not.toBeChecked();
  await expect(page.getByText(/scripts are disabled.*lockfile/i)).toBeVisible();
  await expect(page.getByText(/repairs remain bounded.*approved/i)).toBeVisible();

  await policy.selectOption('never');
  await expect(page.getByTestId('project-settings-save-status')).toContainText('Saved on this device');
  expect(page.task12State.projectPreferences.dependency_install_policy).toBe('never');

  await policy.selectOption('project-local');
  await expect(page.getByTestId('project-settings-save-status')).toContainText('Saved on this device');
  expect(page.task12State.projectPreferences.dependency_install_policy).toBe('project-local');
  await autoFix.check();
  await expect(page.getByTestId('project-settings-save-status')).toContainText('Saved on this device');
  expect(page.task12State.projectPreferences.auto_fix).toBe(true);

  await page.reload();
  await openProjectSettings(page);
  await expect(page.getByLabel('Dependency install policy')).toHaveValue('project-local');
  await expect(page.getByRole('checkbox', { name: 'Automatic repair' })).toBeChecked();
});

test('runtime detection distinguishes installed and missing tools while command approval remains explicit', async ({ page }) => {
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Locked dependency setup' })).toBeVisible();

  const runtimes = page.getByRole('region', { name: 'Detected runtimes' });
  await expect(runtimes).toContainText('Node.js');
  await expect(runtimes).toContainText('Installed');
  await expect(runtimes).toContainText('Python');
  await expect(runtimes).toContainText('Not installed');
  await expect(runtimes).toContainText('No compiler or package manager is downloaded automatically');
  await expect(page.getByText('Plan approval required. No action has started.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve action 1' })).toHaveCount(0);
  expect(page.task12State.runtimeReads).toBeGreaterThan(0);
  expect(page.task12State.actionApprovals).toBe(0);

  await page.getByRole('button', { name: 'Approve plan' }).click();
  await expect(page.getByRole('button', { name: 'Approve action 1' })).toBeVisible();
  expect(page.task12State.actionApprovals).toBe(0);
  await page.getByRole('button', { name: 'Approve action 1' }).click();
  await expect.poll(() => page.task12State.actionApprovals).toBe(1);
});
