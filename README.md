# Layer Atlas — companion demo

Interactive lab for the article *Every AI Agent Is Three Layers — Debug the
One That's Broken*. A miniature agent system where you can degrade each of
the three layers independently — harness, loop, graph — and an atlas that
maps the resulting symptom back to the broken layer.

Zero dependencies — Node 20+ only. The harness, loop engine, graph runner,
and diagnoser are plain ES modules shared by the browser UI, the CLI, and
the test suite.

## The three layers, made runnable

| Layer | Module | What it is | Break it and see |
|---|---|---|---|
| **Harness** | `public/harness.mjs` | Tool registry + permission scope + bounded memory — what the agent can access | `read_file` removed, `workspace/` denied → the agent says *can't reach* and aborts |
| **Loop** | `public/loop.mjs` | think → act → check → feedback, with stall detection | `feedback: false` → the same call repeats to the step cap — *spinning* |
| **Graph** | `public/graph.mjs` | nodes → parallel fan-out → join over shared state | `flat` shared state → the second branch overwrites the first — *colliding* |
| **Atlas** | `public/atlas.mjs` | `diagnose(report)` → `{layer, symptom, evidence}` | turns the transcript into a layer attribution |

`public/model.mjs` is a deterministic scripted stand-in for the LLM — same
task, same "brain" in every run, so the only variable is the layer you broke.

## Six presets

`healthy` · `restricted-harness` · `broken-loop` · `guarded-loop` (same
break, stall detector on) · `racing-graph` · `versioned-graph` (same race,
compare-and-swap + retry). Each lives in `examples/<name>.json` and is
parity-tested against `public/scenarios.mjs`.

## Run it

```text
npm start        # serve the lab on :3000
npm test         # harness + loop + graph + atlas + server
npm run report   # all six presets, side-by-side table
npm run check    # both
```

## What it proves

- The same task + same model fails three different ways — the degraded layer
  decides the symptom, so the symptom localizes the bug.
- A restricted harness fails *gracefully* ("can't reach") while a broken loop
  fails *silently* (spins until a cap) — different blast radiuses.
- Versioned shared state turns a lost update into a retried conflict — the
  race still happens; only the outcome changes.

## Honest limits

- The "model" is a state machine, not an LLM — the lab is about *where*
  failures live, not how smart the brain is.
- The graph runner interleaves two branches in one process; real workflows
  add cross-process races, partial failures, and ordering guarantees this
  demo doesn't model.
- `diagnose()` implements three signature symptoms — production faults can
  cross layers (a flaky tool can masquerade as a loop stall).
- The world is a fixture: fake files, a fake docs index, and an
  obviously-fake `secrets/prod.env` — nothing real, nothing leaves the
  process.

This is an educational demo, not production infrastructure.
