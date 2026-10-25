import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeProjectList } from '../../frontend/src/projects.js';

test('normalizes server project IDs and preserves a project created before the initial list arrives', () => {
  const current = [
    { id: 'demo', name: 'Freecode' },
    { id: 'workspace-sample', name: 'Workspace Sample' },
  ];

  assert.deepEqual(mergeProjectList(['demo'], current), [
    { id: 'demo', name: 'Freecode' },
    { id: 'workspace-sample', name: 'Workspace Sample' },
  ]);
});
