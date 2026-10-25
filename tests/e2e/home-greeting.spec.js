import { expect, test } from '@playwright/test';

test('Home: a greeting gets an inline chat reply (saved to Chat history); a real task still starts a plan', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByLabel('Build prompt').fill('hi');
  await page.getByRole('button', { name: 'Build' }).click();
  const reply = page.getByRole('region', { name: 'Free way reply' });
  await expect(reply).toBeVisible();
  await expect(reply.locator('.home-reply-answer')).not.toHaveText(/^(Thinking\u2026)?$/, { timeout: 20_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Build prompt')).toHaveValue('');
  await reply.getByRole('button', { name: 'Continue in Chat' }).click();
  await expect(page.locator('.chat-history-row').filter({ hasText: 'hi' }).first()).toBeVisible();

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByLabel('Build prompt').fill('Build a small hello page');
  await page.getByRole('button', { name: 'Build' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Plan approval required$/ })).toBeVisible({ timeout: 20_000 });
  // leave the shared server idle
  const agents = await (await page.request.get('/api/agents')).json();
  for (const a of agents.filter((x) => x.state === 'orchestrating')) await page.request.post(`/api/orchestrations/${a.id}/cancel`, { data: {} });
  for (const a of agents.filter((x) => String(x.state).startsWith('needs_'))) await page.request.post(`/api/agents/${a.id}/reject`, { data: {} });
});
