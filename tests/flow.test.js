import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft, finalizeDraft, leaveForDay, draftFields } from '../src/flow/autoPlan.js';
import { reminderTime, icsForPlans } from '../src/flow/reminders.js';
import { routeFor } from '../src/flow/routePlan.js';
import { extractExamFields, makeField } from '../src/ingest/examFields.js';
import { linesFromText } from '../src/ingest/layout.js';
import { leaveByFor } from '../src/ui/step4.js';
import { friendlyTime, friendlyDate } from '../src/ui/summary.js';

const cardText = ['Exam Name: Demo Exam 2026', 'Exam Date: 14/03/2026', 'Reporting Time: 08:30 AM', 'Gate Closing Time: 09:15 AM', 'Exam Time: 09:30 AM - 11:30 AM',
  'Exam Centre: Demo School', 'Centre Address: Sector 9, Chandigarh - 160009', 'Instructions: Mobile phones and calculators are not allowed.'].join('\n');
const readOf = () => ({ result: extractExamFields(linesFromText(cardText), { sourceConf: 100 }), source: 'test' });

const fakeDeps = (log = []) => ({
  findCentre: async (f) => { log.push(['centre', f.pincode]); return { found: true, lat: 30.7, lng: 76.8, label: 'Demo School', confidence: 'high', usedQuery: 'full address', tried: ['full address'], postcode: '160009', pincodeDistanceKm: 1 }; },
  routeFor: async () => { log.push(['route']); return { route: { distanceKm: 8, durationMin: 25, geometry: [[30.7, 76.8]], source: 'OSRM' }, error: null }; },
  fetchNearby: async () => { log.push(['nearby']); return { items: [1, 2, 3] }; },
});

test('buildDraft: runs the steps in order and fills centre, route and nearby', async () => {
  const log = []; const stages = [];
  const draft = await buildDraft(readOf(), { location: { ok: true, lat: 30.74, lng: 76.78 }, stage: (s) => stages.push(s), deps: fakeDeps(log), now: new Date('2026-02-20') });
  assert.deepEqual(log.map((x) => x[0]), ['centre', 'route', 'nearby']);
  assert.deepEqual(stages, ['centre', 'route', 'nearby']);
  assert.equal(draft.centre.confidence, 'high');
  assert.equal(draft.route.durationMin, 25);
  assert.equal(draft.nearbyCount, 3);
  assert.equal(draft.start.source, 'gps');
});

test('leave-by: greedy backward from reporting time (08:30 - 25 min travel - 60 buffer = 07:05)', async () => {
  const draft = await buildDraft(readOf(), { location: { ok: true, lat: 1, lng: 1 }, deps: fakeDeps(), now: new Date('2026-02-20') });
  const leave = leaveForDay(draft, draft.read.days[0]);
  assert.equal(leave.text, '07:05');
  draft.buffer = 30; draft.extra = 15;
  assert.equal(leaveForDay(draft, draft.read.days[0]).text, '07:20');
  draft.travelMin = 40;
  assert.equal(leaveForDay(draft, draft.read.days[0]).text, '07:05');
});

test('location refused: no route and no leave-by yet, and the reason is kept for the "where do you start" question', async () => {
  const log = [];
  const draft = await buildDraft(readOf(), { location: { ok: false, reason: 'denied' }, deps: fakeDeps(log), now: new Date('2026-02-20') });
  assert.equal(draft.start, null);
  assert.equal(draft.locationReason, 'denied');
  assert.equal(draft.route, null);
  assert.equal(leaveForDay(draft, draft.read.days[0]), null);
  assert.ok(!log.some((x) => x[0] === 'route'));
});

test('centre not found / offline: the draft still comes back (the user can drop a pin)', async () => {
  const none = { ...fakeDeps(), findCentre: async () => ({ found: false, tried: [] }) };
  const d1 = await buildDraft(readOf(), { location: { ok: true, lat: 1, lng: 1 }, deps: none, now: new Date('2026-02-20') });
  assert.equal(d1.centre, null); assert.equal(d1.centreError, 'notfound'); assert.equal(d1.route, null);
  const off = { ...fakeDeps(), findCentre: async () => { const e = new Error('x'); e.code = 'offline'; throw e; } };
  const d2 = await buildDraft(readOf(), { location: null, deps: off, now: new Date('2026-02-20') });
  assert.equal(d2.centreError, 'offline');
});

test('the pincode on the card must match the map: a different postcode flags the pincode field', async () => {
  const deps = { ...fakeDeps(), findCentre: async () => ({ found: true, lat: 30, lng: 76, label: 'x', confidence: 'medium', tried: [], postcode: '160055', pincodeDistanceKm: 2 }) };
  const draft = await buildDraft(readOf(), { location: null, deps, now: new Date('2026-02-20') });
  assert.ok(draft.read.pincode.flag);
  assert.match(draft.read.pincode.note, /160055/);
});

