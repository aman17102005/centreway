import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Runs sw.js against a tiny fake browser (caches, fetch, events) so the update behaviour can be tested without a browser. */
function loadWorker({ online = true, files = {} } = {}) {
  const listeners = {}; const stores = new Map(); const calls = { skipWaiting: 0, claim: 0, fetched: [] };
  const cacheOf = (name) => { if (!stores.has(name)) stores.set(name, new Map()); const m = stores.get(name); return {
    add: async (req) => { const url = typeof req === 'string' ? req : req.url; if (!(url in files)) throw new Error('missing'); m.set(url, files[url]); },
    put: async (req, res) => { m.set(req.url, await res.text()); },
    match: async (req) => { const url = typeof req === 'string' ? req : req.url; return m.has(url) ? { ok: true, text: async () => m.get(url) } : undefined; },
  }; };
  class Request { constructor(input, init = {}) { this.url = typeof input === 'string' ? new URL(input, 'http://app.test/').href : input.url; this.method = input.method || 'GET'; this.mode = input.mode || 'cors'; this.cache = init.cache || input.cache; } }
  const context = {
    URL, Request, Response: { error: () => ({ error: true }) },
    caches: { open: async (n) => cacheOf(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) },
    fetch: async (req) => { calls.fetched.push({ url: req.url, cache: req.cache }); if (!online) throw new Error('offline'); const body = files[req.url]; return { ok: body !== undefined, text: async () => body, clone() { return this; } }; },
    location: { origin: 'http://app.test' },
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: () => { calls.skipWaiting++; return Promise.resolve(); }, clients: { claim: () => { calls.claim++; return Promise.resolve(); } } },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('sw.js', 'utf8').replace(/^const /gm, 'var '), context);     // top-level consts are visible as properties
  const fire = async (type, ev = {}) => { let p; listeners[type]({ ...ev, waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; } }); return p; };
  return { fire, stores, calls, context };
}

const page = { 'http://app.test/index.html': '<html>new</html>', 'http://app.test/src/app.js': 'new code' };

test('install: the new worker takes over at once (skipWaiting), even when a file to save is missing', async () => {
  const w = loadWorker({ files: page });
  await w.fire('install');
  assert.equal(w.calls.skipWaiting, 1);
});

test('activate: every older cache is deleted and the page is claimed', async () => {
  const w = loadWorker({ files: page });
  w.stores.set('centreway-v4', new Map()); w.stores.set('centreway-1.0.0-old', new Map());
  await w.fire('install');
  await w.fire('activate');
  assert.deepEqual([...w.stores.keys()].sort(), [w.context.CACHE]);
  assert.equal(w.calls.claim, 1);
});

test('fetch: files come fresh from the network (browser cache bypassed) and the saved copy is only used when offline', async () => {
  const req = new (loadWorker().context.Request)('http://app.test/src/app.js');
  const online = loadWorker({ files: page });
  await online.fire('install');
  const res = await online.fire('fetch', { request: req });
  assert.equal(await res.text(), 'new code');
  assert.ok(online.calls.fetched.some((f) => f.url.endsWith('/src/app.js') && f.cache === 'no-cache'));
  // the same worker, now offline: the saved copy answers
  online.context.fetch = async () => { throw new Error('offline'); };
  const offline = await online.fire('fetch', { request: req });
  assert.equal(await offline.text(), 'new code');
});

test('fetch: other sites and non-GET requests are not touched (the worker does not answer them)', async () => {
  const w = loadWorker({ files: page });
  assert.equal(await w.fire('fetch', { request: { url: 'https://nominatim.openstreetmap.org/search', method: 'GET' } }), undefined);
  assert.equal(await w.fire('fetch', { request: { url: 'http://app.test/src/app.js', method: 'POST' } }), undefined);
});

test('every new version gets a new cache name (the version is part of the cache name)', () => {
  const w = loadWorker();
  assert.match(w.context.CACHE, /^centreway-/);
  assert.equal(w.context.CACHE, `centreway-${w.context.VERSION}`);
});
