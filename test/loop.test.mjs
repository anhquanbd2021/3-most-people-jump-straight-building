import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../public/harness.mjs';
import { createScriptedModel } from '../public/model.mjs';
import { runAgent } from '../public/loop.mjs';
import { verifyReport } from '../public/scenarios.mjs';

const setup = (harnessCfg = {}, loopOpts = {}) => runAgent({
  model: createScriptedModel(),
  harness: createHarness(harnessCfg),
  verify: verifyReport,
  options: { maxSteps: 12, feedback: true, stallGuard: true, ...loopOpts },
});

test('healthy loop: think→act→check→feedback reaches done in 3 steps', async () => {
  const r = await setup();
  assert.equal(r.outcome, 'done');
  assert.equal(r.stoppedBy, 'model-text');
  assert.equal(r.calls.length, 2); // read + write; step 3 is the final text
  assert.equal(r.steps, 3);
  assert.equal(r.goalMet, true);
});

test('feedback dropped → identical calls spin to the step cap', async () => {
  const r = await setup({}, { feedback: false, stallGuard: false });
  assert.equal(r.outcome, 'max-steps');
  assert.equal(r.calls.length, 12);
  assert.ok(r.calls.every(c => c.name === 'read_file'));
});

test('stall guard bounds the same broken loop at 3 steps', async () => {
  const r = await setup({}, { feedback: false, stallGuard: true, stallAfter: 3 });
  assert.equal(r.outcome, 'stall');
  assert.equal(r.stoppedBy, 'stall-guard');
  assert.equal(r.steps, 3);
});

test('denied tool surfaces as a fault the model reports, then aborts', async () => {
  const r = await setup({ tools: ['search_docs', 'write_file'] });
  assert.equal(r.outcome, 'aborted');
  assert.equal(r.calls[0].fault, 'missing-tool');
  assert.match(r.resultMessage, /cannot reach/i);
  assert.equal(r.goalMet, false);
});

test('check stage records a verdict every step', async () => {
  const r = await setup();
  assert.equal(r.checks.length, r.calls.length);
  assert.equal(r.checks.at(-1).goalMet, true);
});
