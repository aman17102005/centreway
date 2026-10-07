import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareUrl, parseShareParams, buildShareText, buildIcs } from '../src/logic/share.js';
import { haversineKm, formatDistance, formatDuration } from '../src/logic/geo.js';

const plan = { name: 'Demo School, Pune', lat: 18.5204, lng: 73.8567, leaveBy: '07:15', date: '2026-03-14' };

test('share url round trip carries only safe fields', () => {
  const url = buildShareUrl('https://x.example/app/#/plan/1', plan);
  assert.ok(url.startsWith('https://x.example/app/#/shared?'));
  const back = parseShareParams(url.split('?')[1]);
  assert.equal(back.name, plan.name);
  assert.equal(back.leaveBy, '07:15');
  assert.deepEqual(Object.keys(back).sort(), ['date', 'lat', 'leaveBy', 'lng', 'name', 'timeline']);
  assert.deepEqual(back.timeline, []);
});

test('parseShareParams rejects bad data', () => {
  assert.equal(parseShareParams('lat=abc&lng=2'), null);
  assert.equal(parseShareParams('lat=95&lng=2'), null);
  assert.equal(parseShareParams('')?.name, undefined);
  assert.equal(parseShareParams('lat=10&lng=20&l=99:99').leaveBy, '');
});

test('share text', () => {
  const t = buildShareText('https://x', plan);
  assert.match(t, /Leave by: 07:15/);
  assert.match(t, /openstreetmap/);
});

test('ics file', () => {
  const ics = buildIcs({ title: 'Leave, now', date: '2026-03-14', leaveBy: '07:15', location: 'Demo School' });
  assert.match(ics, /DTSTART:20260314T071500/);
  assert.match(ics, /SUMMARY:Leave\\, now/);
  assert.match(ics, /TRIGGER:-PT10M/);
  assert.equal(buildIcs({ title: 'x', date: '', leaveBy: '07:15' }), null);
});

test('geo helpers', () => {
  const km = haversineKm({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 });
  assert.ok(km > 1100 && km < 1200);
  assert.equal(formatDistance(0.5), '500 m');
  assert.equal(formatDistance(2.44), '2.4 km');
  assert.equal(formatDuration(65), '1 h 5 min');
  assert.equal(formatDuration(25), '25 min');
});
