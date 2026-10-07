// Gives the app a version number that changes whenever any app file changes:   npm run stamp
// version = the number in package.json + a short fingerprint of every app file.
// It is written to src/version.js (shown in the footer), version.json (the app checks it for updates) and sw.js
// (a new sw.js makes the browser install the new service worker, which then reloads the page).
// tests/version.test.js fails when the stamp is out of date, so a change can never ship with an old number.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const SKIP = new Set(['src/version.js', 'version.json']);

function files(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir)).sort()) {
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(root, rel)).isDirectory()) out.push(...files(rel)); else out.push(rel);
  }
  return out;
}

/** The fingerprint: names and contents of the app files (sw.js without its own version line). */
export function fingerprint() {
  const list = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', ...files('src'), ...files('data'), 'dsa.html'].filter((f) => existsSync(join(root, f)) && !SKIP.has(f));
  const hash = createHash('sha256');
  for (const f of list) {
    let text = readFileSync(join(root, f), 'utf8');
    if (f === 'sw.js') text = text.replace(/^const VERSION = .*$/m, '');
    hash.update(f).update('\0').update(text).update('\0');
  }
  return hash.digest('hex').slice(0, 8);
}

export function currentVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return `${pkg.version}-${fingerprint()}`;
}

export function stamp() {
  const version = currentVersion();
  writeFileSync(join(root, 'src/version.js'), `// Written by scripts/stamp-version.js (npm run stamp). Do not edit by hand.\nexport const APP_VERSION = '${version}';\n`);
  writeFileSync(join(root, 'version.json'), `${JSON.stringify({ version })}\n`);
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  writeFileSync(join(root, 'sw.js'), sw.replace(/^const VERSION = .*$/m, `const VERSION = '${version}';`));
  return version;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(`Version ${stamp()}`);
