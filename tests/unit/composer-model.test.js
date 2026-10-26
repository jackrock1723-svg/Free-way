import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSER_MODEL_IDS, COMPOSER_MODES, pickFreeModels, composerPlaceholder, adDomain } from '../../frontend/src/features/composer/composerModel.js';

test('model picker keeps only free catalog models, in a fixed order', () => {
  const list = [
    { id: 'claude', name: 'Claude family', tier: 'premium', free: false },
    { id: 'lite', name: 'Nemotron 3.5 Lightning', tier: 'free', free: true },
    { id: 'auto', name: 'Free way Auto', tier: 'free', free: true },
    { id: 'laguna-xs', name: 'Poolside Laguna XS 2.1', tier: 'free', free: true },
    { id: 'gpt', name: 'GPT family', tier: 'free', free: false },
  ];
  assert.deepEqual(pickFreeModels(list).map((m) => m.id), ['auto', 'lite']);
  assert.deepEqual(pickFreeModels(null), []);
  assert.ok(!COMPOSER_MODEL_IDS.some((id) => ['claude', 'gpt', 'gemini'].includes(id)));
});

test('modes and placeholders match the Freebuff composer', () => {
  assert.deepEqual(COMPOSER_MODES.map((m) => m.label), ['Agent', 'Plan', 'Mission', 'Skills']);
  assert.equal(composerPlaceholder(false), 'Ask Free way… Use / for commands');
  assert.equal(composerPlaceholder(true), 'Type a message — added to the queue');
});

test('ad domain is read safely', () => {
  assert.equal(adDomain('https://www.example.com/x'), 'example.com');
  assert.equal(adDomain('not a url'), '');
});