import { expect, test } from '@playwright/test';

// Step 6: clarifying questions card before a large build, then the Freebuff-style progress box. Dark and white themes.
test.skip(({ isMobile }) => isMobile, 'desktop check');
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


async function idle(page) {
  await expect.poll(() => page.evaluate(async () => {
    const agents = await (await fetch('/api/agents')).json();
    const busy = Array.isArray(agents) ? agents.filter((a) => a.state === 'orchestrating') : [];
    for (const a of busy) await fetch(`/api/orchestrations/${a.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return busy.length;
  }), { timeout: 20_000 }).toBe(0);
}

for (const [label, preset] of [['dark', null], ['white', 'light']]) {
  test(`${label}: questions card merges answers, then the progress box shows real steps and a timer`, async ({ page }) => {
    test.setTimeout(90_000);
    await useTheme(page, preset);
    await page.addInitScript(() => { localStorage.setItem('fc.project', 'demo'); });
    const posted = [];
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/orchestrations' && r.method() === 'POST') posted.push(r.postDataJSON()); });
    await page.goto('/');
    await page.getByLabel('Build prompt').fill('build a full stack website for my bakery');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.getByRole('region', { name: 'Clarifying questions' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Free way has 3 questions');
    await expect(card).toContainText('Question 1 of 3');
    await expect(card.getByText('Recommended')).toBeVisible();
    await expect(card.getByLabel('Your own answer')).toHaveAttribute('placeholder', 'Or type your own answer…');
    expect(await lowContrast(page)).toEqual([]);
    expect(posted).toHaveLength(0);                                   // nothing starts before the questions are answered
    await card.getByText('In a new folder').click();
    await card.getByRole('button', { name: 'Next question' }).click();
    await expect(card).toContainText('Question 2 of 3');
    await card.getByLabel('Your own answer').fill('Svelte');
    await card.getByRole('button', { name: 'Next question' }).click();
    await expect(card).toContainText('Question 3 of 3');
    await card.getByRole('button', { name: 'Skip' }).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].prompt).toBe('build a full stack website for my bakery\n\nScope answers:\n- Where should it live? In a new folder\n- Which stack should it use? Svelte');
    await page.getByRole('button', { name: 'Review plan' }).click();   // step 7: the run stays in the Home chat
    await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
    const box = page.getByRole('region', { name: 'Agent progress' });
    await expect(box.getByRole('timer')).toHaveText(/^Work(ing|ed) for (\d+m )?\d+s$/);
    await expect(page.locator('.state-badge').first()).toHaveText('Plan approval required', { timeout: 60_000 });
    await expect(box.getByRole('timer')).toHaveText(/^Worked for /);
    const rows = box.locator('details.progress-step');
    expect(await rows.count()).toBeGreaterThan(0);
    await rows.first().locator('summary').click();
    await expect(rows.first()).toHaveAttribute('open', '');
    expect(await lowContrast(page)).toEqual([]);
    await idle(page);
  });
}

test('Skip on every question builds with the original prompt', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { localStorage.setItem('fc.project', 'demo'); });
  const req = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/orchestrations' && r.method() === 'POST');
  await page.goto('/');
  await page.getByLabel('Build prompt').fill('create a complete dashboard in React');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const card = page.getByRole('region', { name: 'Clarifying questions' });
  await expect(card).toContainText('Free way has 2 questions');
  await card.getByRole('button', { name: 'Skip' }).click();
  await card.getByRole('button', { name: 'Skip' }).click();
  expect((await req).postDataJSON().prompt).toBe('create a complete dashboard in React');
  await idle(page);
});