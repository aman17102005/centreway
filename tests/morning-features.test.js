import test from 'node:test';
import assert from 'node:assert/strict';
import { planMorningErrands, pickCandidates, estimateMatrix, stopClockTimes, ERRAND_KINDS } from '../src/logic/errands.js';
import { stayAdvice, stayTravelMin } from '../src/logic/stayAdvice.js';
import { buildTimeline } from '../src/logic/timeline.js';
import { buildReminderHeap, ringOrder, armTimelineReminders, stepTimeMs } from '../src/flow/timelineReminders.js';
import { CATALOG, lookupItem, suggestItems, checkItem, findMustBring, generalRule, sentencesOf } from '../src/logic/bringChecker.js';
import { buildShareUrl, parseShareParams, buildShareText } from '../src/logic/share.js';
import { leaveByFor, timelineFor } from '../src/ui/step4.js';
import { computeLeaveBy } from '../src/dsa/leaveBy.js';
import { icsForPlans } from '../src/flow/reminders.js';
import { finalizeDraft } from '../src/flow/autoPlan.js';
import { extractExamFields } from '../src/ingest/examFields.js';
import { linesFromText } from '../src/ingest/layout.js';
import { haversineMetres } from '../src/dsa/haversine.js';
import { CONFIG } from '../src/config.js';

// a tiny localStorage (finalizeDraft saves plans)
const memory = {};
globalThis.localStorage = { getItem: (k) => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; }, get length() { return Object.keys(memory).length; }, key: (i) => Object.keys(memory)[i] };

const home = { lat: 26.90, lng: 75.80 }; const centre = { lat: 26.77, lng: 75.87 };
const place = (id, category, lat, lng, name) => ({ id, category, lat, lng, name, distanceKm: haversineMetres(centre.lat, centre.lng, lat, lng) / 1000 });
// shops near the line home -> centre, plus some in the opposite direction
const SHOPS = [
  place('c1', 'copy', 26.85, 75.83, 'Copy On Way'), place('c2', 'copy', 26.70, 75.95, 'Copy Detour'),
  place('a1', 'atm', 26.83, 75.84, 'ATM On Way'), place('a2', 'atm', 26.95, 75.70, 'ATM Behind Home'),
  place('p1', 'pharmacy', 26.80, 75.86, 'Chemist On Way'), place('p2', 'pharmacy', 26.60, 75.60, 'Chemist Far'),
];
// a fake table service: 40 km/h straight-line times
const tableOf = async (points) => points.map((a) => points.map((b) => (haversineMetres(a.lat, a.lng, b.lat, b.lng) / 1000 / 40) * 60));

test('errands: up to 5 candidates per kind, least detour first (top-K); the order and the shops come from the DP', async () => {
  const many = Array.from({ length: 9 }, (_, i) => place(`m${i}`, 'atm', 26.90 - i * 0.01, 75.80 + i * 0.008, `ATM ${i}`));
  const picked = pickCandidates(many, 'atm', home, centre);
  assert.equal(picked.length, 5);
  const detour = (p) => haversineMetres(home.lat, home.lng, p.lat, p.lng) + haversineMetres(p.lat, p.lng, centre.lat, centre.lng);
  assert.ok(picked.every((p, i) => i === 0 || detour(picked[i - 1]) <= detour(p) + 1e-6));
  const r = await planMorningErrands({ start: home, centre, items: SHOPS, kinds: ['atm', 'copy', 'pharmacy'], deps: { getMatrix: tableOf } });
  assert.equal(r.order.length, 3);
  assert.deepEqual(r.order.map((s) => s.kind).sort(), ['atm', 'copy', 'pharmacy']);
  assert.deepEqual(r.order.map((s) => s.name).sort(), ['ATM On Way', 'Chemist On Way', 'Copy On Way']);       // the shops on the way, not the detours
  assert.equal(r.estimated, false);
  assert.ok(r.totalMin > 20 + 10 + 5 + 5);                                                                    // the travel plus 10 + 5 + 5 minutes at the stops
  assert.equal(r.order[0].dwellMin, CONFIG.errands.dwellMin[r.order[0].kind]);
  for (let i = 1; i < r.order.length; i++) assert.ok(r.order[i].arriveMin >= r.order[i - 1].departMin);
  assert.ok(r.centreArriveMin >= r.order[2].departMin);
});

