import { expect, test } from '@playwright/test';

// Uses the built-in demo sample project (no longer the default) so a project with history exists.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

test('sidebar: new chat, projects with their chat history, open a chat, profile/session area, collapse', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-chromium', 'The sidebar (new chat, projects, history) is hidden on small screens by design.');
  await page.goto('/');
  const side = page.getByRole('complementary', { name: 'Free way workspace' });
  await expect(side.getByRole('button', { name: 'Start a new chat' })).toBeVisible();
  await expect(side.getByRole('button', { name: 'Start a new project' })).toBeVisible();
  const projects = side.getByRole('region', { name: 'Projects' });
  await expect(projects.locator('.sidebar-project-name').first()).toBeVisible();
  await expect(projects.locator('.sidebar-project.is-current')).toHaveCount(1);
  await expect(side.getByRole('button', { name: 'Profile' })).toBeVisible();
  await expect(side.locator('.sidebar-session')).toContainText(/sessions/);

  // New chat -> send a message -> it shows under the current project and reopens from the sidebar
  await side.getByRole('button', { name: 'Start a new chat' }).click();
  await page.getByLabel('Build prompt').fill('hello there');
  await page.getByRole('button', { name: 'Build' }).click();
  const item = projects.locator('.sidebar-chat', { hasText: 'hello there' });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Home', exact: true }).click();
  await item.click();
  await expect(page.getByRole('region', { name: 'Conversation' }).or(page.locator('.home-messages'))).toContainText('hello there');
  await expect(item).toHaveClass(/is-current/);

  // New project opens the existing dialog
  await side.getByRole('button', { name: 'Start a new project' }).click();
  await expect(page.getByRole('dialog', { name: 'New project' })).toBeVisible();
  await page.keyboard.press('Escape');
  if (await page.getByRole('dialog', { name: 'New project' }).isVisible()) await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();

  // Profile opens Me; collapse hides labels and persists
  await side.getByRole('button', { name: 'Profile' }).click();
  await expect(page.locator('[data-view="me"]')).toBeVisible();
  await side.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.locator('.workspace-shell')).toHaveClass(/sidebar-collapsed/);
  await expect(projects).toBeHidden();
  await page.reload();
  await expect(page.locator('.workspace-shell')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(projects).toBeVisible();
});