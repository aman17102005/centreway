// Share text, share link and calendar file. Only safe details go in here:
// centre name/address, coordinates, date and leave-by time. Never the photo, name or roll number.

import { parseHHMM } from './leaveby.js';

const short = (s, n) => String(s || '').slice(0, n);

/** Link that opens the shared view of CentreWay. */
export function buildShareUrl(base, p) {
  const q = new URLSearchParams();
  q.set('n', short(p.name, 120));
  q.set('lat', Number(p.lat).toFixed(5));
  q.set('lng', Number(p.lng).toFixed(5));
  if (p.leaveBy) q.set('l', p.leaveBy);
  if (p.date) q.set('d', p.date);
  // the exam-morning timeline: "05:10~Wake up|06:10~Leave home|..." (only times and short labels, nothing personal)
  if (p.timeline && p.timeline.length) q.set('tl', p.timeline.map((x) => `${x.time}~${short(x.label, 40).replace(/[|~]/g, ' ')}`).join('|'));
  return `${base.split('#')[0]}#/shared?${q.toString()}`;
}

/** Read a shared link back. Returns null if it is not valid. */
export function parseShareParams(search) {
  const q = new URLSearchParams(search);
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  if (!q.get('lat') || !q.get('lng') || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const leaveBy = q.get('l') || '';
  const date = q.get('d') || '';
  const timeline = (q.get('tl') || '').split('|').slice(0, 20).map((part) => { const [time, ...label] = part.split('~'); return { time, label: short(label.join(' '), 40).replace(/[<>]/g, '') }; })
    .filter((x) => parseHHMM(x.time) !== null && x.label);
  return {
    name: short(q.get('n'), 120),
    lat, lng,
    leaveBy: parseHHMM(leaveBy) === null ? '' : leaveBy,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    timeline,
  };
}

/** Plain text message for WhatsApp etc. */
export function buildShareText(url, p) {
  const lines = [`Exam centre: ${p.name || 'Exam centre'}`];
  if (p.date) lines.push(`Date: ${p.date}`);
  if (p.leaveBy) lines.push(`Leave by: ${p.leaveBy}`);
  if (p.timeline && p.timeline.length) { lines.push('Morning timeline:'); for (const x of p.timeline) lines.push(`  ${x.time} ${x.label}`); }
  lines.push(`Map: https://www.openstreetmap.org/?mlat=${Number(p.lat).toFixed(5)}&mlon=${Number(p.lng).toFixed(5)}#map=17/${Number(p.lat).toFixed(5)}/${Number(p.lng).toFixed(5)}`);
  lines.push(`Plan: ${url}`);
  return lines.join('\n');
}

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * Calendar file with the leave time. Uses "floating" local time, so it shows
 * at the same clock time wherever the phone is. Alarm goes off 10 minutes before.
 */
export function buildIcs({ title, date, leaveBy, durationMin = 60, location = '', description = '', uid = 'plan' }) {
  const mins = parseHHMM(leaveBy);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || mins === null) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, d, 0, mins));
  const end = new Date(start.getTime() + durationMin * 60000);
  const fmt = (dt) => `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}${String(dt.getUTCMinutes()).padStart(2, '0')}00`;
  const stamp = fmt(new Date(0));
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CentreWay//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${icsEscape(uid)}@centreway`,
    `DTSTAMP:${stamp}Z`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `LOCATION:${icsEscape(location)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'TRIGGER:-PT10M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