test('errands: the user can change the minutes at each stop and the total follows', async () => {
  const base = await planMorningErrands({ start: home, centre, items: SHOPS, kinds: ['copy'], dwell: { copy: 10, atm: 5, pharmacy: 5 }, deps: { getMatrix: tableOf } });
  const longer = await planMorningErrands({ start: home, centre, items: SHOPS, kinds: ['copy'], dwell: { copy: 25, atm: 5, pharmacy: 5 }, deps: { getMatrix: tableOf } });
  assert.ok(Math.abs(longer.totalMin - base.totalMin - 15) < 1e-6);
});

test('errands: a ticked kind with no shop nearby is reported as missing and the rest is still planned', async () => {
  const noCopy = SHOPS.filter((s) => s.category !== 'copy');
  const r = await planMorningErrands({ start: home, centre, items: noCopy, kinds: ['copy', 'atm'], deps: { getMatrix: tableOf } });
  assert.deepEqual(r.missing, ['copy']);
  assert.deepEqual(r.order.map((s) => s.kind), ['atm']);
  const none = await planMorningErrands({ start: home, centre, items: noCopy, kinds: ['copy'], deps: { getMatrix: tableOf } });
  assert.deepEqual(none.missing, ['copy']); assert.deepEqual(none.order, []); assert.equal(none.totalMin, null);
  assert.deepEqual(ERRAND_KINDS, ['copy', 'atm', 'pharmacy']);
});

test('errands: when the table service fails the times are estimated from straight distance and marked as estimates', async () => {
  const r = await planMorningErrands({ start: home, centre, items: SHOPS, kinds: ['atm', 'copy'], deps: { getMatrix: async () => { throw new Error('down'); } } });
  assert.equal(r.estimated, true);
  assert.ok(r.totalMin > 0 && r.order.length === 2);
  const m = estimateMatrix([home, centre]);
  const km = haversineMetres(home.lat, home.lng, centre.lat, centre.lng) / 1000;
  assert.ok(Math.abs(m[0][1] - (km * CONFIG.errands.estimateDetour / CONFIG.errands.estimateSpeedKmh) * 60) < 1e-6);
  assert.equal(m[0][0], 0);
});

test('errands: a stop before 08:00 gets the early warning (shops may be closed), a later one does not', () => {
  const result = { order: [{ kind: 'atm', name: 'A', arriveMin: 20, departMin: 25 }, { kind: 'copy', name: 'B', arriveMin: 60, departMin: 70 }] };
  const early = stopClockTimes(result, { leaveMinutes: 6 * 60, dayOffset: 0 });         // leave 06:00: stops at 06:20 and 07:00
  assert.deepEqual(early.map((s) => s.early), [true, true]);
  const later = stopClockTimes(result, { leaveMinutes: 7 * 60 + 30, dayOffset: 0 });    // stops at 07:50 (early) and 08:30
  assert.deepEqual(later.map((s) => s.early), [true, false]);
  const night = stopClockTimes(result, { leaveMinutes: 23 * 60, dayOffset: -1 });       // left the evening before
  assert.ok(night[0].arriveClock < 0 && night[0].early);
});

function planWith(extra = {}) {
  return { id: 'p1', fields: { examDate: '2026-05-20', reportTime: '09:00', gateTime: '09:30', startTime: '10:00', centreName: 'X College', address: 'Road, Town 123456' }, target: 'report', buffer: 60, extra: 0, route: { durationMin: 60 }, centre, start: home, errands: null, ...extra };
}

