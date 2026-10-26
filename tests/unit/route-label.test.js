import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLabel, modelOptionLabel } from '../../frontend/src/features/chat/routeLabel.js';

const models = [{ id: 'spark', name: 'MiniMax M3.1 Flash' }, { id: 'forge', name: 'GLM 5.3' }];

test('shows the model that answered, its provider and time', () => {
  assert.deepEqual(routeLabel({ provider: 'nim', name: 'GLM 5.3', ms: 4200, fallback: false }, models), { text: 'Worked for 4s · GLM 5.3 via NVIDIA NIM', fallback: false });
});

test('a fallback names the picked model and the real one', () => {
  const l = routeLabel({ provider: 'nim', name: 'Nemotron 3 Ultra', requested: 'spark', fallback: true, ms: 900 }, models);
  assert.equal(l.fallback, true);
  assert.equal(l.text, 'Worked for 1s · MiniMax M3.1 Flash was unavailable — answered by Nemotron 3 Ultra via NVIDIA NIM');
});

test('instant and demo replies say no model was called', () => {
  assert.equal(routeLabel({ provider: 'local' }).text, 'Instant reply (no model call)');
  assert.equal(routeLabel({ provider: 'mock' }).text, 'Demo reply (no model call)');
  assert.equal(routeLabel(null), null);
});

test('models without a key are labelled', () => {
  assert.equal(modelOptionLabel({ name: 'MiniMax M3.1 Flash', available: false }), 'MiniMax M3.1 Flash — needs key');
  assert.equal(modelOptionLabel({ name: 'GLM 5.3', available: true }), 'GLM 5.3');
  assert.equal(modelOptionLabel({ name: 'GLM 5.3' }), 'GLM 5.3');
});
