import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, mergeAnswers, progressSteps, scopeQuestions, workTimes } from '../../frontend/src/features/progress/progressModel.js';

test('large or vague builds get up to 3 scope questions; small tasks get none', () => {
  assert.deepEqual(scopeQuestions('build a full stack website').map((q) => q.id), ['place', 'stack', 'pages']);
  assert.deepEqual(scopeQuestions('create a complete dashboard in React').map((q) => q.id), ['place', 'pages']);
  assert.deepEqual(scopeQuestions('fix the login bug'), []);
  assert.deepEqual(scopeQuestions('Add a short welcome line to index.html'), []);
  for (const q of scopeQuestions('make an e-commerce site')) {
    assert.ok(q.options.length >= 2 && q.options.length <= 3);
    assert.equal(q.options.filter((o) => o.recommended).length, 1);
  }
});

test('answers merge into the prompt; skipped questions add nothing', () => {
  const qs = scopeQuestions('build a full stack website');
  assert.equal(mergeAnswers('build a full stack website', qs, [null, null, null]), 'build a full stack website');
  assert.equal(mergeAnswers('p', qs, [{ choice: 0 }, { custom: '  Svelte ' }, null]), 'p\n\nScope answers:\n- Where should it live? In this project\n- Which stack should it use? Svelte');
  assert.equal(mergeAnswers('p', qs, [{ custom: '   ' }]), 'p');
});

test('progress rows come only from specialists that ran, with their real output', () => {
  const rows = progressSteps([
    { role: 'file_picker', status: 'completed', result: { summary: 'Picked 2 files', findings: ['index.html'] } },
    { role: 'thinker', status: 'running', result: null },
    { role: 'editor', status: 'pending', result: null },
    { role: 'basher', status: 'failed', result: null, error: 'timeout' },
  ]);
  assert.deepEqual(rows.map((r) => r.label), ['Read files', 'Thought', 'Proposed a command']);
  assert.deepEqual(rows[0].details, ['index.html']);
  assert.deepEqual(rows[2].details, ['timeout']);
});

test('timer counts up while working and freezes at the last event', () => {
  assert.equal(formatDuration(171), '2m 51s');
  assert.equal(formatDuration(9.9), '9s');
  assert.deepEqual(workTimes({ created: 100, state: 'orchestrating', log: [{ t: 110 }] }, 130), { working: true, seconds: 30 });
  assert.deepEqual(workTimes({ created: 100, state: 'needs_plan_approval', log: [{ t: 110 }, { t: 145 }] }, 999), { working: false, seconds: 45 });
});