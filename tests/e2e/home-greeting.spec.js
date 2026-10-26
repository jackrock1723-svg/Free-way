import { expect, test } from '@playwright/test';

test('Home is the chat screen: no demo default, no status panel, heading hides once chatting, history reopens, tasks still plan', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-chromium', 'The sidebar (new chat, projects, history) is hidden on small screens by design.');
  test.setTimeout(60_000);
  await page.goto('/');
  // No sample project is auto-selected; only a New project prompt when the user has none.
  await expect(page.getByRole('combobox', { name: 'Active project' })).toHaveCount(0);
  await expect(page.getByText('Create a project so Free way can change files')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fc.project'))).toBeNull();
  await expect(page.getByRole('complementary', { name: 'Workspace status' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Chat', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Free way', exact: true })).toBeVisible();

  // A greeting becomes a conversation on Home; the heading disappears.
  await page.getByLabel('Build prompt').fill('hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const convo = page.locator('.home-messages');
  await expect(convo).toContainText('hi');
  await expect(convo.locator('.message-assistant p')).not.toHaveText(/^(Thinking\u2026)?$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Free way', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // New chat brings the heading back; the earlier chat reopens from the sidebar history.
  await page.getByRole('button', { name: 'Start a new chat' }).click();
  await expect(page.getByRole('heading', { name: 'Free way', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  await page.locator('.chat-history-open', { hasText: 'hi' }).first().click();
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.home-messages')).toContainText('hi');

  // With a real project chosen, a task still starts the plan/approve flow.
  await page.evaluate(() => localStorage.setItem('fc.project', 'demo'));
  await page.reload();
  await page.getByRole('button', { name: 'Start a new chat' }).click();
  await page.getByLabel('Build prompt').fill('Build a small hello page');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Plan approval required$/ })).toBeVisible({ timeout: 20_000 });
  const agents = await (await page.request.get('/api/agents')).json();
  for (const a of agents.filter((x) => x.state === 'orchestrating')) await page.request.post(`/api/orchestrations/${a.id}/cancel`, { data: {} });
  for (const a of agents.filter((x) => String(x.state).startsWith('needs_'))) await page.request.post(`/api/agents/${a.id}/reject`, { data: {} });
  await page.evaluate(() => localStorage.removeItem('fc.project'));
});
