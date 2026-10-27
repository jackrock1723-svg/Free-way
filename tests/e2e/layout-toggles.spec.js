import { test, expect } from '@playwright/test';

const now = Date.now();
function seed(page, chats) {
  return page.addInitScript((c) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('fc.chats.v2', JSON.stringify({ schemaVersion: 2, chats: c })); sessionStorage.setItem('seeded', '1'); }
  }, chats);
}

test('Ctrl+B and the top toggle collapse and restore the sidebar', async ({ page }) => {
  await page.goto('/');
  const shell = page.locator('.workspace-shell');
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await page.keyboard.press('Control+b');
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await page.getByRole('textbox').first().click();
  await page.keyboard.press('Control+b');
  await expect(shell).toHaveClass(/sidebar-collapsed/);
});

test('a stopped reply shows a Stopped label instead of a fake answer', async ({ page, isMobile }) => {
  test.skip(isMobile, 'This workflow depends on the desktop chat-history sidebar, which is hidden on mobile.');
  await seed(page, [{ id: 's1', title: 'Stop me', at: now, project: '', msgs: [
    { role: 'user', content: 'write a long story', at: now - 2 },
    { role: 'assistant', content: 'Stopped.', stopped: true, at: now - 1 },
  ] }]);
  await page.goto('/');
  await page.locator('.sidebar-chat', { hasText: 'Stop me' }).first().click();
  const reply = page.locator('.home-messages .message-assistant');
  await expect(reply.locator('.fw-meta.is-stopped')).toHaveText('Stopped');
  await expect(reply.locator('p')).toHaveCount(0);
});

test('the terminal toggle opens a real local terminal that needs a project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Show terminal' }).click();
  const panel = page.getByRole('region', { name: 'Terminal' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/Choose a project|Runs in/);
  await page.getByRole('button', { name: 'Close terminal' }).click();
  await expect(panel).toHaveCount(0);
  await page.keyboard.press('Control+`');
  await expect(page.getByRole('region', { name: 'Terminal' })).toBeVisible();
});

test('the terminal says plainly when it is not available on hosted Free way', async ({ page }) => {
  await page.route('**/api/terminal', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, reason: 'The terminal is not available on hosted Free way. Download the desktop app to run commands on your own computer.' }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Show terminal' }).click();
  await expect(page.getByRole('region', { name: 'Terminal' }).getByRole('status')).toContainText('not available on hosted Free way');
  await expect(page.getByRole('textbox', { name: 'Terminal command' })).toHaveCount(0);
});

test('split view shows a second chat chosen from the Choose chat picker', async ({ page, isMobile }) => {
  test.skip(isMobile, 'This workflow depends on the desktop chat-history sidebar, which is hidden on mobile.');
  await seed(page, [
    { id: 'a1', title: 'First chat', at: now, project: '', msgs: [{ role: 'user', content: 'alpha question', at: now - 4 }, { role: 'assistant', content: 'alpha answer', at: now - 3 }] },
    { id: 'b2', title: 'Second chat', at: now - 10, project: '', msgs: [{ role: 'user', content: 'beta question', at: now - 14 }, { role: 'assistant', content: 'beta answer', at: now - 13 }] },
  ]);
  await page.goto('/');
  await page.locator('.sidebar-chat', { hasText: 'First chat' }).first().click();
  await page.getByRole('button', { name: 'Split chat' }).click();
  const pane = page.getByRole('region', { name: 'Second chat' });
  await expect(pane).toContainText('Choose a chat');
  await pane.getByRole('combobox', { name: 'Choose chat' }).selectOption({ label: 'Second chat' });
  await expect(pane).toContainText('beta answer');
  await expect(page.locator('.landing-copy')).toContainText('alpha answer');
  await pane.getByRole('button', { name: 'Open' }).click();
  await expect(pane).toHaveCount(0);
  await expect(page.locator('.landing-copy')).toContainText('beta answer');
});
