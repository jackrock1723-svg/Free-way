import test from 'node:test';
import assert from 'node:assert/strict';
import { streakDays, chatsToday, groupChats, matchesSearch } from '../../frontend/src/features/sidebar/sidebarModel.js';

const DAY = 86400000;
const now = new Date(2026, 9, 27, 12, 0).getTime();

test('streak counts consecutive active days ending today', () => {
  const chats = [{ at: now }, { at: now - DAY }, { at: now - 2 * DAY }, { at: now - 4 * DAY }];
  assert.equal(streakDays(chats, now), 3);
});

test('streak survives until the first message of today', () => {
  assert.equal(streakDays([{ at: now - DAY }, { at: now - 2 * DAY }], now), 2);
  assert.equal(streakDays([{ at: now - 3 * DAY }], now), 0);
  assert.equal(streakDays([], now), 0);
});

test('message times count as activity too', () => {
  assert.equal(streakDays([{ at: now, msgs: [{ at: now - DAY }] }], now), 2);
});

test('chatsToday counts only chats active today', () => {
  assert.equal(chatsToday([{ at: now }, { at: now - DAY }, { at: now - 60000 }], now), 2);
});

test('groupChats nests chats under real projects, the rest are loose', () => {
  const { byProject, loose } = groupChats([{ id: 'a', project: 'p1' }, { id: 'b', project: 'gone' }, { id: 'c' }], [{ id: 'p1' }]);
  assert.deepEqual(byProject.get('p1').map((c) => c.id), ['a']);
  assert.deepEqual(loose.map((c) => c.id), ['b', 'c']);
});

test('search matches titles case-insensitively', () => {
  assert.equal(matchesSearch({ title: 'Make A Calculator' }, 'calc'), true);
  assert.equal(matchesSearch({ title: 'Greeting' }, 'calc'), false);
  assert.equal(matchesSearch({ title: 'x' }, ''), true);
});
