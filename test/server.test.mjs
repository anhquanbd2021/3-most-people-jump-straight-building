import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../app/server.js';
import { once } from 'node:events';

async function withServer(fn) {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('health and version endpoints answer', async () => {
  await withServer(async (base) => {
    const h = await fetch(`${base}/health`);
    assert.equal(h.status, 200);
    assert.equal(await h.text(), 'ok');
    const v = await fetch(`${base}/version`);
    const body = await v.json();
    assert.equal(body.name, 'layer-atlas-demo');
    assert.equal(typeof body.version, 'string');
  });
});

test('allowlist serves the lab and its modules', async () => {
  await withServer(async (base) => {
    for (const p of ['/', '/guide.html', '/styles.css', '/app.js',
      '/harness.mjs', '/loop.mjs', '/graph.mjs', '/atlas.mjs', '/scenarios.mjs', '/model.mjs']) {
      const r = await fetch(`${base}${p}`);
      assert.equal(r.status, 200, p);
    }
  });
});

test('traversal and unknown paths get 404; POST gets 404', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
    assert.equal((await fetch(`${base}/health`, { method: 'POST' })).status, 404);
  });
});

test('security headers are present on every response', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/`);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });
});
