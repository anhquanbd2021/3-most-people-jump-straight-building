// The GRAPH layer — the workflow: nodes, branches, a parallel fan-out, a
// join, and shared state. This is where single agents become a system —
// and where the signature failure is a COLLISION on shared state.
//
// sharedStateMode:
//   'versioned' — compare-and-swap: a write carries the version it read.
//                 A stale base is a conflict → the node retries against
//                 fresh state. Both contributions survive.
//   'flat'      — last write wins: a stale overwrite is silently accepted.
//                 One parallel branch's work vanishes — the lost update.

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

export class StaleWriteError extends Error {
  constructor(key) { super(`stale write on "${key}"`); this.key = key; }
}

export function createSharedState(mode = 'versioned') {
  const store = new Map(); // key -> { value, version }
  const stats = { mode, conflicts: 0, retries: 0, lostUpdates: 0 };

  return {
    stats,
    read(key) {
      const entry = store.get(key);
      return { value: entry ? structuredClone(entry.value) : undefined,
               version: entry ? entry.version : 0 };
    },
    write(key, value, baseVersion = 0) {
      const current = store.get(key);
      const currentVersion = current ? current.version : 0;
      if (currentVersion !== baseVersion) {
        if (mode === 'versioned') {
          stats.conflicts += 1;
          throw new StaleWriteError(key);
        }
        // flat mode: the clobber IS the bug — count it, allow it
        stats.lostUpdates += 1;
      }
      store.set(key, { value: structuredClone(value), version: currentVersion + 1 });
      return true;
    },
    snapshot() {
      return Object.fromEntries([...store].map(([k, e]) => [k, structuredClone(e.value)]));
    },
  };
}

// spec: ordered steps; a step is {id, run} or {parallel: [{id, run}, ...]}.
// Each run(ctx) receives { shared, harness, events }. In 'versioned' mode a
// StaleWriteError retries the node once — the retry re-reads fresh state.
export async function runWorkflow(spec, { shared, harness, maxRetries = 1 }) {
  const events = [];

  async function runNode(node) {
    events.push({ type: 'start', node: node.id });
    try {
      await node.run({ shared, harness, events });
      events.push({ type: 'done', node: node.id });
    } catch (err) {
      if (err instanceof StaleWriteError) {
        throw err; // handled by the parallel wrapper
      }
      events.push({ type: 'error', node: node.id, error: err.message });
      throw err;
    }
  }

  async function runNodeWithRetry(node) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await runNode(node);
      } catch (err) {
        if (err instanceof StaleWriteError && attempt < maxRetries) {
          shared.stats.retries += 1;
          events.push({ type: 'retry', node: node.id, reason: err.message });
          continue;
        }
        throw err;
      }
    }
  }

  for (const step of spec) {
    if (step.parallel) {
      await Promise.all(step.parallel.map(runNodeWithRetry));
    } else {
      await runNodeWithRetry(step);
    }
  }

  return { shared: shared.snapshot(), stats: shared.stats, events };
}

// Deterministic interleave helper for nodes: read → yield → write forces
// the two parallel branches to overlap on the same base version.
export { tick };
