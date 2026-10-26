import { expect, test } from '@playwright/test';

// Step 7: a build sent from Home stays in the chat thread with the progress box; Review plan opens the Board plan.
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


for (const [label, preset] of [['dark', null], ['white', 'light']]) {
  test(`${label}: build task shows progress inside the Home chat and Review plan reaches plan approval`, async ({ page }) => {
    test.setTimeout(90_000);
    await useTheme(page, preset);
    await page.addInitScript(() => { localStorage.setItem('fc.project', 'demo'); });
    await page.goto('/');
    await page.getByLabel('Build prompt').fill('Add a short welcome line to index.html');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const run = page.locator('.home-run');
    await expect(page.locator('.topbar p')).toHaveText('Home');
    await expect(run.locator('.message-user p')).toHaveText('Add a short welcome line to index.html');
    await expect(run.locator('.message-time')).toHaveText(/\d{1,2}:\d{2}/);
    const user = await run.locator('.message-user').boundingBox();
    const thread = await run.boundingBox();
    expect(user.x + user.width).toBeGreaterThan(thread.x + thread.width - 4);            // right-aligned bubble
    const timer = run.getByRole('region', { name: 'Agent progress' }).getByRole('timer');
    await expect(timer).toHaveText(/^Work(ing|ed) for (\d+m )?\d+s$/);
    await expect(run.getByRole('status')).toHaveText('Plan approval required', { timeout: 60_000 });
    await expect(timer).toHaveText(/^Worked for /);
    expect(await run.locator('details.progress-step').count()).toBeGreaterThan(0);
    expect(await lowContrast(page)).toEqual([]);
    await run.getByRole('button', { name: 'Review plan' }).click();
    await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve plan' })).toBeVisible();
    await page.evaluate(async () => {
      for (const a of await (await fetch('/api/agents')).json()) if (String(a.state).startsWith('needs_')) await fetch(`/api/agents/${a.id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    });
  });
}