import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLeaveBy, parseHHMM, formatHHMM } from '../src/logic/leaveby.js';

test('parseHHMM and formatHHMM', () => {
  assert.equal(parseHHMM('08:30'), 510);
  assert.equal(parseHHMM('8:05'), 485);
  assert.equal(parseHHMM('25:00'), null);
  assert.equal(parseHHMM('abc'), null);
  assert.equal(formatHHMM(510), '08:30');
  assert.equal(formatHHMM(-30), '23:30');
});

test('leave-by: reporting 09:00, 45 min travel, 60 buffer', () => {
  const r = computeLeaveBy({ targetMinutes: 540, travelMin: 45, bufferMin: 60 });
  assert.equal(r.text, '07:15');
  assert.equal(r.dayOffset, 0);
});

test('leave-by: extra time is subtracted too', () => {
  const r = computeLeaveBy({ targetMinutes: 540, travelMin: 45, bufferMin: 30, extraMin: 15 });
  assert.equal(r.text, '07:30');
  assert.equal(r.totalBeforeMin, 90);
});

test('leave-by: very early exam means leaving the day before', () => {
  const r = computeLeaveBy({ targetMinutes: 60, travelMin: 120, bufferMin: 60 });
  assert.equal(r.text, '22:00');
  assert.equal(r.dayOffset, -1);
});

test('leave-by: bad input gives null', () => {
  assert.equal(computeLeaveBy({ targetMinutes: null, travelMin: 10 }), null);
  assert.equal(computeLeaveBy({ targetMinutes: 500, travelMin: -5 }), null);
  assert.equal(computeLeaveBy({ targetMinutes: 500, travelMin: NaN }), null);
});