test('leave-by with stops: the stops and the minutes at them are part of the trip, and the buffer is kept before the reporting time', async () => {
  assert.equal(leaveByFor(planWith()).text, '07:00');                      // 09:00 - 60 buffer - 60 travel = 07:00
  const plain = leaveByFor(planWith({ route: { durationMin: 22 } }));      // the direct drive of the test points takes about 22 minutes
  const r = await planMorningErrands({ start: home, centre, items: SHOPS, kinds: ['atm', 'copy', 'pharmacy'], deps: { getMatrix: tableOf } });
  const withStops = leaveByFor(planWith({ route: { durationMin: 22 }, errands: { enabled: true, kinds: ['atm', 'copy', 'pharmacy'], result: r } }));
  const expected = computeLeaveBy({ targetMinutes: 9 * 60, travelMin: Math.ceil(r.totalMin), bufferMin: 60, extraMin: 0 });
  assert.equal(withStops.text, expected.text);
  assert.ok(withStops.leaveMinutes < plain.leaveMinutes);                  // earlier than without the stops
  assert.equal(withStops.stops, 3);
  // arrival at the centre = target - buffer: before the gate closes
  const arriveAbs = withStops.leaveMinutes + Math.ceil(r.totalMin);
  assert.equal(arriveAbs, 9 * 60 - 60);
  assert.ok(arriveAbs < 9 * 60 + 30);
  // errands switched off (or no result): the plan is as before
  assert.equal(leaveByFor(planWith({ errands: { enabled: false, kinds: [], result: null } })).text, '07:00');
});

// ---------------------------------------------------------------- stay the night before
test('stay advice: leave-by before 04:30 or a trip over 3 hours triggers it; a normal trip does not; limits are in config.js', () => {
  const target = { targetMinutes: 9 * 60, bufferMin: 60, extraMin: 0 };
  const lv = (travelMin) => computeLeaveBy({ targetMinutes: 9 * 60, travelMin, bufferMin: 60, extraMin: 0 });
  assert.deepEqual([CONFIG.stay.leaveBeforeMinutes, CONFIG.stay.travelOverMinutes], [270, 180]);
  const early = stayAdvice({ leave: lv(230), travelMin: 230, stays: [], target });               // leave 04:10, and 230 min > 180: both
  assert.deepEqual(early.reasons.sort(), ['early', 'long']);
  assert.equal(stayAdvice({ leave: lv(170), travelMin: 170, stays: [], target }).advise, false);   // leave 05:10, 170 min: no
  const onlyEarly = stayAdvice({ leave: { leaveMinutes: 4 * 60 + 29, dayOffset: 0, text: '04:29' }, travelMin: 90, stays: [], target });
  assert.deepEqual(onlyEarly.reasons, ['early']);
  assert.equal(stayAdvice({ leave: { leaveMinutes: 4 * 60 + 30, dayOffset: 0, text: '04:30' }, travelMin: 90, stays: [], target }).advise, false);   // 04:30 exactly is fine
  const onlyLong = stayAdvice({ leave: { leaveMinutes: 6 * 60, dayOffset: 0, text: '06:00' }, travelMin: 181, stays: [], target });
  assert.deepEqual(onlyLong.reasons, ['long']);
  const evening = stayAdvice({ leave: { leaveMinutes: 23 * 60, dayOffset: -1, text: '23:00' }, travelMin: 100, stays: [], target });
  assert.ok(evening.reasons.includes('early'));                                                     // the evening before counts as before 04:30
  assert.equal(stayAdvice({ leave: null, travelMin: 500, stays: [], target }).advise, false);
});

