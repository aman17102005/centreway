import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLeaveBy, parseHHMM, formatHHMM } from '../src/dsa/leaveBy.js';
import { makeRng } from './rng.js';

test('leaveBy: gate 09:15, buffer 30, travel 45 -> 08:00 (greedy backward)', () => {
  const r = computeLeaveBy({ targetMinutes: parseHHMM('09:15'), travelMin: 45, bufferMin: 30 });
  assert.equal(r.text, '08:00');
  assert.equal(r.dayOffset, 0);
});

test('leaveBy: ties and zero values', () => {
  assert.equal(computeLeaveBy({ targetMinutes: 600, travelMin: 0, bufferMin: 0 }).text, '10:00');
  assert.equal(computeLeaveBy({ targetMinutes: 0, travelMin: 0, bufferMin: 0 }).text, '00:00');
});

test('leaveBy: wraps to the day before at midnight', () => {
  const r = computeLeaveBy({ targetMinutes: 30, travelMin: 60, bufferMin: 30 });
  assert.equal(r.text, '23:00');
  assert.equal(r.dayOffset, -1);
  const long = computeLeaveBy({ targetMinutes: 60, travelMin: 3000, bufferMin: 0 });   // two days before
  assert.equal(long.dayOffset, -3);
});

test('leaveBy: bad input -> null', () => {
  assert.equal(computeLeaveBy({ targetMinutes: undefined, travelMin: 5 }), null);
  assert.equal(computeLeaveBy({ targetMinutes: 500, travelMin: -1 }), null);
  assert.equal(computeLeaveBy({ targetMinutes: 500, travelMin: 5, bufferMin: -5 }), null);
  assert.equal(computeLeaveBy({ targetMinutes: 500, travelMin: Number.NaN }), null);
});

test('leaveBy: parse/format edge cases', () => {
  assert.equal(parseHHMM('00:00'), 0);
  assert.equal(parseHHMM('23:59'), 1439);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('8:5'), null);
  assert.equal(parseHHMM(''), null);
  assert.equal(parseHHMM(null), null);
  assert.equal(parseHHMM('08:30:00'), null);
  assert.equal(formatHHMM(1440), '00:00');
  assert.equal(formatHHMM(-1), '23:59');
});

test('leaveBy: 500 random cases - leaving at the answer plus all blocks lands exactly on the deadline, one minute later is too late', () => {
  const rng = makeRng(19);
  for (let i = 0; i < 500; i++) {
    const target = rng.int(0, 1439); const travel = rng.int(0, 400); const buffer = rng.int(0, 120); const extra = rng.int(0, 60);
    const r = computeLeaveBy({ targetMinutes: target, travelMin: travel, bufferMin: buffer, extraMin: extra });
    const absoluteLeave = r.dayOffset * 1440 + r.leaveMinutes;
    assert.equal(absoluteLeave + travel + extra + buffer, target);     // exactly on time with all the safety kept
    assert.ok(absoluteLeave + 1 + travel + extra + buffer > target);   // later than this would eat into the safety time
  }
});
