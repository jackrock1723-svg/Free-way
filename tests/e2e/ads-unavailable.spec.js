import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const legacyDirectory = path.join(repositoryRoot, 'web');
const legacyAssets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/phone.js': ['phone.js', 'text/javascript; charset=utf-8'],
  '/google-signin.js': ['google-signin.js', 'text/javascript; charset=utf-8'],
};

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

async function openLegacyWorkspace(page) {
  const externalRequests = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      externalRequests.push(url.origin);
      await route.abort();
      return;
    }
    const asset = legacyAssets[url.pathname];
    if (asset) {
      await route.fulfill({
        status: 200,
        contentType: asset[1],
        body: fs.readFileSync(path.join(legacyDirectory, asset[0]), 'utf8'),
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  return externalRequests;
}

test('unconfigured ads stay unavailable and stored consent data remains manageable', async ({ page }) => {
  const externalRequests = await openOfflineWorkspace(page);
  const result = await page.evaluate(async () => {
    const consentResponse = await fetch('/api/ads/consent');
    const consent = await consentResponse.json();
    const adResponse = await fetch('/api/ads/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'deploy and test a server', state: 'review' }),
    });
    const ad = await adResponse.json();
    const optInResponse = await fetch('/api/ads/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalized: true, version: consent.current_version }),
    });
    const optIn = await optInResponse.json();
    const withdrawResponse = await fetch('/api/ads/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalized: false }),
    });
    const withdrawn = await withdrawResponse.json();
    const exportResponse = await fetch('/api/ads/data');
    const exported = await exportResponse.json();
    const eraseResponse = await fetch('/api/ads/data', { method: 'DELETE' });
    const erased = await eraseResponse.json();
    const revenueResponse = await fetch('/api/admin/revenue');
    const revenue = await revenueResponse.json();
    return {
      consentStatus: consentResponse.status,
      consent,
      adStatus: adResponse.status,
      ad,
      optInStatus: optInResponse.status,
      optIn,
      withdrawStatus: withdrawResponse.status,
      withdrawn,
      exportStatus: exportResponse.status,
      exported,
      eraseStatus: eraseResponse.status,
      erased,
      revenueStatus: revenueResponse.status,
      revenue,
    };
  });

  expect(result.consentStatus).toBe(200);
  expect(result.consent.available).toBe(false);
  expect(result.consent.benefits).toBeNull();
  expect(result.consent.credits).toBeNull();
  expect(result.consent.bonus_daily_runs).toBeNull();
  expect(result.consent.text).not.toMatch(/bonus free credits|extra free runs/i);
  expect(result.adStatus).toBe(200);
  expect(result.ad.ad).toBeNull();
  expect(result.optInStatus).toBe(400);
  expect(result.optIn.error).toMatch(/unavailable/i);
  expect(result.withdrawStatus).toBe(200);
  expect(result.withdrawn.personalized).toBe(false);
  expect(result.exportStatus).toBe(200);
  expect(result.exported).toHaveProperty('consent');
  expect(result.eraseStatus).toBe(200);
  expect(result.erased.personalized).toBe(false);
  expect(result.revenueStatus).toBe(200);
  expect(result.revenue.available).toBe(false);
  expect(result.revenue.revenue_usd).toBeNull();
  expect(externalRequests).toEqual([]);
});

test('legacy ads settings show unavailable without rewards and preserve data controls', async ({ page }) => {
  const externalRequests = await openLegacyWorkspace(page);
  await page.locator('button[data-go="settings"]:visible').first().click();

  await expect(page.locator('#adstate')).toHaveText('Unavailable');
  await expect(page.locator('#adconsent')).toContainText('No publisher is configured, so ads and rewards are not served');
  await expect(page.locator('#adexport')).toBeVisible();
  await expect(page.locator('#aderase')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review and turn on' })).toHaveCount(0);
  await expect(page.locator('#credits')).toHaveCount(0);
  await expect(page.getByText(/bonus free credits|extra free runs/i)).toHaveCount(0);
  await expect(page.getByText('Unavailable until an ad publisher is configured.')).toBeVisible();
  expect(externalRequests).toEqual(['https://fonts.googleapis.com']);
});
