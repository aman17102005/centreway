import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Checks the project rules for src/dsa/: no library imports, no built-in Map/Set/sort,
// and every file starts with the explanation block (what, where used, time, space, why).
const dir = join(fileURLToPath(import.meta.url), '..', '..', 'src', 'dsa');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

test('src/dsa has the expected files', () => {
  for (const name of ['hashMap', 'lruCache', 'queue', 'rateLimiter', 'stack', 'minHeap', 'graph', 'dijkstra', 'aStar', 'haversine',
    'spatialGrid', 'kdTree', 'topK', 'mergeSort', 'trie', 'editDistance', 'kmp', 'fieldScanner', 'leaveBy']) {
    assert.ok(files.includes(`${name}.js`), `${name}.js exists`);
  }
});

test('src/dsa: no libraries, no Map/Set/sort', () => {
  for (const file of files) {
    const code = withoutComments(readFileSync(join(dir, file), 'utf8'));
    for (const match of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.ok(match[1].startsWith('./'), `${file} imports only its own files (${match[1]})`);
    assert.ok(!/\bnew\s+(Map|Set|WeakMap|WeakSet)\b/.test(code), `${file} does not use built-in Map/Set`);
    assert.ok(!/\.sort\s*\(/.test(code), `${file} does not use Array.prototype.sort`);
    assert.ok(!/\brequire\s*\(/.test(code), `${file} has no require()`);
  }
});

test('src/dsa: every file starts with the explanation comment block', () => {
  for (const file of files) {
    const source = readFileSync(join(dir, file), 'utf8').trimStart();
    assert.ok(source.startsWith('/*'), `${file} starts with a comment block`);
    const header = source.slice(0, source.indexOf('*/'));
    for (const word of ['Used by', 'Time', 'Space', 'Why']) assert.ok(header.includes(word), `${file} header mentions "${word}"`);
  }
});
