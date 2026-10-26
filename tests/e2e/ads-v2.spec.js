import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// This spec exercises the built-in demo sample project, which is no longer selected by default.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

const AD = {
  id: 'imp-e2e-1', sig: 'sig-e2e', label: 'Sponsored', advertiser: 'Tablestack', title: 'A free Postgres in 10 seconds',
  text: 'Branching databases for every agent run.', url: 'https://example.com/tablestack', placement: 'chat', category: 'databases',
  why: "Matched to your current task and your project's stack (React, Postgres): databases. Not personalised.",
};

test('chat shows a closable sponsored card after a reply without blocking the composer', async ({ page }) => {
  const events = [];
  await page.route('**/api/ads/next', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ad: AD }) }));
  await page.route('**/api/ads/event', async (route) => {
    events.push(route.request().postDataJSON().kind);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  await page.getByLabel('New message').fill('Which database should I use for my app?');
  await page.getByRole('button', { name: 'Send' }).click();
  const card = page.getByRole('complementary', { name: 'Sponsored' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: AD.title })).toBeVisible();
  await card.getByRole('button', { name: 'Why this ad?' }).click();
  await expect(card.getByRole('note')).toContainText("project's stack");
  await expect(page.getByLabel('New message')).toBeEnabled();
  await card.getByRole('button', { name: 'Close ad' }).click();
  await expect(page.getByRole('complementary', { name: 'Sponsored' })).toHaveCount(0);
  await expect.poll(() => events).toEqual(['view', 'close']);
});

test('an ad failure never shows an error to the user', async ({ page }) => {
  await page.route('**/api/ads/next', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  await page.getByLabel('New message').fill('hello there');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.message-assistant').last()).not.toHaveText(/Thinking/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Sponsored' })).toHaveCount(0);
});

test('Ads & privacy settings show the notice and every control works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Ads & privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ads & privacy' })).toBeVisible();
  await expect(page.getByTestId('ads-privacy-notice')).toContainText('never sent to an ad network');
  const box = page.getByLabel(/Use my project's stack/);
  await expect(box).toBeChecked();
  await box.click();
  await expect(page.getByText('Stack-based ads are off. Only your current task is used.')).toBeVisible();
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(page.getByText('Stack-based ads are on.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('free-way-ad-data.json');
  expect(JSON.parse(readFileSync(await file.path(), 'utf8')).consent.use_stack).toBe(await box.isChecked());   // download matches the checkbox
  await expect(page.getByTestId('ads-download-help')).toContainText('interest categories and ad counts only')
  await page.getByRole('button', { name: 'Delete my ad data' }).click();
  await expect(page.getByText('Your ad data was deleted.')).toBeVisible();
});
