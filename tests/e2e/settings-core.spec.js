import { expect, test } from '@playwright/test';

// This spec exercises the built-in demo sample project, which is no longer selected by default.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

const DEFAULT_SHORTCUTS = {
  toggle_sidebar: 'Ctrl+B',
  toggle_terminal: 'Ctrl+`',
  toggle_right_panel: 'Ctrl+Alt+B',
  search_chats: 'Ctrl+K',
  open_settings: 'Ctrl+,',
  open_project: 'Ctrl+O',
  new_chat: 'Ctrl+T',
  close_tab: 'Ctrl+W',
  next_tab: 'Ctrl+Tab',
  previous_tab: 'Ctrl+Shift+Tab',
  reopen_tab: 'Ctrl+Shift+T',
};

const THEMES = [
  'Auto', 'Dark', 'Light', 'OG Shine', 'Alpine', 'Dune', 'Tide', 'Blossom', 'Orbit',
  'After rain', 'Ember', 'Kanagawa', 'Aurora', 'Violet hour', 'Phosphor', 'Mirage',
  'Nebula', 'Frost', 'Paper', 'Carbon',
];

const SHORTCUT_ROWS = [
  ['Toggle left sidebar', 'Ctrl+B'],
  ['Toggle bottom terminal', 'Ctrl+`'],
  ['Toggle right panel', 'Ctrl+Alt+B'],
  ['Search chats', 'Ctrl+K'],
  ['Open settings', 'Ctrl+,'],
  ['Open project', 'Ctrl+O'],
  ['New chat', 'Ctrl+T'],
  ['Close tab', 'Ctrl+W'],
  ['Next tab', 'Ctrl+Tab'],
  ['Previous tab', 'Ctrl+Shift+Tab'],
  ['Reopen closed tab', 'Ctrl+Shift+T'],
];

async function mockSettingsApi(page) {
  const state = {
    preferences: {},
    projects: new Map(),
    globalUpdates: [],
    projectUpdates: [],
    failNextGlobalWrite: false,
  };
  page.task7SettingsState = state;
  const respond = (route, status, body) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/api/settings/projects/**', async (route) => {
    const request = route.request();
    const projectId = decodeURIComponent(new URL(request.url()).pathname.split('/').pop());
    const projectPreferences = state.projects.get(projectId) || {};
    if (request.method() === 'GET') {
      await respond(route, 200, { schema_version: 1, preferences: projectPreferences });
      return;
    }
    if (request.method() === 'PUT') {
      const patch = request.postDataJSON();
      if (Object.keys(patch).some((key) => key !== 'startup_command') || typeof patch.startup_command !== 'string' || patch.startup_command.length > 2000) {
        await respond(route, 400, { error: 'Project settings contain an invalid value.' });
        return;
      }
      state.projectUpdates.push({ projectId, patch });
      const next = { ...projectPreferences, ...patch };
      state.projects.set(projectId, next);
      await respond(route, 200, { schema_version: 1, preferences: next });
      return;
    }
    await respond(route, 405, { error: 'Method not allowed.' });
  });

  await page.route('**/api/settings', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await respond(route, 200, { schema_version: 1, preferences: state.preferences });
      return;
    }
    if (request.method() === 'PUT') {
      const patch = request.postDataJSON();
      if (state.failNextGlobalWrite) {
        state.failNextGlobalWrite = false;
        await respond(route, 503, { error: 'Settings could not be saved. Try again.' });
        return;
      }
      state.globalUpdates.push(patch);
      state.preferences = { ...state.preferences, ...patch };
      await respond(route, 200, { schema_version: 1, preferences: state.preferences });
      return;
    }
    await respond(route, 405, { error: 'Method not allowed.' });
  });
  return state;
}

