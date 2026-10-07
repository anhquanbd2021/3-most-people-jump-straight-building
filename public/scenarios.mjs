// Preset fault modes + the runner that wires harness → loop/graph → atlas.
// Each preset degrades exactly ONE layer; everything else stays healthy.
// `examples/*.json` mirror PRESET_CONFIGS byte-for-byte (parity-tested).

import { createHarness } from './harness.mjs';
import { createScriptedModel, TASK } from './model.mjs';
import { runAgent } from './loop.mjs';
import { createSharedState, runWorkflow, tick } from './graph.mjs';
import { diagnose } from './atlas.mjs';

export const TEAM_TASK =
  'Two analysts research metrics and risks in parallel, then one report joins their findings.';

// ---- verifiers: the "check" stage inspects the world -------------------
export function verifyReport(harness) {
  const r = harness.readState('workspace/report.md');
  return r != null && /exporter/i.test(r);
}

export function verifyTeam(sharedSnapshot) {
  const r = sharedSnapshot.report;
  return typeof r === 'string'
    && !r.includes('MISSING')
    && /metrics/i.test(r) && /risks/i.test(r);
}

// ---- the team workflow: brief → two parallel analysts → join -----------
const analyst = (topic) => ({
  id: `analyst-${topic}`,
  async run({ shared, harness }) {
    const r = harness.call('search_docs', { query: topic });
    const snap = shared.read('findings');   // read base version …
    await tick();                           // … yield: the sibling runs here …
    shared.write('findings', { ...snap.value, [topic]: r.observation }, snap.version); // … then write
  },
});

export function teamWorkflow() {
  return [
    {
      id: 'brief',
      async run({ shared }) {
        const snap = shared.read('findings');
        shared.write('findings', {}, snap.version);
      },
    },
    { parallel: [analyst('metrics'), analyst('risks')] },
    {
      id: 'assemble',
      async run({ shared }) {
        const { value: findings } = shared.read('findings');
        const report = [
          '# Team report',
          '',
          `Metrics: ${findings?.metrics ?? 'MISSING'}`,
          `Risks: ${findings?.risks ?? 'MISSING'}`,
        ].join('\n');
        const snap = shared.read('report');
        shared.write('report', report, snap.version);
      },
    },
  ];
}

// ---- presets: one layer degraded at a time ------------------------------
// Mirrored by examples/*.json — the parity test keeps them identical.
export const PRESET_CONFIGS = {
  healthy: {
    task: 'agent',
    harness: {},
    loop: { maxSteps: 12, feedback: true, stallGuard: true },
  },
  'restricted-harness': {
    task: 'agent',
    harness: {
      tools: ['search_docs', 'write_file'],   // read_file is gone entirely
      readable: ['docs/'],                    // workspace/ is out of scope
      writable: ['workspace/'],
      memoryBudget: 16,
    },
    loop: { maxSteps: 12, feedback: true, stallGuard: true },
  },
  'broken-loop': {
    task: 'agent',
    harness: {},
    loop: { maxSteps: 12, feedback: false, stallGuard: false },
  },
  'guarded-loop': {
    task: 'agent',
    harness: {},
    loop: { maxSteps: 12, feedback: false, stallGuard: true, stallAfter: 3 },
  },
  'racing-graph': {
    task: 'team',
    harness: {},
    graph: { sharedStateMode: 'flat' },       // last write wins
  },
  'versioned-graph': {
    task: 'team',
    harness: {},
    graph: { sharedStateMode: 'versioned' },  // compare-and-swap + retry
  },
};

export const PRESET_LABELS = {
  'healthy': 'Healthy stack',
  'restricted-harness': 'Restricted harness',
  'broken-loop': 'Broken loop — feedback dropped',
  'guarded-loop': 'Broken loop + stall guard',
  'racing-graph': 'Racing graph — flat shared state',
  'versioned-graph': 'Versioned graph — CAS + retry',
};

export async function runScenario(name) {
  const preset = PRESET_CONFIGS[name];
  if (!preset) throw new Error(`unknown scenario: ${name}`);
  const harness = createHarness(preset.harness ?? {});

  if (preset.task === 'agent') {
    const run = await runAgent({
      model: createScriptedModel(),
      harness,
      verify: verifyReport,
      options: preset.loop,
    });
    const report = {
      scenario: name, label: PRESET_LABELS[name], task: TASK,
      toolsOffered: harness.listTools().map(t => t.name),
      ...run,
    };
    report.diagnosis = diagnose(report);
    return report;
  }

  // team task — the graph layer
  const shared = createSharedState(preset.graph.sharedStateMode);
  const run = await runWorkflow(teamWorkflow(), { shared, harness });
  const goalMet = verifyTeam(run.shared);
  const report = {
    scenario: name, label: PRESET_LABELS[name], task: TEAM_TASK,
    outcome: goalMet ? 'done' : 'collision',
    stoppedBy: goalMet ? 'join-complete' : 'lost-update',
    steps: run.events.filter(e => e.type === 'done').length,
    calls: harness.toolLog.map(e => ({
      name: e.name, input: e.input,
      ok: e.result.ok, fault: e.result.fault, observation: e.result.observation,
    })),
    graphStats: run.stats,
    shared: run.shared,
    events: run.events,
    goalMet,
    resultMessage: run.shared.report ?? null,
  };
  report.diagnosis = diagnose(report);
  return report;
}

export const SCENARIO_NAMES = Object.keys(PRESET_CONFIGS);
