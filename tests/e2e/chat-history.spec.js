import { expect, test } from '@playwright/test';

// This spec exercises the built-in demo sample project, which is no longer selected by default.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { if (!localStorage.getItem('fc.project')) localStorage.setItem('fc.project', 'demo'); }); });

async function openChat(page, setup) {
  const externalRequests = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') await route.continue();
    else { externalRequests.push(url.origin); await route.abort(); }
  });
  if (setup) await setup();
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
  return externalRequests;
}

async function sendMessage(page, message) {
  await page.getByLabel('New message').fill(message);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(`Demo reply: ${message}`, { exact: true })).toBeVisible();
}

function chatRow(page, title) {
  return page.locator('.chat-history-row').filter({ has: page.getByRole('button', { name: `Open chat ${title}`, exact: true }) });
}

test('mouse and keyboard menus pin and unpin a chat and keep the choice after reload', async ({ page }) => {
  const externalRequests = await openChat(page);
  await sendMessage(page, 'Pin this conversation');
  let row = chatRow(page, 'Pin this conversation');
  await row.getByRole('button', { name: 'Actions for Pin this conversation' }).click();
  const menu = page.getByRole('menu', { name: 'Actions for Pin this conversation' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Pin', exact: true }).click();
  await expect(row.getByText('Pinned', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  row = chatRow(page, 'Pin this conversation');
  await expect(row.getByText('Pinned', { exact: true })).toBeVisible();
  const trigger = row.getByRole('button', { name: 'Actions for Pin this conversation' });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(page.getByRole('menu', { name: 'Actions for Pin this conversation' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(row.getByText('Pinned', { exact: true })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('renames an XSS-looking title and renders it as inert text', async ({ page }) => {
  const externalRequests = await openChat(page);
  await sendMessage(page, 'An ordinary first message');
  await chatRow(page, 'An ordinary first message').getByRole('button', { name: 'Actions for An ordinary first message' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Rename chat' })).toBeVisible();
  const title = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Chat title').fill(title);
  await page.getByRole('button', { name: 'Save title', exact: true }).click();

  const row = chatRow(page, title);
  await expect(row.getByText(title, { exact: true })).toBeVisible();
  await expect(page.locator('img[onerror]')).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('archives a chat, lists it in Archived, and restores it to active history', async ({ page }) => {
  const externalRequests = await openChat(page);
  await sendMessage(page, 'Move this to the archive');
  await chatRow(page, 'Move this to the archive').getByRole('button', { name: 'Actions for Move this to the archive' }).click();
  await page.getByRole('menuitem', { name: 'Archive', exact: true }).click();
  await expect(chatRow(page, 'Move this to the archive')).toHaveCount(0);

  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archived chats', exact: true })).toBeVisible();
  const archivedRow = chatRow(page, 'Move this to the archive');
  await expect(archivedRow).toBeVisible();
  await archivedRow.getByRole('button', { name: 'Actions for Move this to the archive' }).click();
  await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
  await expect(chatRow(page, 'Move this to the archive')).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('requires separate confirmation before permanently deleting a chat', async ({ page }) => {
  const externalRequests = await openChat(page);
  await sendMessage(page, 'Delete only after confirmation');
  const row = chatRow(page, 'Delete only after confirmation');
  const rowId = await row.getAttribute('data-chat-id');

  await row.getByRole('button', { name: 'Actions for Delete only after confirmation' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Delete chat permanently?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Actions for Delete only after confirmation' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(chatRow(page, 'Delete only after confirmation')).toHaveCount(0);
  const storedIds = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.chats.v2')).chats.map((chat) => chat.id));
  expect(storedIds).not.toContain(rowId);
  expect(externalRequests).toEqual([]);
});

test('reload restores both the saved transcript and its renamed chat row', async ({ page }) => {
  const externalRequests = await openChat(page);
  await sendMessage(page, 'Keep this transcript on reload');
  let row = chatRow(page, 'Keep this transcript on reload');
  await row.getByRole('button', { name: 'Actions for Keep this transcript on reload' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Chat title').fill('Saved local conversation');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Manage chats', exact: true }).click();
  row = chatRow(page, 'Saved local conversation');
  await expect(row).toBeVisible();
  await expect(page.getByText('Keep this transcript on reload', { exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('malformed legacy fc.chats data is preserved while new history remains usable', async ({ page }) => {
  const externalRequests = await openChat(page, async () => {
    await page.addInitScript(() => localStorage.setItem('fc.chats', '[{"id":"unfinished"'));
  });
  await sendMessage(page, 'A fresh chat after malformed legacy data');
  await expect(chatRow(page, 'A fresh chat after malformed legacy data')).toBeVisible();
  const values = await page.evaluate(() => ({
    legacy: localStorage.getItem('fc.chats'),
    messages: JSON.parse(localStorage.getItem('fc.chats.v2')).chats[0].msgs.map((message) => message.content),
  }));
  expect(values.legacy).toBe('[{"id":"unfinished"');
  expect(values.messages).toContain('A fresh chat after malformed legacy data');
  expect(externalRequests).toEqual([]);
});

test('storage denial keeps the current transcript usable in session memory', async ({ page }) => {
  const externalRequests = await openChat(page, async () => {
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (key === 'fc.chats' || key === 'fc.chats.v2') throw new DOMException('Storage denied', 'SecurityError');
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === 'fc.chats' || key === 'fc.chats.v2') throw new DOMException('Storage denied', 'SecurityError');
        return setItem.call(this, key, value);
      };
    });
  });
  await sendMessage(page, 'Keep this available in the current session');
  await expect(chatRow(page, 'Keep this available in the current session')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'only in this session' })).toBeVisible();
  expect(externalRequests).toEqual([]);
});


test('New chat creates a distinct transcript without replacing the saved conversation', async ({ page }) => {
  const externalRequests = await openChat(page);
  await sendMessage(page, 'First separate conversation');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.getByLabel('New message')).toHaveValue('');
  await sendMessage(page, 'Second separate conversation');

  await expect(chatRow(page, 'First separate conversation')).toBeVisible();
  await expect(chatRow(page, 'Second separate conversation')).toBeVisible();
  await chatRow(page, 'First separate conversation').getByRole('button', { name: 'Open chat First separate conversation', exact: true }).click();
  await expect(page.getByText('Demo reply: First separate conversation', { exact: true })).toBeVisible();
  await chatRow(page, 'Second separate conversation').getByRole('button', { name: 'Open chat Second separate conversation', exact: true }).click();
  await expect(page.getByText('Demo reply: Second separate conversation', { exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('loads legacy fc.chats transcripts into v2 without deleting legacy data or message metadata', async ({ page }) => {
  const legacyChat = {
    id: 'legacy-chat-1',
    mode: 'chat',
    title: 'Legacy saved conversation',
    at: 123,
    msgs: [
      { role: 'user', content: 'Legacy first prompt', at: 120, items: [{ kind: 'file', name: 'legacy.txt' }] },
      { role: 'assistant', content: 'Legacy assistant reply', at: 123, sources: [{ title: 'Legacy source', url: 'https://example.test/source' }], workedSec: 1 },
    ],
  };
  const rawLegacy = JSON.stringify([legacyChat]);
  const externalRequests = await openChat(page, async () => {
    await page.addInitScript(({ serialized }) => {
      localStorage.setItem('fc.chats', serialized);
      localStorage.setItem('fc.chat.active', 'legacy-chat-1');
    }, { serialized: rawLegacy });
  });

  await expect(chatRow(page, 'Legacy saved conversation')).toBeVisible();
  await expect(page.getByText('Legacy first prompt', { exact: true })).toBeVisible();
  await expect(page.getByText('Legacy assistant reply', { exact: true })).toBeVisible();
  const values = await page.evaluate(() => ({
    legacy: localStorage.getItem('fc.chats'),
    migrated: JSON.parse(localStorage.getItem('fc.chats.v2')).chats[0],
  }));
  expect(values.legacy).toBe(rawLegacy);
  expect(values.migrated.msgs).toEqual(legacyChat.msgs);
  expect(externalRequests).toEqual([]);
});
