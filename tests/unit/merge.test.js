import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRequestPayload } from '../../frontend/src/merge.js';

test('failed checks require an explicit override in the merge request', () => {
  assert.deepEqual(mergeRequestPayload({ checks: 'failed' }), { override: true });
});

test('passing or unavailable checks do not request an override', () => {
  assert.deepEqual(mergeRequestPayload({ checks: 'passed' }), { override: false });
  assert.deepEqual(mergeRequestPayload(null), { override: false });
});
