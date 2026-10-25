import { expect, test } from '@playwright/test';

const PAGES = ['Home', 'Board', 'Chat', 'Apps', 'Preview', 'Me', 'Settings'];
const ADMIN_TOKEN = 'fw-e2e-admin-token-0123456789';

async function useTheme(page, preset) {
  if (!preset) return;
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    body.preferences = { ...(body.preferences || {}), appearance_preset: preset };
    await route.fulfill({ response: res, json: body });
  });
}

// Every visible element that owns text: its colour against the first opaque background behind it (WCAG AA).
async function lowContrast(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => [r, g, b].map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    // Returns every candidate background (gradient stops count separately) so the worst case is checked.
    function backgrounds(el) {
      const layers = [];
      let stops = null;
      for (let n = el; n; n = n.parentElement) {
        const st = getComputedStyle(n);
        if (!stops && /gradient/.test(st.backgroundImage) && n !== document.body && !n.classList.contains('workspace-shell')) {
          stops = (st.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter((c) => c && c.a > 0.5);
          if (stops.length) break;
        }
        const c = parse(st.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (const l of layers.reverse()) bg = blend(l, bg);
      return stops && stops.length ? stops.map((s) => blend(s, bg)) : [bg];
    }
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.closest('[aria-hidden="true"], iframe, svg') || el.matches(':disabled') || el.closest('[disabled]')) continue;
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      if (s.visibility === 'hidden' || s.display === 'none' || r.width < 2 || r.height < 2 || Number(s.opacity) < 0.5) continue;
      const bgs = backgrounds(el); const bg = bgs[0]; const fgRaw = parse(s.color); if (!fgRaw) continue;
      const ratio = Math.min(...bgs.map((b) => { const fg = blend(fgRaw, b); const [hi, lo] = [lum(fg), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); }));
      const size = parseFloat(s.fontSize); const bold = Number(s.fontWeight) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < need) out.push(`${el.tagName.toLowerCase()}.${el.className || ''} "${(el.value || el.textContent).trim().slice(0, 30)}" ${ratio.toFixed(2)} < ${need}`);
      if (['INPUT', 'TEXTAREA'].includes(el.tagName) && el.placeholder && !el.value) {
        const ph = parse(getComputedStyle(el, '::placeholder').color);
        if (ph) { const p = blend(ph, bg); const [h2, l2] = [lum(p), lum(bg)].sort((a, b) => b - a); const pr = (h2 + 0.05) / (l2 + 0.05); if (pr < 4.5) out.push(`placeholder "${el.placeholder}" ${pr.toFixed(2)} < 4.5`); }
      }
    }
    return out;
  });
}

for (const [label, preset] of [['default (white)', null], ['dark', 'dark']]) {
  test(`${label} theme: every main page keeps text, inputs and placeholders at WCAG AA contrast`, async ({ page }) => {
    test.setTimeout(60_000);
    await useTheme(page, preset);
    await page.goto('/');
    await expect(page.locator('.workspace-shell')).toHaveAttribute('data-theme', preset || /auto|light/);
    if (!preset) {
      const bg = await page.locator('.workspace-shell').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe('rgb(255, 255, 255)');
      const color = await page.locator('.workspace-shell').evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe('rgb(10, 10, 10)');
    }
    await page.getByLabel('Build prompt').fill('hi');
    const problems = {};
    for (const name of PAGES) {
      await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(250);
      const bad = await lowContrast(page);
      if (bad.length) problems[name] = bad;
    }
    expect(problems).toEqual({});
  });
}

test('default theme follows white even when the OS prefers dark', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  const bg = await page.locator('.workspace-shell').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(255, 255, 255)');
  await context.close();
});

test('admin panel text keeps WCAG AA contrast', async ({ page }) => {
  await page.goto('/#admin');
  expect(await lowContrast(page)).toEqual([]);
  await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  const problems = {};
  for (const tab of ['Overview', 'Users', 'Revenue & ads', 'Errors']) {
    const t = page.getByRole('tab', { name: tab });
    if (await t.count() === 0) continue;
    await t.click(); await page.waitForTimeout(250);
    const bad = await lowContrast(page); if (bad.length) problems[tab] = bad;
  }
  expect(problems).toEqual({});
});

test('cloud token sign-in box: clear field, Sign in button, hint, rejects a wrong token and saves a good one', async ({ page }) => {
  let accept = false;
  await page.route('**/api/projects', (route) => route.fulfill({ status: 401, json: { error: 'sign in with your Free way cloud token' } }));
  await page.route('**/api/config', (route) => {
    const auth = route.request().headers().authorization || '';
    if (auth.startsWith('Bearer ') && accept) return route.fulfill({ status: 200, json: { mode: 'cloud' } });
    if (auth.startsWith('Bearer ')) return route.fulfill({ status: 401, json: { error: 'sign in with your Free way cloud token' } });
    return route.continue();
  });
  await page.goto('/');
  const box = page.getByRole('form', { name: 'Sign in with access token' });
  await expect(box).toBeVisible();
  await expect(box.getByText('Paste the access token the owner gave you')).toBeVisible();
  const field = box.getByLabel('Access token');
  await expect(field).toHaveAttribute('placeholder', 'Paste access token');
  await expect(field).toHaveAttribute('type', 'password');
  await box.getByRole('button', { name: 'Sign in' }).click();
  await expect(box.getByRole('alert')).toContainText('Paste your access token first');
  await field.fill('wrong-token');
  await box.getByRole('button', { name: 'Sign in' }).click();
  await expect(box.getByRole('alert')).toContainText('was not accepted');
  expect(await page.evaluate(() => localStorage.getItem('fc.token'))).toBeNull();
  expect(await lowContrast(page)).toEqual([]);
  accept = true;
  await field.fill('good-token');
  await Promise.all([page.waitForEvent('load'), box.getByRole('button', { name: 'Sign in' }).click()]);
  expect(await page.evaluate(() => localStorage.getItem('fc.token'))).toBe('good-token');
  await page.evaluate(() => localStorage.removeItem('fc.token'));
});
