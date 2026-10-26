import { expect, test } from '@playwright/test';

// Step 4 composer: every control reaches its real effect or is honestly disabled. Desktop only; one mobile layout check.
test.skip(({ isMobile }) => isMobile, 'desktop composer checks; the mobile check sets its own viewport');

async function open(page, project = '') {
  await page.addInitScript((value) => { localStorage.setItem('fc.project', value); }, project);
  await page.route('**/*', (route) => { const h = new URL(route.request().url()).hostname; return h === '127.0.0.1' || h === 'localhost' ? route.fallback() : route.abort(); });
  await page.goto('/');
  await expect(page.getByLabel('Build prompt')).toBeVisible();
}

async function idle(page) {
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const agents = await (await fetch('/api/agents')).json();
      const busy = Array.isArray(agents) ? agents.filter((a) => a.state === 'orchestrating') : [];
      for (const a of busy) await fetch(`/api/orchestrations/${a.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return busy.length;
    });
  }, { timeout: 20_000 }).toBe(0);
}

test('composer layout: modes, free models only, location label, honest + button', async ({ page }) => {
  await open(page);
  const box = page.getByRole('form', { name: 'Composer' });
  await expect(box).toHaveCSS('border-top-left-radius', '24px');
  await expect(page.getByLabel('Build prompt')).toHaveAttribute('placeholder', 'Type a message — / for commands, @ for threads or files');
  await expect(page.getByRole('radio', { name: 'Build' })).toBeChecked();
  for (const name of ['Plan', 'Mission', 'Skills']) await expect(page.getByRole('radio', { name })).toHaveCount(1);
  const names = await page.getByLabel('Model').locator('option').allTextContents();
  expect(names).toEqual(['Free way Auto', 'GLM 5.3', 'DeepSeek V4.1 Flash', 'Nemotron 3 Ultra', 'Laguna S 2.1', 'MiniMax M3.1 Flash', 'Nemotron 3.5 Lightning']);
  const plus = page.getByRole('button', { name: 'Attach file' });
  await expect(plus).toBeDisabled();
  await expect(plus).toHaveAttribute('title', 'Not available yet');
  const cfg = await (await page.request.get('/api/config')).json();
  await expect(page.locator('.composer-location')).toHaveText(cfg.mode === 'cloud' ? 'Cloud' : 'Local');
});

test('Build and Plan start real orchestrations with the chosen free model', async ({ page }) => {
  await open(page, 'demo');
  const posted = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/orchestrations' && r.method() === 'POST') posted.push(r.postDataJSON()); });
  await page.getByLabel('Model').selectOption('craft');
  await page.getByRole('radio', { name: 'Plan' }).check();
  await page.getByLabel('Build prompt').fill('Plan a pricing section');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toMatchObject({ project: 'demo', mode: 'plan', model: 'craft' });
  await idle(page);
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await page.getByRole('radio', { name: 'Build' }).check();
  await page.getByLabel('Build prompt').fill('Add a short welcome line to index.html');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1].mode).not.toBe('plan');
  expect(posted[1].model).toBe('craft');
  await idle(page);
});

test('Mission uses the existing mission flow', async ({ page }) => {
  await open(page, 'demo');
  const req = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/agents' && r.method() === 'POST');
  await page.getByRole('radio', { name: 'Mission' }).check();
  await page.getByLabel('Build prompt').fill('Create a mission workspace');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect((await req).postDataJSON()).toMatchObject({ project: 'demo', mission: true });
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
  await idle(page);
});

test('Skills sends the chosen skill text with the chat request', async ({ page }) => {
  await page.route('**/api/settings/skills', (route) => route.fulfill({ json: { available: true, skills: [{ id: 'tidy', name: 'Tidy', description: 'd', source: 'local' }] } }));
  await page.route('**/api/settings/skills/tidy', (route) => route.fulfill({ json: { available: true, skill: { id: 'tidy', name: 'Tidy', description: 'd', source: 'local', instructions: 'Always answer in one line.' } } }));
  await open(page);
  const req = page.waitForRequest((r) => new URL(r.url()).pathname.startsWith('/api/chat') && r.method() === 'POST');
  await page.getByRole('radio', { name: 'Skills' }).check();
  await expect(page.getByLabel('Skill', { exact: true })).toHaveValue('tidy');
  await page.getByLabel('Build prompt').fill('hello');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const body = (await req).postDataJSON();
  expect(body.files[0]).toMatchObject({ kind: 'skill', text: 'Always answer in one line.' });
});

test('Skills is disabled with a reason when no skills exist', async ({ page }) => {
  await page.route('**/api/settings/skills', (route) => route.fulfill({ json: { available: false, reason: 'No local skills source is configured.', skills: [] } }));
  await open(page);
  await expect(page.getByRole('radio', { name: 'Skills' })).toBeDisabled();
  await expect(page.locator('.composer-mode', { hasText: 'Skills' })).toHaveAttribute('title', 'No local skills source is configured.');
});

test('busy composer queues messages in order, Send turns into Stop and Stop aborts', async ({ page }) => {
  const sent = [];
  await page.route('**/api/chat/stream', async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body.messages[body.messages.length - 1].content);
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  });
  await open(page);
  const input = page.getByLabel('Build prompt');
  await input.fill('first');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(input).toHaveAttribute('placeholder', 'Type a message — added to the queue');
  await input.fill('second');
  await input.press('Enter');
  await expect(page.getByText('1 queued')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Stopped.')).toBeVisible();
  await expect.poll(() => sent, { timeout: 10_000 }).toEqual(['first', 'second']);
  await expect(page.getByText('1 queued')).toHaveCount(0);
});

test('ad strip sits above the composer with the Freebuff sizes and closes', async ({ page }) => {
  await page.route('**/api/ads/next', (route) => route.fulfill({ json: { ad: { id: 'imp1', sig: 's', title: 'Ship static sites', text: 'Free tier with global CDN.', url: 'https://northwind.example/', advertiser: 'Northwind Hosting', label: 'Sponsored' } } }));
  await page.route('**/api/ads/event', (route) => route.fulfill({ json: { ok: true } }));
  await open(page);
  await page.getByLabel('Build prompt').fill('hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const strip = page.locator('.ad-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  const [s, c] = [await strip.boundingBox(), await page.getByRole('form', { name: 'Composer' }).boundingBox()];
  expect(s.y + s.height).toBeLessThanOrEqual(c.y);
  expect(s.width).toBeLessThanOrEqual(720);
  await expect(page.locator('.ad-strip-icon')).toHaveCSS('width', '16px');
  await expect(page.locator('.ad-strip-title')).toHaveCSS('font-size', '13px');
  await expect(page.locator('.ad-strip-line')).toHaveCSS('font-size', '12px');
  await expect(page.locator('.ad-strip-line')).toContainText('Ad · northwind.example');
  await page.getByRole('button', { name: 'Close ad' }).click();
  await expect(strip).toHaveCount(0);
});

test('mobile: composer fits the screen with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const c = await page.getByRole('form', { name: 'Composer' }).boundingBox();
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
});