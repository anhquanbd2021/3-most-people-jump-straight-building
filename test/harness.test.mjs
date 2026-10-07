import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, normalizePath } from '../public/harness.mjs';

test('healthy harness exposes every tool and reads workspace files', () => {
  const h = createHarness();
  assert.deepEqual(h.listTools().map(t => t.name).sort(),
    ['read_file', 'recall', 'remember', 'search_docs', 'write_file']);
  const r = h.call('read_file', { path: 'workspace/notes.txt' });
  assert.equal(r.ok, true);
  assert.match(r.observation, /exporter/i);
});

test('restricted harness: a removed tool is missing-tool, not denied', () => {
  const h = createHarness({ tools: ['search_docs'] });
  const r = h.call('read_file', { path: 'workspace/notes.txt' });
  assert.equal(r.ok, false);
  assert.equal(r.fault, 'missing-tool');
});

test('permission scope blocks out-of-scope paths — even with .. tricks', () => {
  const h = createHarness({ readable: ['docs/'], writable: ['workspace/'] });
  const r = h.call('read_file', { path: 'workspace/../secrets/prod.env' });
  assert.equal(r.fault, 'permission');
  const w = h.call('write_file', { path: 'docs/exporter.md', content: 'x' });
  assert.equal(w.fault, 'permission');
});

test('normalizePath collapses dot segments', () => {
  assert.equal(normalizePath('workspace/../secrets/prod.env'), 'secrets/prod.env');
  assert.equal(normalizePath('./workspace//notes.txt'), 'workspace/notes.txt');
});

test('memory budget refuses new keys but still allows overwrites', () => {
  const h = createHarness({ memoryBudget: 1 });
  assert.equal(h.call('remember', { key: 'a', value: '1' }).ok, true);
  assert.equal(h.call('remember', { key: 'b', value: '2' }).fault, 'memory-full');
  assert.equal(h.call('remember', { key: 'a', value: '3' }).ok, true);
  assert.equal(h.call('recall', { key: 'a' }).observation, 'a = 3');
});

test('writes land in world state where the verifier can see them', () => {
  const h = createHarness();
  h.call('write_file', { path: 'workspace/report.md', content: '# exporter report' });
  assert.match(h.readState('workspace/report.md'), /exporter/);
  assert.equal(h.readState('workspace/missing.md'), null);
});
