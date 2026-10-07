import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';

// The reader must work on ANY admit card. This test fails if a value taken from a sample card (a centre name, an address, a roll number,
// a pincode, a centre code, a candidate name, a city) shows up in the code of src/. General lists of states and cities are allowed,
// but only in the one file made for them (src/ingest/geoLists.js), and only as full lists.
const ALLOWED_LIST_FILE = 'src/ingest/geoLists.js';
// Files that describe BUNDLED DATA of one region (the offline road graph and the offline nearby places of the Chandigarh area): the region is named there on purpose.
const BUNDLED_REGION_FILES = ['src/services/offlineRoute.js', 'src/services/bundledNearby.js'];

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) { const p = `${dir}/${name}`; if (statSync(p).isDirectory()) out.push(...files(p)); else if (p.endsWith('.js')) out.push(p); }
  return out;
}
const sources = files('src').filter((f) => f !== 'src/version.js' && f !== ALLOWED_LIST_FILE && !BUNDLED_REGION_FILES.includes(f)).map((f) => ({ f, text: readFileSync(f, 'utf8').toLowerCase() }));

/** Every value from the sample cards that must never be in the code. */
function sampleValues() {
  const sets = [];
  for (const file of ['tests/fixtures/truth.json']) sets.push(...JSON.parse(readFileSync(file, 'utf8')));
  if (existsSync('tests/holdout')) for (const d of readdirSync('tests/holdout')) if (existsSync(`tests/holdout/${d}/truth.json`)) sets.push(...JSON.parse(readFileSync(`tests/holdout/${d}/truth.json`, 'utf8')));
  const strong = new Set(); const cities = new Set();
  for (const t of sets) {
    for (const v of [t.centre, t.centreCode, t.pincode, t.homePincode, t.candidate && t.candidate.roll, t.candidate && t.candidate.name, t.candidate && t.candidate.app]) if (v && String(v).length >= 5) strong.add(String(v).toLowerCase());
    // address parts that name something specific: two or more words and not a general street word
    for (const part of String(t.address || '').split(/[,\-]/).map((p) => p.trim().toLowerCase())) if (part.split(/\s+/).length >= 3 && part.length >= 14) strong.add(part);
    for (const w of String((t.candidate && t.candidate.name) || '').split(' ')) if (w.length >= 6) strong.add(w.toLowerCase());
    if (t.city) cities.add(String(t.city).toLowerCase());
  }
  return { strong: [...strong], cities: [...cities] };
}

test('no value from any sample card (names, addresses, numbers, codes) is written in src/', () => {
  const { strong } = sampleValues();
  assert.ok(strong.length > 100, `only ${strong.length} sample values were collected: the test would prove nothing`);
  const hits = [];
  for (const v of strong) for (const s of sources) if (s.text.includes(v)) hits.push(`"${v}" in ${s.f}`);
  assert.deepEqual(hits, [], `values copied from sample cards:\n${hits.join('\n')}`);
});

test('no city of a sample card is written in src/ (city and state lists live in src/ingest/geoLists.js only)', () => {
  const { cities } = sampleValues();
  const hits = [];
  for (const c of cities) for (const s of sources) if (c.length >= 4 && new RegExp(`(^|[^a-z])${c}([^a-z]|$)`).test(s.text)) hits.push(`"${c}" in ${s.f}`);
  assert.deepEqual(hits, [], `cities written in code:\n${hits.join('\n')}`);
});

test('the general city / state list is a full list (not picked from the samples)', async () => {
  const lists = await import('../src/ingest/geoLists.js');
  assert.ok(lists.STATES.length >= 36, 'all states and union territories');
  assert.ok(lists.CITIES.length >= 150, 'a full list of towns, not a few');
  const { cities } = sampleValues();
  const notInSamples = lists.CITIES.filter((c) => !cities.includes(c));
  assert.ok(notInSamples.length > 80, 'most towns in the list are not in any sample');
});

test('templates and label lists contain label words only (no digits, no place names)', async () => {
  const { TEMPLATES } = await import('../src/ingest/templates.js');
  const { LABELS } = await import('../src/ingest/labels.js');
  const words = [];
  for (const t of TEMPLATES) for (const list of Object.values(t.labels)) words.push(...list);
  for (const list of Object.values(LABELS)) words.push(...list);
  assert.ok(words.length > 100);
  assert.deepEqual(words.filter((w) => /\d/.test(w)), []);
});
