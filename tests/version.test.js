import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentVersion } from '../scripts/stamp-version.js';

// If this fails, run `npm run stamp` (npm start does it for you). It makes sure every change gets a new version number,
// so the service worker updates itself and the footer shows which copy of the app is running.
test('the version stamp is up to date (src/version.js, version.json and sw.js all match the files)', () => {
  const expected = currentVersion();
  assert.match(readFileSync('src/version.js', 'utf8'), new RegExp(`APP_VERSION = '${expected}'`));
  assert.equal(JSON.parse(readFileSync('version.json', 'utf8')).version, expected);
  assert.match(readFileSync('sw.js', 'utf8'), new RegExp(`^const VERSION = '${expected}';$`, 'm'));
});

test('the service worker always takes over and loads fresh files first', () => {
  const sw = readFileSync('sw.js', 'utf8');
  assert.match(sw, /skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  assert.match(sw, /cache: 'no-cache'/);                 // network first, never the browser's own cache
  assert.match(sw, /caches\.delete\(k\)/);               // old versions are deleted
  const app = readFileSync('src/app.js', 'utf8');
  assert.match(app, /controllerchange/);                 // the page reloads when a new worker takes over
  assert.match(app, /APP_VERSION/);                      // and shows the version in the footer
});