test('stay advice: the 5 closest stays (top-K), the leave-by from the nearest stay, and "few stays" when under 3', () => {
  const target = { targetMinutes: 9 * 60, bufferMin: 60, extraMin: 0 };
  const stays = [3.2, 0.4, 7, 1.1, 0.9, 12, 2.5].map((km, i) => ({ id: `s${i}`, name: `Stay ${i}`, category: 'lodging', distanceKm: km }));
  const a = stayAdvice({ leave: { leaveMinutes: 200, dayOffset: 0, text: '03:20' }, travelMin: 240, stays, target });
  assert.deepEqual(a.stays.map((s) => s.distanceKm), [0.4, 0.9, 1.1, 2.5, 3.2]);
  assert.equal(a.fewStays, false);
  const minutes = stayTravelMin(0.4);
  assert.equal(a.stayLeave.travelMin, minutes);
  assert.equal(a.stayLeave.text, computeLeaveBy({ targetMinutes: 540, travelMin: minutes, bufferMin: 60, extraMin: 0 }).text);
  assert.ok(a.stayLeave.leaveMinutes > 200);                                                         // much later than 03:20
  assert.equal(stayAdvice({ leave: { leaveMinutes: 200, dayOffset: 0 }, travelMin: 240, stays: stays.slice(0, 2), target }).fewStays, true);
  assert.equal(stayAdvice({ leave: { leaveMinutes: 200, dayOffset: 0 }, travelMin: 240, stays: [], target }).stayLeave, null);
});

// ---------------------------------------------------------------- timeline
const fields = { reportTime: '09:00', gateTime: '09:30', startTime: '10:00' };
const leave = { leaveMinutes: 7 * 60, dayOffset: 0 };

test('timeline without stops: wake up, leave home, reach the centre, reporting time, gate closes, exam starts (nothing in between)', () => {
  const steps = buildTimeline({ fields, leave, tripMin: 60 });
  assert.deepEqual(steps.map((s) => s.id), ['wake', 'leave', 'reach', 'report', 'gate', 'start']);
  assert.deepEqual(steps.map((s) => s.text), ['06:00', '07:00', '08:00', '09:00', '09:30', '10:00']);       // wake = leave - 60 min (default)
  assert.equal(buildTimeline({ fields, leave, tripMin: 60, getReadyMin: 90 })[0].text, '05:30');             // the user changes "time to get ready"
});

test('timeline with stops: each stop in the planned order with its arrival time, between leaving and reaching the centre', () => {
  const stops = [{ kind: 'atm', name: 'ATM On Way', arriveClock: 7 * 60 + 15, departClock: 7 * 60 + 20 }, { kind: 'copy', name: 'Copy On Way', arriveClock: 7 * 60 + 35, departClock: 7 * 60 + 45 }];
  const steps = buildTimeline({ fields, leave, stops, tripMin: 75 });
  assert.deepEqual(steps.map((s) => s.id), ['wake', 'leave', 'stop1', 'stop2', 'reach', 'report', 'gate', 'start']);
  assert.deepEqual(steps.map((s) => s.text), ['06:00', '07:00', '07:15', '07:35', '08:15', '09:00', '09:30', '10:00']);
  assert.equal(steps[2].label, 'ATM On Way');
});

test('timeline from the stay: starts at the stay, and the evening before is shown as the day before', () => {
  const steps = buildTimeline({ fields, leave: { leaveMinutes: 8 * 60, dayOffset: 0 }, tripMin: 20, fromStay: { name: 'Hotel Palace' } });
  assert.equal(steps[1].label, 'Leave Hotel Palace');
  assert.equal(steps[1].kind, 'leaveStay');
  const night = buildTimeline({ fields, leave: { leaveMinutes: 23 * 60 + 30, dayOffset: -1 }, tripMin: 120 });      // leave 23:30 the evening before
  assert.equal(night[0].dayOffset, -1);
  assert.ok(night[0].timeAbs < 0 && night[0].text === '22:30');
});

