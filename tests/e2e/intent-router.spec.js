import { expect, test } from '@playwright/test';

// Step 5: inside a project, Build mode answers questions in chat (with a Start build offer) and only real tasks start a plan.
test.skip(({ isMobile }) => isMobile, 'desktop check');

async function open(page) {
  await page.addInitScript(() => { localStorage.setItem('fc.project', 'demo'); });
  await page.route('**/*', (route) => { const h = new URL(route.request().url()).hostname; return h === '127.0.0.1' || h === 'localhost' ? route.fallback() : route.abort(); });
  await page.goto('/');
  await expect(page.getByLabel('Build prompt')).toBeVisible();
}

async function idle(page) {
  await expect.poll(() => page.evaluate(async () => {
    const agents = await (await fetch('/api/agents')).json();
    const busy = Array.isArray(agents) ? agents.filter((a) => a.state === 'orchestrating') : [];
    for (const a of busy) await fetch(`/api/orchestrations/${a.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return busy.length;
  }), { timeout: 20_000 }).toBe(0);
}

test('a question gets a chat reply with Start build, and no build starts on its own', async ({ page }) => {
  test.setTimeout(60_000);
  const orchestrations = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/orchestrations' && r.method() === 'POST') orchestrations.push(r.postDataJSON()); });
  await open(page);
  await page.getByLabel('Build prompt').fill('what does this project do?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const offer = page.getByRole('button', { name: 'Start task', exact: true });
  await expect(offer).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.home-messages .message-assistant').last()).not.toHaveText(/Thinking/);
  expect(orchestrations).toHaveLength(0);
  await offer.click();
  await page.getByRole('button', { name: 'Review plan' }).click();   // step 7: the run stays in the Home chat
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
  await expect.poll(() => orchestrations.length).toBe(1);
  expect(orchestrations[0]).toMatchObject({ project: 'demo', mode: 'plan', prompt: 'what does this project do?' });
  await idle(page);
});

test('a clear task starts a build that stops at Plan approval required', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.getByLabel('Build prompt').fill('Add a short welcome line to index.html');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Review plan' }).click();   // step 7: the run stays in the Home chat
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
  await expect(page.locator('.state-badge').first()).toHaveText('Plan approval required', { timeout: 60_000 });
  await idle(page);
});