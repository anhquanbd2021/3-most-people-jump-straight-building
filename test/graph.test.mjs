import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../public/harness.mjs';
import { createSharedState, runWorkflow } from '../public/graph.mjs';
import { teamWorkflow, verifyTeam } from '../public/scenarios.mjs';

const runTeam = (mode) => runWorkflow(teamWorkflow(), {
  shared: createSharedState(mode),
  harness: createHarness(),
});

test('flat shared state: parallel branches collide — one update is lost', async () => {
  const { shared, stats } = await runTeam('flat');
  assert.equal(stats.lostUpdates, 1);
  assert.equal(verifyTeam(shared), false);
  assert.match(shared.report, /MISSING/);
});

test('versioned shared state: same race is a conflict + retry, not a loss', async () => {
  const { shared, stats } = await runTeam('versioned');
  assert.equal(stats.conflicts, 1);
  assert.equal(stats.retries, 1);
  assert.equal(stats.lostUpdates, 0);
  assert.equal(verifyTeam(shared), true);
  assert.doesNotMatch(shared.report, /MISSING/);
});

test('events narrate the retry in versioned mode', async () => {
  const { events } = await runTeam('versioned');
  const retry = events.find(e => e.type === 'retry');
  assert.ok(retry, 'a retry event exists');
  assert.match(retry.node, /^analyst-/);
});

test('sequential nodes never race, even in flat mode', async () => {
  const shared = createSharedState('flat');
  const spec = [
    { id: 'a', async run({ shared }) {
        const s = shared.read('k'); shared.write('k', { a: 1 }, s.version); } },
    { id: 'b', async run({ shared }) {
        const s = shared.read('k'); shared.write('k', { ...s.value, b: 2 }, s.version); } },
  ];
  const { shared: snap, stats } = await runWorkflow(spec, { shared, harness: createHarness() });
  assert.deepEqual(snap.k, { a: 1, b: 2 });
  assert.equal(stats.lostUpdates, 0);
});
