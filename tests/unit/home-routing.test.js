import assert from 'node:assert/strict';
import test from 'node:test';
import { isChitChatError } from '../../frontend/src/homeRouting.js';

test('greeting refusal from the server is routed to an inline chat reply', () => {
  assert.equal(isChitChatError({ message: 'That looks like a greeting, not a task. Describe what to build, or use Chat to talk.' }), true);
  assert.equal(isChitChatError({ message: 'Bad request', detail: 'That looks like a greeting, not a task.' }), true);
});

test('real build errors still show as errors', () => {
  assert.equal(isChitChatError({ message: 'parallel agent limit reached' }), false);
  assert.equal(isChitChatError({ message: 'prompt too long' }), false);
  assert.equal(isChitChatError(null), false);
  assert.equal(isChitChatError(undefined), false);
});
