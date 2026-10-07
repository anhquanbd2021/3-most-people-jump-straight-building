// CLI side-by-side report: run every preset, print outcome + diagnosed layer.
// Usage: node scripts/report.mjs
import { runScenario, SCENARIO_NAMES, PRESET_LABELS } from '../public/scenarios.mjs';

const pad = (s, n) => String(s).padEnd(n);
const line = '─'.repeat(96);

console.log('\nLayer Atlas — one fault per layer\n');
console.log(pad('scenario', 20) + pad('outcome', 12) + pad('steps', 7) + pad('layer', 9) + 'symptom');
console.log(line);

let faults = 0;
for (const name of SCENARIO_NAMES) {
  const r = await runScenario(name);
  const d = r.diagnosis;
  if (d.layer !== 'none') faults += 1;
  console.log(
    pad(name, 20) + pad(r.outcome, 12) + pad(r.steps, 7) + pad(d.layer, 9) + d.symptom);
  for (const e of d.evidence.slice(0, 2)) console.log(pad('', 48) + '↳ ' + e);
}
console.log(line);
console.log(`\n${SCENARIO_NAMES.length} scenarios · ${faults} fault signatures · ` +
  `${SCENARIO_NAMES.length - faults} healthy\n`);
console.log('Reading the table: the SAME task + SAME model fail three different ways —');
console.log('the layer you degraded decides the symptom, not the bug you can see.');