test('timelineFor(plan): the plan\'s own leave-by, stops and stay decide the steps; a stay replaces home and the stops', async () => {
  const r = await planMorningErrands({ start: home, centre, items: SHOPS, kinds: ['atm'], deps: { getMatrix: tableOf } });
  const p = planWith({ errands: { enabled: true, kinds: ['atm'], result: r } });
  const steps = timelineFor(p);
  assert.deepEqual(steps.map((s) => s.id), ['wake', 'leave', 'stop1', 'reach', 'report', 'gate', 'start']);
  const stayed = timelineFor({ ...p, stay: { name: 'Hotel Palace', travelMin: 15 } });
  assert.deepEqual(stayed.map((s) => s.id), ['wake', 'leave', 'reach', 'report', 'gate', 'start']);
  assert.equal(stayed[1].label, 'Leave Hotel Palace');
  assert.equal(leaveByFor({ ...p, stay: { name: 'H', travelMin: 15 } }).text, computeLeaveBy({ targetMinutes: 540, travelMin: 15, bufferMin: 60, extraMin: 0 }).text);
  assert.deepEqual(timelineFor({ ...p, fields: { ...p.fields, reportTime: '', gateTime: '' }, route: null }), []);
});

test('timeline reminders: switched-on steps of all plans go into the min-heap and ring in time order; off or past steps are left out', () => {
  const day = (y, m, d, minutes) => new Date(y, m - 1, d, 0, minutes).getTime();
  const mk = (id, date, reminders) => ({ id, fields: { examDate: date, reportTime: '09:00', gateTime: '09:30', startTime: '10:00', centreName: id }, route: { durationMin: 60 }, buffer: 60, extra: 0, target: 'report', reminders, timelineReminders: reminders });
  const plans = [mk('late', '2026-06-02'), mk('soon', '2026-06-01', { reach: true, report: true, gate: false })];
  const now = day(2026, 5, 31, 12 * 60);
  const heap = buildReminderHeap(plans, timelineFor, now);
  const order = ringOrder(heap);
  assert.equal(order.length, 6);                                                                         // soon: wake, leave (default on), reach, report; late: wake, leave
  const times = order.map((o) => o.at);
  assert.deepEqual(times, times.slice().sort((a, b) => a - b));                                         // heap order = time order
  assert.deepEqual(order.slice(0, 4).map((o) => `${o.planId}:${o.stepId}`), ['soon:wake', 'soon:leave', 'soon:reach', 'soon:report']);
  assert.ok(!order.some((o) => o.stepId === 'gate'));                                                   // switched off
  const stepStart = timelineFor(plans[0]).find((s) => s.id === 'wake');
  assert.equal(stepTimeMs(plans[0], stepStart), day(2026, 6, 2, stepStart.timeAbs));
  // everything in the past: nothing waits
  assert.equal(buildReminderHeap(plans, timelineFor, day(2026, 7, 1, 0)).size, 0);
});

test('timeline reminders: one timer for the earliest, and when it rings the next one is armed from the heap', () => {
  const day = (y, m, d, minutes) => new Date(y, m - 1, d, 0, minutes).getTime();
  const plan = { id: 'p', fields: { examDate: '2026-06-01', reportTime: '09:00', gateTime: '09:30', startTime: '10:00' }, route: { durationMin: 60 }, buffer: 60, extra: 0, target: 'report' };
  let clock = day(2026, 5, 31, 12 * 60); const timers = []; const shown = [];
  const waiting = armTimelineReminders([plan], timelineFor, { show: (i) => shown.push(i.stepId), now: () => clock, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} });
  assert.equal(waiting, 2);                                                                              // wake and leave are on by default
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, day(2026, 6, 1, 6 * 60) - clock);                                           // the timer is for the wake-up step
  clock = day(2026, 6, 1, 6 * 60); timers[0].fn();
  assert.deepEqual(shown, ['wake']);
  assert.equal(timers.length, 2);                                                                        // the next one (leave) is armed
  assert.equal(timers[1].ms, 60 * 60000);
});

