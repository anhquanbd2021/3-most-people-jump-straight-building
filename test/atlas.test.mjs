import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { diagnose, longestIdenticalRun } from '../public/atlas.mjs';
import { runScenario, PRESET_CONFIGS, SCENARIO_NAMES } from '../public/scenarios.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('every preset diagnoses to exactly one layer — or none', async () => {
  const expected = {
    'healthy': 'none',
    'restricted-harness': 'harness',
    'broken-loop': 'loop',
    'guarded-loop': 'loop',
    'racing-graph': 'graph',
    'versioned-graph': 'none',
  };
  for (const name of SCENARIO_NAMES) {
    const r = await runScenario(name);
    assert.equal(r.diagnosis.layer, expected[name], `${name} → ${r.diagnosis.layer}`);
    assert.ok(r.diagnosis.evidence.length > 0, `${name} has evidence`);
  }
});

test('symptom vocabulary is stable: can\'t reach / spinning / colliding / healthy', async () => {
  const symptoms = {};
  for (const name of SCENARIO_NAMES) {
    symptoms[name] = (await runScenario(name)).diagnosis.symptom;
  }
  assert.equal(symptoms['restricted-harness'], "can't reach");
  assert.equal(symptoms['broken-loop'], 'spinning');
  assert.equal(symptoms['racing-graph'], 'colliding');
  assert.equal(symptoms['healthy'], 'healthy');
});

test('longestIdenticalRun counts consecutive repeats, not total repeats', () => {
  const calls = [
    { name: 'a', input: { x: 1 } }, { name: 'a', input: { x: 1 } },
    { name: 'b', input: {} }, { name: 'a', input: { x: 1 } },
  ];
  assert.equal(longestIdenticalRun(calls), 2);
});

test('a healthy run with zero calls is not misdiagnosed as a loop stall', () => {
  const d = diagnose({ calls: [], outcome: 'done', goalMet: true });
  assert.equal(d.layer, 'none');
});

test('examples/*.json mirror PRESET_CONFIGS exactly', async () => {
  for (const name of SCENARIO_NAMES) {
    const json = JSON.parse(await readFile(`${root}examples/${name}.json`, 'utf8'));
    assert.deepEqual(json, PRESET_CONFIGS[name], name);
  }
});
