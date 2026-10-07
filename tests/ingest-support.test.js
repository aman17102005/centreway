import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAiFields } from '../src/ingest/aiFix.js';
import { redactText, isPersonalLine } from '../src/ingest/redact.js';
import { parseQrText, readQr } from '../src/ingest/qr.js';
import { validateResult, repairTimeOrder, needsCheck, todayIso } from '../src/ingest/validate.js';
import { makeField } from '../src/ingest/examFields.js';

const day = (o = {}) => ({ date: makeField('2026-04-02', { base: 0.9, source: 'label' }), reportTime: makeField(o.rep ?? '07:00', { base: 0.9, source: 'label' }), gateTime: makeField(o.gate ?? '08:30', { base: 0.9, source: 'label' }),
  startTime: makeField(o.start ?? '09:00', { base: 0.9, source: 'label' }), endTime: makeField(o.end ?? '12:00', { base: 0.9, source: 'label' }), shift: makeField('', { base: 0, source: 'none' }), subject: '' });
const result = (days) => ({ examName: makeField('X', { base: 0.9, source: 'label' }), centreName: makeField('School', { base: 0.9, source: 'label' }), address: makeField('Sector 5', { base: 0.9, source: 'label' }),
  city: makeField('Mohali', { base: 0.9, source: 'label' }), pincode: makeField('160055', { base: 0.9, source: 'label' }), days, notAllowed: [], fixes: [], issues: [] });

// ---------- redaction (privacy) ----------
test('redact: name, roll number, dob and ids never survive', () => {
  const lines = ['Candidate Name: ANITA DEMOSHARMA', 'Roll No: 3009448247', 'Date of Birth: 05/06/2002', "Father's Name: X", 'Exam Date: 14/03/2026', 'Application No. 261525138444', 'Exam Centre: DAV College', 'अभ्यर्थी का नाम : अनिता'];
  const text = redactText(lines);
  assert.ok(!/ANITA|3009448247|05\/06\/2002|261525138444|Father|अनिता/.test(text));
  assert.ok(text.includes('Exam Date: 14/03/2026') && text.includes('DAV College'));
  assert.ok(isPersonalLine('Name: Someone'));
  assert.ok(!isPersonalLine('Exam Name: JEE'));
});

test('redact: long digit strings in other lines become [number]', () => {
  assert.equal(redactText(['Venue: Hall 5, code 12345678901']), 'Venue: Hall 5, code [number]');
  assert.equal(redactText([]), '');
});

// ---------- QR ----------
test('qr text: JSON, URL query and key:value; identity keys are ignored', () => {
  const j = parseQrText(JSON.stringify({ exam: 'JEE', centreName: 'Panjab University', date: '14/03/2026', reportingTime: '07:00 AM', pincode: '160014', rollNo: '123', candidateName: 'X' }));
  assert.equal(j.centreName, 'Panjab University'); assert.equal(j.pincode, '160014'); assert.equal(j.date, '2026-03-14'); assert.equal(j.reportTime, '07:00');
  assert.equal(JSON.stringify(j).includes('123'), false);
  const q = parseQrText('https://x.example/card?centre_name=ABC+School&exam_date=02-04-2026&roll=999');
  assert.equal(q.centreName, 'ABC School'); assert.equal(q.date, '2026-04-02');
  assert.deepEqual(parseQrText('just an id 123456'), {});
  assert.deepEqual(parseQrText(''), {});
});

test('qr read: no library or a blank picture gives null', () => {
  assert.equal(readQr({ width: 10, height: 10, data: new Uint8ClampedArray(400) }, null), null);
  assert.equal(readQr({ width: 10, height: 10, data: new Uint8ClampedArray(400) }, () => null), null);
});

// ---------- validation ----------
test('validate: a clean card has no issues; the past date and wrong order are flagged', () => {
  const ok = result([day()]);
  validateResult(ok, { now: new Date('2026-02-20') });
  assert.equal(ok.issues.length, 0);
  assert.ok(!needsCheck(ok.days[0].date));
  const bad = result([day({ rep: '10:00', start: '09:00' })]);
  validateResult(bad, { now: new Date('2026-05-01') });
  const names = bad.issues.map((i) => i.field);
  assert.ok(names.includes('day1.date') && names.includes('day1.reportTime'));
  assert.ok(needsCheck(bad.days[0].date));
});

test('validate: pincode must match the map; far pincode area is flagged; running twice does not repeat notes', () => {
  const r = result([day()]);
  validateResult(r, { now: new Date('2026-02-20'), geo: { postcode: '160059', pincodeDistanceKm: 20 } });
  validateResult(r, { now: new Date('2026-02-20'), geo: { postcode: '160059', pincodeDistanceKm: 20 } });
  assert.ok(r.pincode.flag);
  assert.equal((r.pincode.note.match(/160059/g) || []).length, 1);
  const none = result([day()]);
  validateResult(none, { now: new Date('2026-02-20'), geo: { postcode: '160055', pincodeDistanceKm: 1 } });
  assert.equal(none.issues.length, 0);
});

test('validate: AM/PM repair uses the order of the times', () => {
  const d = day({ rep: '13:30', gate: '02:30', start: '15:00', end: '16:00' });
  const issues = [];
  repairTimeOrder(d, issues, 'day1');
  assert.equal(d.gateTime.value, '14:30');
  assert.ok(d.gateTime.flag);
  const fine = day();
  repairTimeOrder(fine, [], 'day1');
  assert.equal(fine.gateTime.value, '08:30');
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05');
});

// ---------- optional AI ----------
test('ai: only empty or low-confidence fields are filled, bad values are ignored, result is marked to check', () => {
  const r = result([day()]);
  r.pincode = makeField('', { base: 0, source: 'none' });
  r.city = makeField('Mohli', { base: 0.3, source: 'address' });   // low confidence
  const changed = applyAiFields(r, { pincode: '160055', city: 'Mohali', centreName: 'Other School', date: 'tomorrow', reportTime: '99:99' });
  assert.equal(changed, 2);
  assert.equal(r.pincode.value, '160055');
  assert.equal(r.city.value, 'Mohali');
  assert.equal(r.centreName.value, 'School');           // was confident: untouched
  assert.equal(r.days[0].date.value, '2026-04-02');
  assert.ok(r.pincode.flag && /AI/.test(r.pincode.note));
  assert.equal(applyAiFields(r, null), 0);
});
