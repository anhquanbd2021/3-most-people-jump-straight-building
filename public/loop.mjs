// The LOOP layer — the thinking cycle: think → act → check → feedback.
//
// Two knobs make its failure modes visible:
//   feedback:   whether each action's observation lands back in the
//               transcript. Drop it and the model re-issues the same call —
//               the "spinning" symptom.
//   stallGuard: progress detection. On = stop after `stallAfter` identical
//               consecutive calls (the fix). Off = burn to maxSteps (the
//               naive default — a step cap is a safety net, not a strategy).

export async function runAgent({ model, harness, verify, options = {} }) {
  const { maxSteps = 12, feedback = true, stallGuard = true, stallAfter = 3 } = options;

  const transcript = [];
  const calls = [];
  const checks = [];
  let steps = 0;
  let stallRun = 0;
  let stoppedBy = 'max-steps';
  let resultMessage = null;
  let goalMet = false;

  while (steps < maxSteps) {
    // THINK
    const step = await model.next(transcript);
    steps += 1;

    if (step.type === 'text') {
      stoppedBy = 'model-text';
      resultMessage = step.text;
      break;
    }

    // ACT
    const result = harness.call(step.name, step.input);
    const rec = {
      step: steps, name: step.name, input: step.input,
      ok: result.ok, fault: result.fault, observation: result.observation,
    };
    calls.push(rec);

    // stall detection — identical call back-to-back means no progress
    const prev = calls[calls.length - 2];
    const identical = prev && prev.name === rec.name
      && JSON.stringify(prev.input) === JSON.stringify(rec.input);
    stallRun = identical ? stallRun + 1 : 0;

    // CHECK — the verifier inspects the world, not the model's claims
    goalMet = Boolean(verify ? verify(harness) : false);
    checks.push({ step: steps, goalMet });

    // FEEDBACK — the observation either lands or is silently dropped
    transcript.push(feedback
      ? { step: steps, call: { name: step.name, input: step.input }, observation: result.observation }
      : { step: steps, call: { name: step.name, input: step.input } });

    if (stallGuard && stallRun >= stallAfter - 1) {
      stoppedBy = 'stall-guard';
      break;
    }
  }

  const outcome = stoppedBy === 'model-text'
    ? (goalMet ? 'done' : 'aborted')
    : (stoppedBy === 'stall-guard' ? 'stall' : 'max-steps');

  return { outcome, stoppedBy, steps, calls, transcript, checks, goalMet, resultMessage };
}
