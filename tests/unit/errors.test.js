import assert from 'node:assert/strict';
import test from 'node:test';

const load = () => import('../../frontend/src/api.js');

test('friendlyError hides raw server failures but keeps messages written for people', async () => {
  const { friendlyError, FRIENDLY_SERVER_ERROR, FRIENDLY_RATE_LIMIT } = await load();
  assert.equal(friendlyError(500, 'ZeroDivisionError: division by zero'), FRIENDLY_SERVER_ERROR);
  assert.equal(friendlyError(502, 'upstream exploded'), FRIENDLY_SERVER_ERROR);
  assert.equal(friendlyError(504, ''), FRIENDLY_SERVER_ERROR);
  assert.equal(friendlyError(429, 'too many'), FRIENDLY_RATE_LIMIT);
  assert.equal(friendlyError(503, 'Project service unavailable.'), 'Project service unavailable.');
  assert.equal(friendlyError(409, 'That project name is already taken. Choose another name.'), 'That project name is already taken. Choose another name.');
  assert.match(friendlyError(404, ''), /HTTP 404/);
});

test('userMessage maps network, abort and unknown errors to friendly text', async () => {
  const { userMessage, ApiError, FRIENDLY_NETWORK_ERROR, FRIENDLY_SERVER_ERROR } = await load();
  assert.equal(userMessage(new ApiError('network', 0)), FRIENDLY_NETWORK_ERROR);
  assert.equal(userMessage(Object.assign(new Error('x'), { name: 'AbortError' })), 'The request was cancelled.');
  assert.equal(userMessage(new TypeError('Cannot read properties of undefined')), FRIENDLY_SERVER_ERROR);
  assert.equal(userMessage(undefined), FRIENDLY_SERVER_ERROR);
  const raw = new ApiError('friendly', 500, true, 'KeyError: secret_detail');
  assert.equal(userMessage(raw), 'friendly');
  assert.equal(raw.detail, 'KeyError: secret_detail');
});