test('shared plan link and calendar file carry the timeline (times and labels only)', async () => {
  const steps = buildTimeline({ fields, leave, tripMin: 60 });
  const p = { name: 'X College, Town', lat: 26.77, lng: 75.87, leaveBy: '07:00', date: '2026-05-20', timeline: steps.map((s) => ({ time: s.text, label: s.label })) };
  const url = buildShareUrl('https://x.example/#/plan/1', p);
  const back = parseShareParams(url.split('?')[1]);
  assert.deepEqual(back.timeline.map((x) => `${x.time} ${x.label}`), ['06:00 Wake up', '07:00 Leave home', '08:00 Reach the centre', '09:00 Reporting time', '09:30 Gate closes', '10:00 Exam starts']);
  assert.ok(buildShareText(url, p).includes('06:00 Wake up'));
  assert.deepEqual(parseShareParams('lat=1&lng=2&tl=25:00~Bad|07:00~<b>Hi</b>').timeline, [{ time: '07:00', label: 'bHi/b' }]);      // bad times dropped, markup removed
  const ics = icsForPlans([planWith()], leaveByFor, timelineFor);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1 + 6);                                       // the leave-by event + one per timeline step
  assert.ok(ics.includes('Wake up') && ics.includes('Exam starts'));
});

// ---------------------------------------------------------------- "Can I bring...?"
const CARD = ['Important Instructions', '1. Candidates must carry a printout of this admit card and a valid photo ID.', '2. Candidates will not be allowed to carry mobile phones, calculators, smart watches into the examination hall.',
  '3. Transparent water bottle is allowed.', '4. Bring two passport size photographs.'];

test('checker: answers from the card with the exact line: not allowed, must bring, allowed', () => {
  const watch = checkItem(lookupItem('watch'), CARD);
  assert.equal(watch.status, 'not_allowed'); assert.ok(watch.evidence.includes('smart watches'));
  assert.equal(checkItem(lookupItem('calculator'), CARD).status, 'not_allowed');
  assert.equal(checkItem(lookupItem('mobile'), CARD).status, 'not_allowed');
  assert.equal(checkItem(lookupItem('water bottle'), CARD).status, 'allowed');
  assert.equal(checkItem(lookupItem('admit card'), CARD).status, 'must_bring');
  assert.equal(checkItem(lookupItem('id'), CARD).status, 'must_bring');
  assert.equal(checkItem(lookupItem('photo'), CARD).status, 'must_bring');      // "passport size photographs"
});

test('checker: an item the card does not mention is NEVER "allowed"', () => {
  for (const q of ['pen', 'shoes', 'wallet', 'food', 'spectacles']) assert.equal(checkItem(lookupItem(q), CARD).status, 'not_mentioned', q);
  assert.equal(checkItem(lookupItem('watch'), []).status, 'not_mentioned');
  assert.equal(checkItem(lookupItem('watch'), undefined).status, 'not_mentioned');
  // "electronic devices" in general does not decide a watch
  assert.equal(checkItem(lookupItem('watch'), ['Electronic devices are not allowed.']).status, 'not_mentioned');
  // "photo" in "photo ID" is the ID, not the passport photo
  assert.equal(checkItem(lookupItem('photo'), ['Carry a valid photo ID.']).status, 'not_mentioned');
});

test('checker: synonyms (wrist watch, smartwatch, cell phone, transparent bottle) reach the same item and the same answer', () => {
  const a = lookupItem('wrist watch'); const b = lookupItem('smartwatch'); const c = lookupItem('watch');
  assert.ok(a.id === 'watch' && b.id === 'watch' && c.id === 'watch');
  assert.equal(lookupItem('cell phone').id, 'mobile');
  assert.equal(lookupItem('smartphone').id, 'mobile');
  assert.equal(lookupItem('transparent bottle').id, 'bottle');
  assert.equal(lookupItem('my water bottle please').id, 'bottle');           // a known word inside what was typed
  assert.equal(lookupItem('xyzzy'), null);
  assert.equal(checkItem(lookupItem('wristwatch'), ['Smart watches are prohibited.']).status, 'not_allowed');       // card says "smart watches", user typed wristwatch
  assert.equal(checkItem(lookupItem('cellphone'), ['Mobile phones are strictly prohibited.']).status, 'not_allowed');
  assert.equal(checkItem(lookupItem('bottle'), ['Candidates may bring a transparent water bottle.']).status, 'allowed');
});