async function openSettings(page, section = 'General') {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  if (section !== 'General') {
    await page.getByRole('button', { name: section, exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
}

function themeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function themeContrast(page) {
  return page.locator('.workspace-shell').evaluate((root) => {
    const css = getComputedStyle(root);
    const parse = (value) => {
      const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
      if (hex) {
        const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
        return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
      }
      const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
    };
    const luminance = (color) => {
      const channels = parse(color);
      if (!channels) return null;
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const background = luminance(css.getPropertyValue('--canvas'));
    const foreground = luminance(css.getPropertyValue('--text'));
    const muted = luminance(css.getPropertyValue('--muted'));
    return {
      text: (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05),
      muted: (Math.max(background, muted) + 0.05) / (Math.min(background, muted) + 0.05),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await mockSettingsApi(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('General shows only settings with a real effect, and Agent mode saves and reloads', async ({ page }) => {
  await openSettings(page);
  for (const name of ['Advanced Mode', 'Notification sounds', 'Automatically start the next session', 'Include AGENTS.md', 'Pre-sync projects to Cloud', 'Full access', 'Mirror to my phone', 'Show in Discord status']) {
    await expect(page.getByRole('checkbox', { name })).toHaveCount(0);
  }
  await expect(page.getByLabel('Local chat auto-archive')).toHaveCount(0);
  await expect(page.getByLabel('Cloud chat auto-archive')).toHaveCount(0);
  await expect(page.getByText(/saved preference/i)).toHaveCount(0);
  await expect(page.getByText(/Default: all specialists, balanced\. Lite: .* Max: .* Plan: plans only, never writes files\./)).toBeVisible();
  await page.getByLabel('Agent mode').selectOption('lite');
  await expect(page.getByTestId('settings-save-status')).toContainText('Saved');
  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel('Agent mode')).toHaveValue('lite');
});

test('a failed General settings save rolls the control back and shows an error', async ({ page }) => {
  const state = page.task7SettingsState;
  await openSettings(page);
  state.failNextGlobalWrite = true;
  await page.getByLabel('Agent mode').selectOption('max');
  await expect(page.getByLabel('Agent mode')).not.toHaveValue('max');
  await expect(page.getByRole('alert')).toContainText('Settings could not be saved');
});

test('Appearance styles, filters, and every preset apply and persist after reload', async ({ page }) => {
  await openSettings(page, 'Appearance');
  const root = page.locator('.workspace-shell');
  const styleGroup = page.getByRole('group', { name: 'Appearance style' });

  for (const style of ['Flat', '3D', 'Shine']) {
    await styleGroup.getByRole('button', { name: style, exact: true }).click();
    await expect(styleGroup.getByRole('button', { name: style, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(root).toHaveAttribute('data-appearance-style', style.toLowerCase());
    await expect(page.getByTestId('settings-save-status')).toContainText('Saved');
    await page.reload();
    await openSettings(page, 'Appearance');
    await expect(page.getByRole('group', { name: 'Appearance style' }).getByRole('button', { name: style, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }

  const filter = page.getByRole('group', { name: 'Theme filter' });
  await filter.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Carbon', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paper', exact: true })).toHaveCount(0);
  await filter.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Paper', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Carbon', exact: true })).toHaveCount(0);
  await filter.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByText(/gradients are unavailable.*no gradient assets/i)).toBeVisible();
  const presets = page.getByRole('group', { name: 'Color presets' });

  for (const theme of THEMES) {
    await presets.getByRole('button', { name: theme, exact: true }).click();
    await expect(presets.getByRole('button', { name: theme, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(root).toHaveAttribute('data-theme', themeSlug(theme));
    await expect(page.getByTestId('settings-save-status')).toContainText('Saved');
    await page.reload();
    await openSettings(page, 'Appearance');
    await expect(page.getByRole('group', { name: 'Color presets' }).getByRole('button', { name: theme, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('appearance controls remain labeled, low-motion, readable, and inside a 390 by 844 viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSettings(page, 'Appearance');
  await expect(page.getByRole('group', { name: 'Appearance style' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Theme filter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paper', exact: true })).toBeVisible();

  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    const selectedNavContrast = await page.getByRole('button', { name: 'Settings', exact: true }).evaluate((button) => {
      const parse = (color) => {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        return match ? match.slice(1, 4).map(Number) : null;
      };
      const luminance = (color) => color.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const style = getComputedStyle(button);
      const foreground = parse(style.color);
      const background = parse(style.backgroundColor);
      if (!foreground || !background) return 0;
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    });
    expect(selectedNavContrast).toBeGreaterThanOrEqual(4.5);
  }

  const ratios = await themeContrast(page);
  expect(ratios.text).toBeGreaterThanOrEqual(4.5);
  expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
  const motion = await page.getByRole('button', { name: 'Paper', exact: true }).evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Math.max(...motion.split(',').map((value) => Number.parseFloat(value.trim())))).toBeLessThanOrEqual(0.001);
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);

  await page.getByRole('button', { name: 'Paper', exact: true }).click();
  const lightRatios = await themeContrast(page);
  expect(lightRatios.text).toBeGreaterThanOrEqual(4.5);
  expect(lightRatios.muted).toBeGreaterThanOrEqual(4.5);
});

test('keyboard shortcuts expose every documented action, reject collisions, reset, and execute supported bindings', async ({ page }) => {
  await openSettings(page, 'Keyboard shortcuts');
  const rows = page.getByRole('row');
  await expect(rows).toHaveCount(SHORTCUT_ROWS.length + 1); // Header plus all documented shortcuts.
  for (const [label, chord] of SHORTCUT_ROWS) {
    const row = page.getByRole('row', { name: new RegExp(label, 'i') });
    await expect(row).toContainText(chord);
    if (label === 'Open settings') {
      await expect(row.getByRole('button', { name: /Change shortcut/i })).toBeEnabled();
    } else {
      await expect(row.getByRole('button', { name: /Change shortcut/i })).toBeDisabled();
      await expect(row).toContainText(/unavailable|browser-reserved/i);
    }
  }

  const openSettingsRow = page.getByRole('row', { name: /Open settings/i });
  const change = openSettingsRow.getByRole('button', { name: /Change shortcut/i });
  await change.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Alt+Shift+S');
  await expect(openSettingsRow).toContainText('Alt+Shift+S');
  await expect(page.getByTestId('settings-save-status')).toContainText('Saved');

  await change.click();
  await page.keyboard.press('Control+B');
  await expect(page.getByRole('alert')).toContainText(/already assigned to Toggle left sidebar/i);
  await expect(openSettingsRow).toContainText('Alt+Shift+S');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.keyboard.press('Alt+Shift+S');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await openSettings(page, 'Keyboard shortcuts');
  await page.getByRole('button', { name: 'Reset all' }).click();
  await expect(openSettingsRow).toContainText('Ctrl+,');
  await expect(page.getByTestId('settings-save-status')).toContainText('Saved');
  await page.reload();
  await openSettings(page, 'Keyboard shortcuts');
  await expect(page.getByRole('row', { name: /Open settings/i })).toContainText('Ctrl+,');
});

test('Project settings show supported scope, default install safety, and inert startup text with Save and Reset', async ({ page }) => {
  const state = page.task7SettingsState;
  const agentPosts = [];
  await page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/agents' && request.method() === 'POST') agentPosts.push(request);
  });
  await openSettings(page, 'Project settings');

  await expect(page.getByRole('button', { name: 'This computer' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Cloud' })).toBeDisabled();
  await expect(page.getByText(/cloud project storage is not configured/i)).toBeVisible();
  await expect(page.getByLabel('Dependency install policy')).toHaveValue('ask');

  const command = page.getByLabel('Startup command');
  await expect(command).toHaveValue('');
  await command.fill('npm run dev');
  await page.getByRole('button', { name: 'Save startup command' }).click();
  await expect(page.getByTestId('project-settings-save-status')).toContainText('Saved');
  expect(state.projectUpdates.at(-1)).toEqual({ projectId: 'demo', patch: { startup_command: 'npm run dev' } });
  expect(agentPosts).toHaveLength(0);

  await page.reload();
  await openSettings(page, 'Project settings');
  await expect(page.getByLabel('Startup command')).toHaveValue('npm run dev');
  await page.getByRole('button', { name: 'Reset startup command' }).click();
  await expect(page.getByLabel('Startup command')).toHaveValue('');
  expect(state.projectUpdates.at(-1)).toEqual({ projectId: 'demo', patch: { startup_command: '' } });

  const updateCount = state.projectUpdates.length;
  await page.getByLabel('Startup command').fill('x'.repeat(2001));
  await page.getByRole('button', { name: 'Save startup command' }).click();
  await expect(page.getByRole('alert')).toContainText(/2,000 characters/i);
  expect(state.projectUpdates).toHaveLength(updateCount);
  expect(agentPosts).toHaveLength(0);
});
