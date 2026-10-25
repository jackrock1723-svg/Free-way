import assert from 'node:assert/strict';
import test from 'node:test';
import { chatStore, createChatStore } from '../../frontend/src/features/chat-history/chatStore.js';

const LEGACY_KEY = 'fc.chats';
const VERSIONED_KEY = 'fc.chats.v2';

function makeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function makeChat(id, title, at = 100) {
  return {
    id,
    mode: 'chat',
    title,
    at,
    msgs: [
      { role: 'user', content: 'Keep this complete transcript.', at: 90, items: [{ kind: 'file', name: 'notes.txt' }] },
      { role: 'assistant', content: 'The complete reply stays here.', at: 100, sources: [{ title: 'Reference', url: 'https://example.test' }], error: null, workedSec: 2 },
    ],
  };
}

test('migrates readable legacy fc.chats transcripts without changing the legacy key', () => {
  const legacyChat = makeChat('legacy-1', 'Legacy conversation');
  const rawLegacy = JSON.stringify([legacyChat]);
  const storage = makeStorage({ [LEGACY_KEY]: rawLegacy });

  const chats = chatStore.load(storage);

  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, 'legacy-1');
  assert.equal(chats[0].title, 'Legacy conversation');
  assert.equal(chats[0].pinned, false);
  assert.equal(chats[0].archived, false);
  assert.deepEqual(chats[0].msgs, legacyChat.msgs);
  assert.equal(storage.getItem(LEGACY_KEY), rawLegacy);
  const migrated = JSON.parse(storage.getItem(VERSIONED_KEY));
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.chats[0].msgs, legacyChat.msgs);
});

test('keeps valid chats from a malformed legacy list and leaves its source bytes intact', () => {
  const readable = makeChat('readable-1', 'Readable chat');
  const rawLegacy = JSON.stringify([readable, { id: 'bad-chat', msgs: 'not a transcript' }, null]);
  const storage = makeStorage({ [LEGACY_KEY]: rawLegacy });

  const chats = chatStore.load(storage);

  assert.deepEqual(chats.map((chat) => chat.id), ['readable-1']);
  assert.deepEqual(chats[0].msgs, readable.msgs);
  assert.equal(storage.getItem(LEGACY_KEY), rawLegacy);
  assert.deepEqual(JSON.parse(storage.getItem(VERSIONED_KEY)).chats.map((chat) => chat.id), ['readable-1']);
});

test('does not overwrite malformed legacy JSON when no readable transcript can be recovered', () => {
  const rawLegacy = '[{"id":"unfinished"';
  const storage = makeStorage({ [LEGACY_KEY]: rawLegacy });

  assert.deepEqual(chatStore.load(storage), []);
  assert.equal(storage.getItem(LEGACY_KEY), rawLegacy);
  assert.equal(storage.getItem(VERSIONED_KEY), null);
});

test('supports pin, rename, archive, restore, list, and delete without changing transcripts', () => {
  const first = makeChat('first', 'First chat', 100);
  const second = makeChat('second', 'Second chat', 200);
  const storage = makeStorage();
  const store = createChatStore(storage);

  assert.equal(store.save([first, second]).ok, true);
  assert.equal(store.rename('first', '  Renamed <img src=x onerror=alert(1)>  ').ok, true);
  assert.equal(store.pin('first', true).ok, true);
  assert.deepEqual(store.list().map((chat) => chat.id), ['first', 'second']);
  assert.equal(store.list()[0].title, 'Renamed <img src=x onerror=alert(1)>');

  assert.equal(store.archive('first').ok, true);
  assert.deepEqual(store.list().map((chat) => chat.id), ['second']);
  assert.deepEqual(store.list({ archived: true }).map((chat) => chat.id), ['first']);
  assert.equal(store.restore('first').ok, true);
  assert.deepEqual(store.list().map((chat) => chat.id), ['first', 'second']);
  assert.deepEqual(store.getChat('first').msgs, first.msgs);
  assert.equal(store.pin('first', false).ok, true);
  assert.deepEqual(store.list().map((chat) => chat.id), ['second', 'first']);
  assert.equal(store.remove('second').ok, true);
  assert.deepEqual(store.getChats().map((chat) => chat.id), ['first']);
  assert.deepEqual(JSON.parse(storage.getItem(VERSIONED_KEY)).chats[0].msgs, first.msgs);
});

test('rejects an empty rename without replacing the existing title', () => {
  const storage = makeStorage();
  const store = createChatStore(storage);
  store.save([makeChat('named', 'Existing title')]);

  const result = store.rename('named', '   ');

  assert.equal(result.ok, false);
  assert.equal(store.getChat('named').title, 'Existing title');
});

test('keeps recoverable in-memory chat history when browser storage is unavailable', () => {
  const unavailableStorage = {
    getItem() { throw new Error('Storage denied'); },
    setItem() { throw new Error('Storage denied'); },
  };
  const transcript = makeChat('session-only', 'Session-only chat');

  assert.deepEqual(chatStore.load(unavailableStorage), []);
  const store = createChatStore(unavailableStorage);
  const result = store.save([transcript]);

  assert.equal(result.ok, false);
  assert.equal(store.getChat('session-only').title, 'Session-only chat');
  assert.deepEqual(store.getChat('session-only').msgs, transcript.msgs);
  assert.equal(store.rename('session-only', 'Still here').ok, false);
  assert.equal(store.getChat('session-only').title, 'Still here');
});


test('chatStore.save writes the versioned key and returns a success result', () => {
  const storage = makeStorage();
  const chat = makeChat('saved-1', 'Saved directly');

  const result = chatStore.save(storage, [chat]);

  assert.equal(result.ok, true);
  const saved = JSON.parse(storage.getItem(VERSIONED_KEY));
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.chats[0].id, 'saved-1');
  assert.deepEqual(saved.chats[0].msgs, chat.msgs);
});

test('recovers readable legacy transcripts when the versioned copy is corrupt', () => {
  const legacyChat = makeChat('legacy-recovery', 'Recovered legacy chat');
  const rawLegacy = JSON.stringify([legacyChat]);
  const storage = makeStorage({ [LEGACY_KEY]: rawLegacy, [VERSIONED_KEY]: '{not valid JSON' });

  const chats = chatStore.load(storage);

  assert.deepEqual(chats.map((chat) => chat.id), ['legacy-recovery']);
  assert.deepEqual(chats[0].msgs, legacyChat.msgs);
  assert.equal(storage.getItem(LEGACY_KEY), rawLegacy);
  assert.deepEqual(JSON.parse(storage.getItem(VERSIONED_KEY)).chats[0].msgs, legacyChat.msgs);
});