test('finalizeDraft: one plan per exam day with shared centre and route; not-allowed items go on the checklist', async () => {
  const text = ['Exam Name: X', 'Reporting Time: 10:00 AM', 'Exam Centre: Demo School', 'Centre Address: Sector 9, Chandigarh - 160009', 'Mobile phones are not allowed.',
    'Date Day Subject Time', '24/02/2026 Tuesday Physics 10:30 AM - 01:30 PM', '27/02/2026 Friday Chemistry 10:30 AM - 01:30 PM'].join('\n');
  const draft = await buildDraft({ result: extractExamFields(linesFromText(text), { sourceConf: 100 }), source: 't' }, { location: { ok: true, lat: 1, lng: 1 }, deps: fakeDeps(), now: new Date('2026-02-20') });
  const plans = finalizeDraft(draft);
  assert.equal(plans.length, 2);
  assert.deepEqual(plans.map((p) => p.fields.examDate), ['2026-02-24', '2026-02-27']);
  assert.ok(plans.every((p) => p.centre.lat === 30.7 && p.route.durationMin === 25 && p.reminder === true));
  assert.ok(plans[0].checklist.some((c) => /Not allowed/.test(c.text) && /Mobile phones/.test(c.text)));
  assert.equal(plans[0].fields.subject, 'Physics');
  assert.equal(leaveByFor(plans[0]).text, '08:35');         // 10:00 - 25 - 60
  assert.ok(!JSON.stringify(plans).match(/roll|candidate/i));
});

test('reminders: ring 10 minutes before leaving; one calendar file for all days', async () => {
  const draft = await buildDraft(readOf(), { location: { ok: true, lat: 1, lng: 1 }, deps: fakeDeps(), now: new Date('2026-02-20') });
  const plans = finalizeDraft(draft);
  const leave = leaveByFor(plans[0]);
  assert.equal(leave.text, '07:05');
  const at = new Date(reminderTime(plans[0], leave));
  assert.equal(`${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`, '6:55');
  assert.equal(reminderTime({ fields: { examDate: '' } }, leave), null);
  const ics = icsForPlans([plans[0], { ...plans[0], id: 'other', fields: { ...plans[0].fields, examDate: '2026-03-15' } }], leaveByFor);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART:20260314T070500/);
  assert.equal(icsForPlans([], leaveByFor), null);
});

test('routeFor: never throws; straight-line when every route source fails', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  try {
    const out = await routeFor({ lat: 28.6, lng: 77.2 }, { lat: 28.7, lng: 77.1 }, 'car');   // Delhi: outside the offline map, so no own router either
    assert.equal(out.route.straightLine, true);
    assert.ok(out.route.distanceKm > 5);
    assert.ok(out.error);
  } finally { globalThis.fetch = realFetch; }
});

test('draftFields and display helpers', () => {
  const r = readOf().result;
  assert.equal(draftFields(r).pincode, '160009');
  assert.equal(friendlyTime('13:05'), '1:05 PM');
  assert.equal(friendlyTime('00:00'), '12:00 AM');
  assert.equal(friendlyTime(''), '');
  assert.equal(friendlyDate('2026-04-02'), 'Thu, 2 Apr 2026');
  assert.equal(makeField('', { base: 1, source: 'x' }).value, '');
});

import { sortPlans } from '../src/ui/home.js';

test('home list: soonest exam first, no date last, equal dates keep their order', () => {
  const p = (id, date, time) => ({ id, fields: { examDate: date, reportTime: time, gateTime: '' } });
  const sorted = sortPlans([p('late', '2026-08-13', '07:30'), p('nodate', '', ''), p('early', '2026-08-11', '07:30'), p('same-a', '2026-08-12', '12:00'), p('same-b', '2026-08-12', '12:00')]);
  assert.deepEqual(sorted.map((x) => x.id), ['early', 'same-a', 'same-b', 'late', 'nodate']);
  assert.deepEqual(sortPlans([]), []);
});

test('AI text: kept only when asked, and without the candidate personal lines', () => {
  const text = "Candidate's Name: ANITA DEMOSHARMA\nRoll No: 3009448247\nExam Date: 14/03/2026\nExam Centre: Demo School";
  const lines = linesFromText(text);
  assert.equal(extractExamFields(lines, {}).aiText, undefined);
  const kept = extractExamFields(lines, { keepAiText: true }).aiText;
  assert.ok(kept.includes('Exam Date') && !/ANITA|3009448247/.test(kept));
});
