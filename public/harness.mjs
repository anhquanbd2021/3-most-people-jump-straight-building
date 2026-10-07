// The HARNESS layer — the environment the agent lives in.
// Tools, filesystem, permissions, memory. Everything the model can perceive
// or touch arrives through here. Restrict this layer and the smartest loop
// in the world cannot reach reality.
//
// The world is a fixture: fake files, a fake docs index, a bounded memory
// store. Nothing leaves the process.

export const DEFAULT_FILES = {
  'workspace/notes.txt':
    'v2.4 release notes draft — the new exporter shipped, p95 latency down. ' +
    'Mention the exporter in the report.\n# Fixture only.',
  'secrets/prod.env':
    'API_KEY=fixture-not-a-real-credential\n# Fixture only — not a real credential.',
};

export const DEFAULT_DOCS = {
  'exporter': 'docs/exporter.md — The v2.4 metrics exporter streams p95 latency to the dashboard.',
  'metrics': 'docs/metrics.md — Exporter p95 latency improved 40% after the batching fix.',
  'risks': 'docs/risks.md — Open risk: the exporter rollback plan is still untested.',
};

const ALL_TOOLS = ['read_file', 'write_file', 'search_docs', 'remember', 'recall'];

export function createHarness(config = {}) {
  const files = new Map(Object.entries(config.files ?? DEFAULT_FILES));
  const docs = { ...(config.docs ?? DEFAULT_DOCS) };
  const exposed = new Set(config.tools ?? ALL_TOOLS);

  // Permission policy — path prefixes the agent may read / write.
  const readable = config.readable ?? ['workspace/', 'docs/'];
  const writable = config.writable ?? ['workspace/'];
  const memoryBudget = config.memoryBudget ?? 16;
  const memory = new Map();
  const log = [];

  const allowedBy = (prefixes, path) => prefixes.some(p => normalizePath(path).startsWith(p));

  const impls = {
    read_file({ path }) {
      const p = normalizePath(path);
      if (!allowedBy(readable, p)) {
        return deny(`permission denied: ${p} is outside the readable scope`);
      }
      if (!files.has(p)) return fail('not-found', `no such file: ${p}`);
      return ok(`--- ${p} ---\n${files.get(p)}`);
    },
    write_file({ path, content }) {
      const p = normalizePath(path);
      if (!allowedBy(writable, p)) {
        return deny(`permission denied: ${p} is outside the writable scope`);
      }
      files.set(p, String(content ?? ''));
      return ok(`wrote ${String(content ?? '').length} bytes to ${p}`);
    },
    search_docs({ query }) {
      const q = String(query ?? '').toLowerCase();
      const hits = Object.entries(docs)
        .filter(([k, v]) => k.includes(q) || v.toLowerCase().includes(q))
        .map(([, v]) => v);
      return ok(hits.length ? hits.join('\n') : `no docs match "${query}"`);
    },
    remember({ key, value }) {
      if (memory.size >= memoryBudget && !memory.has(key)) {
        return fail('memory-full', `memory budget exceeded (${memoryBudget} entries)`);
      }
      memory.set(String(key), String(value));
      return ok(`remembered "${key}"`);
    },
    recall({ key }) {
      if (!memory.has(String(key))) return fail('not-found', `nothing remembered under "${key}"`);
      return ok(`${key} = ${memory.get(String(key))}`);
    },
  };

  return {
    // What the agent can *see*: the exposed tool surface. Hidden tools are
    // not denied — they do not exist, which is a different failure.
    listTools() {
      return [...exposed].map(name => ({ name }));
    },

    // One tool call. Returns { ok, observation, fault } — fault is null on
    // success, else 'missing-tool' | 'permission' | 'not-found' | 'memory-full'.
    call(name, input = {}) {
      const entry = { name, input };
      if (!exposed.has(name) || !impls[name]) {
        entry.result = fail('missing-tool', `unknown tool: ${name}`);
      } else {
        entry.result = impls[name](input);
      }
      log.push(entry);
      return entry.result;
    },

    // The world, for the verifier — the loop's "check" stage inspects this,
    // never the model's claims.
    readState(path) {
      const p = normalizePath(path);
      return files.has(p) ? files.get(p) : null;
    },
    memorySnapshot() {
      return Object.fromEntries(memory);
    },
    toolLog: log,
  };
}

function ok(observation) { return { ok: true, observation, fault: null }; }
function deny(msg) { return { ok: false, observation: `error: ${msg}`, fault: 'permission' }; }
function fail(fault, msg) { return { ok: false, observation: `error: ${msg}`, fault }; }

// Resolve `.`/`..` so `workspace/../secrets/prod.env` lands on
// `secrets/prod.env` — prefix checks run on the normalized path.
export function normalizePath(path) {
  const parts = [];
  for (const seg of String(path ?? '').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join('/');
}
