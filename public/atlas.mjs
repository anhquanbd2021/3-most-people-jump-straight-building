// The ATLAS — the diagnoser this lab is named for. Every failure lands in
// exactly one layer, and each layer has a signature symptom:
//
//   harness → "can't reach"   : tools missing, permissions denied,
//                               dead reads — the agent can't touch reality
//   loop    → "spinning"      : identical calls repeat, no progress,
//                               burns to the step cap — thinking without
//                               feedback
//   graph   → "colliding"     : parallel branches lose updates on shared
//                               state — work is done, then overwritten
//
// diagnose() maps a run report to { layer, symptom, evidence[] }.

export function diagnose(report) {
  const { calls = [], outcome, goalMet, graphStats = null, shared = null } = report;
  const evidence = [];

  // --- harness: the agent tried to act and the world refused ----------
  const reachFaults = calls.filter(c => c.fault === 'permission' || c.fault === 'missing-tool');
  if (reachFaults.length && !goalMet) {
    for (const c of reachFaults) evidence.push(`${c.name}(${JSON.stringify(c.input)}): ${c.observation}`);
    return {
      layer: 'harness',
      symptom: 'can\'t reach',
      evidence: [
        `${reachFaults.length} blocked/missing tool call(s)`,
        ...evidence,
        'the loop was fine — the world it could touch was not',
      ],
    };
  }

  // --- graph: work finished and then silently vanished ----------------
  if (graphStats && graphStats.lostUpdates > 0) {
    return {
      layer: 'graph',
      symptom: 'colliding',
      evidence: [
        `${graphStats.lostUpdates} lost update(s) on shared state`,
        'a parallel branch wrote, then a sibling overwrote it — last write won',
      ],
    };
  }

  // --- loop: the same thought, again and again -------------------------
  const longestRun = longestIdenticalRun(calls);
  if (!goalMet && (outcome === 'stall' || outcome === 'max-steps' || longestRun >= 3)) {
    const r = calls.length ? calls[calls.length - 1] : null;
    return {
      layer: 'loop',
      symptom: 'spinning',
      evidence: [
        r ? `identical call repeated: ${r.name}(${JSON.stringify(r.input)}) x${Math.max(longestRun, 1)}` : 'no calls issued',
        `stopped by ${report.stoppedBy ?? outcome} at ${report.steps} steps`,
        'observations never reached the model — feedback is part of the loop',
      ],
    };
  }

  // --- graph soft signal: conflicts existed but versioned state healed them
  if (graphStats && graphStats.conflicts > 0) {
    return {
      layer: 'none',
      symptom: 'healthy',
      evidence: [
        `${graphStats.conflicts} write conflict(s) detected and retried — versioned shared state absorbed them`,
      ],
    };
  }

  return {
    layer: 'none',
    symptom: 'healthy',
    evidence: goalMet ? ['goal verified against the world, not the transcript'] : ['no fault signature detected'],
  };
}

export function longestIdenticalRun(calls) {
  let best = 0, run = 0, prevKey = null;
  for (const c of calls) {
    const key = `${c.name}(${JSON.stringify(c.input)})`;
    run = key === prevKey ? run + 1 : 1;
    prevKey = key;
    if (run > best) best = run;
  }
  return best;
}
