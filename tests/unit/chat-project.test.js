import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatStore } from '../../frontend/src/features/chat-history/chatStore.js';

function makeStorage() {
  const values = new Map();
  return { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
}

test('chats remember which project they belong to (sidebar history), old chats default to none', () => {
  const store = createChatStore(makeStorage());
  assert.equal(store.upsert({ id: 'c1', title: 'Hi', at: 1, msgs: [{ role: 'user', content: 'hi' }], project: 'shop' }).ok, true);
  assert.equal(store.upsert({ id: 'c2', title: 'Old', at: 2, msgs: [{ role: 'user', content: 'old' }] }).ok, true);
  assert.equal(store.getChat('c1').project, 'shop');
  assert.equal(store.getChat('c2').project, '');
});