test('checker: prefix suggestions while typing (trie), different items, most common first', () => {
  const w = suggestItems('wa').map((s) => s.word);
  assert.ok(w.includes('watch') && w.includes('water bottle'));
  assert.equal(suggestItems('wa')[0].word, 'watch');
  assert.ok(suggestItems('m')[0].item.id === 'mobile');
  assert.equal(suggestItems('').length, 0);
  assert.equal(suggestItems('zzzz').length, 0);
  const ids = suggestItems('p', 8).map((s) => s.item.id);
  assert.equal(new Set(ids).size, ids.length);                                // each item once
  assert.ok(CATALOG.length >= 15);
});

test('checker: the card line with both a ban and a requirement is read per sentence; "not allowed" wins over "allowed"', () => {
  const lines = ['Candidates must bring admit card; mobile phones are not allowed. Pens are allowed but calculators are not allowed.'];
  assert.equal(checkItem(lookupItem('admit card'), lines).status, 'must_bring');
  assert.equal(checkItem(lookupItem('mobile'), lines).status, 'not_allowed');
  assert.equal(checkItem(lookupItem('pen'), lines).status, 'allowed');
  assert.equal(checkItem(lookupItem('calculator'), lines).status, 'not_allowed');
  assert.equal(checkItem(lookupItem('watch'), ['Watches are allowed. Smart watches are not allowed.']).status, 'not_allowed');
  assert.ok(sentencesOf(['One. Two; three']).length === 3);
});

test('checker: general rules per exam body are available but separate from the card ("usually"), and none is invented for unknown items', () => {
  assert.equal(generalRule('JEE Main 2026 Session 1', 'watch').rule, 'not allowed');
  assert.equal(generalRule('JEE Main 2026 Session 1', 'watch').body, 'nta');
  assert.equal(generalRule('SSC CGL 2026', 'calculator').rule, 'not allowed');
  assert.equal(generalRule('Unknown Exam', 'mobile').rule, 'not allowed');
  assert.equal(generalRule('Unknown Exam', 'watch'), null);
  assert.equal(generalRule('RRB NTPC', 'shoes'), null);
});

test('"must bring" from the card goes into the day-before checklist (ID, photos, admit card, pen), with the card\'s line', () => {
  const text = ['Exam Name: Demo Exam 2026', 'Exam Date: 20/05/2026', 'Reporting Time: 09:00 AM', 'Exam Centre: Demo School', 'Centre Address: Sector 9, Town - 123456',
    'Important Instructions', '1. Candidates must carry a printout of this admit card and a valid photo ID.', '2. Black ball point pen must be brought by the candidate.', '3. Mobile phones are not allowed.'].join('\n');
  const read = extractExamFields(linesFromText(text), { sourceConf: 100 });
  assert.ok(read.instructions.some((l) => l.includes('must carry a printout')));
  assert.ok(!read.instructions.some((l) => /Exam Date|Sector 9/.test(l)));                                // only instruction lines, no card fields
  const [plan] = finalizeDraft({ read, centre: { lat: 1, lng: 2, confidence: 'high' }, start: null, route: null, mode: 'car', travelMin: null, buffer: 60, extra: 0, nearby: [], nearbyCount: 0 });
  assert.deepEqual(plan.instructions, read.instructions);
  const id = plan.checklist.find((c) => /photo id/i.test(c.text));
  assert.ok(id.mustBring && id.fromCard.includes('photo ID'));                                              // the default "Photo ID card" line is marked with the card's words
  assert.ok(plan.checklist.find((c) => c.text === 'Must bring: Pen' || (/pens/i.test(c.text) && c.mustBring)));
  assert.ok(plan.errands && plan.errands.enabled === false);                                               // "No, go straight to the centre" is the default
});
