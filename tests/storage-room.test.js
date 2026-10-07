import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newPlan, savePlan, listPlans, deletePlans, storageFraction, isStorageAlmostFull, onSaveFailed, STORAGE_LIMIT_CHARS, cacheSet } from '../src/store.js';
import { splitPlans, todayIso } from '../src/ui/home.js';
import { STRINGS } from '../src/i18n.js';

/** A localStorage that is really limited: it throws (like QuotaExceededError) when the stored characters would pass `limit`. */
function limitedStorage(limit) {
  const data = {};
  const size = () => Object.entries(data).reduce((n, [k, v]) => n + k.length + v.length, 0);
  const ls = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem(k, v) { const next = size() - (k in data ? k.length + data[k].length : 0) + k.length + String(v).length; if (next > limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    get length() { return Object.keys(data).length; }, key: (i) => Object.keys(data)[i],
    data,
  };
  return ls;
}
const use = (ls) => { globalThis.localStorage = ls; };
const planOf = (date, name = 'X') => { const p = newPlan(); p.fields = { ...p.fields, centreName: name, examDate: date }; return p; };

test('failed save: when the storage is full the app is told (the screen shows "Couldn\'t save this plan ... Delete old plans" with a button), never silently', () => {
  use(limitedStorage(3000));
  let told = 0; onSaveFailed(() => { told++; });
  const small = planOf('2026-01-01', 'fits');
  savePlan(small);
  assert.equal(told, 0);
  assert.equal(listPlans().length, 1);
  const big = planOf('2026-01-02', 'x'.repeat(5000));                       // can never fit
  savePlan(big);
  assert.equal(told, 1);
  assert.equal(listPlans().length, 1);                                       // the old plan is still there, nothing was deleted
  // the message and the button text, in English and Hindi, and the screen wiring
  assert.equal(STRINGS.en.saveFailed, "Couldn't save this plan. Your phone's storage for this app is full. Delete old plans to make space.");
  assert.ok(STRINGS.en.openPlansList && STRINGS.hi.saveFailed && STRINGS.hi.openPlansList);
  const app = readFileSync('src/app.js', 'utf8');
  assert.match(app, /onSaveFailed\(/);
  assert.match(app, /t\('saveFailed'\)/);
  assert.match(app, /t\('openPlansList'\)[\s\S]{0,200}|onclick: \(\) => \{ bar\.remove\(\); location\.hash = '#\/'/);       // the button goes to the plans list (home)
  assert.match(app, /location\.hash = '#\/'/);
});

test('tight storage: the search and nearby caches are cleared BEFORE a plan save fails; plans are never touched', () => {
  const ls = limitedStorage(4000); use(ls);
  savePlan(planOf('2026-01-01', 'first'));
  cacheSet('lru_nearby', 'n'.repeat(1500)); cacheSet('lru_search', 's'.repeat(1200));       // caches fill most of the rest
  assert.ok(Object.keys(ls.data).some((k) => k.startsWith('cw_c_')));
  let told = 0; onSaveFailed(() => { told++; });
  const before = told;
  savePlan(planOf('2026-01-02', 'second'));                                                  // does not fit until the caches are gone
  assert.equal(told, before, 'the save succeeded after clearing caches');
  assert.equal(listPlans().length, 2);
  assert.ok(!Object.keys(ls.data).some((k) => k.startsWith('cw_c_')), 'caches were cleared');
  assert.deepEqual(listPlans().map((p) => p.fields.centreName).sort(), ['first', 'second']);
});

test('80% warning: storageFraction counts what is used, the home screen warns above 80% (and not below)', () => {
  use(limitedStorage(STORAGE_LIMIT_CHARS * 2));
  assert.ok(storageFraction() < 0.01);
  assert.equal(isStorageAlmostFull(), false);
  localStorage.setItem('cw_filler', 'x'.repeat(Math.floor(STORAGE_LIMIT_CHARS * 0.79)));
  assert.equal(isStorageAlmostFull(), false);                                                // 79%: no warning
  localStorage.setItem('cw_filler', 'x'.repeat(Math.floor(STORAGE_LIMIT_CHARS * 0.81)));
  assert.ok(storageFraction() > 0.8);
  assert.equal(isStorageAlmostFull(), true);                                                 // 81%: warning
  assert.equal(STRINGS.en.storageAlmostFull, 'Storage almost full. Delete old plans.');
  assert.ok(STRINGS.hi.storageAlmostFull);
  const home = readFileSync('src/ui/home.js', 'utf8');
  assert.match(home, /isStorageAlmostFull\(\) \? note\(t\('storageAlmostFull'\), 'warn'\)/);
});

test('past exams: a plan whose date has passed goes to "Past exams" (most recent first); no date or today stays in the main list', () => {
  const plans = [planOf('2026-03-01', 'past-old'), planOf('2026-05-20', 'today'), planOf('2026-06-10', 'future'), planOf('', 'no date'), planOf('2026-05-19', 'past-new')];
  const { upcoming, past } = splitPlans(plans, '2026-05-20');
  assert.deepEqual(past.map((p) => p.fields.centreName), ['past-new', 'past-old']);
  assert.deepEqual(upcoming.map((p) => p.fields.centreName), ['today', 'future', 'no date']);
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05');
  assert.deepEqual(splitPlans([]), { upcoming: [], past: [] });
});

test('"Delete all past exams": only on a tap and after a confirmation, only the past plans; nothing is deleted automatically', () => {
  use(limitedStorage(STORAGE_LIMIT_CHARS));
  const keep = planOf('2099-01-01', 'future'); const nodate = planOf('', 'nodate'); const old1 = planOf('2020-01-01', 'old1'); const old2 = planOf('2021-01-01', 'old2');
  for (const p of [keep, nodate, old1, old2]) savePlan(p);
  assert.equal(listPlans().length, 4);                                                       // saving and listing deletes nothing, however old
  const { past } = splitPlans(listPlans());
  assert.deepEqual(past.map((p) => p.fields.centreName).sort(), ['old1', 'old2']);
  deletePlans(past.map((p) => p.id));
  assert.deepEqual(listPlans().map((p) => p.fields.centreName).sort(), ['future', 'nodate']);
  const home = readFileSync('src/ui/home.js', 'utf8');
  assert.match(home, /t\('pastExams'\)/);
  assert.match(home, /button\(t\('deleteAllPast'\), \(\) => \{ if \(confirm\(t\('confirmDeleteAllPast'\)\)\)/);     // a confirmation first
  assert.equal(STRINGS.en.pastExams, 'Past exams');
  assert.equal(STRINGS.en.deleteAllPast, 'Delete all past exams');
  assert.ok(!/deletePlans?\(/.test(readFileSync('src/store.js', 'utf8').replace(/export function deletePlans?[^\n]*\n/g, '').replace(/\/\/.*$/gm, '')));      // the store never deletes by itself
});
