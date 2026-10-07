// Makes the random "spec" of one hold-out card: which exam body, which town, which fake centre, which dates and times, which
// wordings and which printed formats. The answer key (truth) is made from the same spec. Everything is fake.
import { CITIES, BODIES, FIRST, LAST, FOUNDERS, KINDS, ONLINE_CENTRES, LOCALITIES, LANDMARKS, HINDI_PLACE, HINDI_FOUNDERS, HINDI_KINDS, HINDI_BELT, STATE_ABBR, STATE_PSC_NAME,
  LABEL_SETS, LABEL_HI, MONTHS_EN, MONTHS_HI, ITEMS, ITEM_KEYS, HINDI_STATE } from './data.js';

const pick = (rng, list) => list[rng.int(0, list.length - 1)];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const digits = (rng, n) => Array.from({ length: n }, (_, i) => rng.int(i === 0 ? 1 : 0, 9)).join('');

// ---------------------------------------------------------------- printed formats
export const DATE_STYLES = ['dot', 'slash', 'dash', 'dmy-mon', 'dmy-long', 'ordinal', 'mdy-long', 'hindi-month'];
export function fmtDate(iso, style, lang = 'en') {
  const [y, m, d] = iso.split('-').map(Number);
  const ord = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
  switch (style) {
    case 'dot': return `${pad(d)}.${pad(m)}.${y}`;
    case 'slash': return `${pad(d)}/${pad(m)}/${y}`;
    case 'dash': return `${pad(d)}-${pad(m)}-${y}`;
    case 'dmy-mon': return `${pad(d)}-${MONTHS_EN[m - 1].slice(0, 3)}-${y}`;
    case 'dmy-long': return `${d} ${MONTHS_EN[m - 1]} ${y}`;
    case 'ordinal': return `${ord(d)} ${MONTHS_EN[m - 1].slice(0, 3)} ${y}`;
    case 'mdy-long': return `${MONTHS_EN[m - 1]} ${d}, ${y}`;
    case 'hindi-month': return `${d} ${MONTHS_HI[m - 1]} ${y}`;
    default: return `${pad(d)}/${pad(m)}/${y}`;
  }
}
export const TIME_STYLES = ['colon12', 'dot12', 'dot12c', 'hrs', 'hrs4', 'ist', 'paren', 'h24', 'noon', 'hindi'];
export function fmtTime(hhmm, style, { end = false } = {}) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12; const ap = h >= 12 ? 'PM' : 'AM';
  switch (style) {
    case 'colon12': return `${pad(h12)}:${pad(m)} ${ap}`;
    case 'dot12': return `${h12}.${pad(m)} ${ap}`;
    case 'dot12c': return `${pad(h12)}.${pad(m)}${ap}`;
    case 'hrs': return `${pad(h)}:${pad(m)} hrs`;
    case 'hrs4': return `${pad(h)}${pad(m)} hrs`;
    case 'ist': return `${pad(h12)}:${pad(m)} ${ap} IST`;
    case 'paren': return `${pad(h12)}.${pad(m)}${ap} (IST)`;
    case 'h24': return `${pad(h)}:${pad(m)}`;
    case 'noon': return h === 12 && m === 0 ? '12.00Noon' : `${pad(h12)}.${pad(m)}${ap}`;
    case 'hindi': return `${h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : 'शाम'} ${pad(h12)}:${pad(m)} बजे`;
    default: return `${pad(h12)}:${pad(m)} ${ap}`;
  }
}
export function fmtRange(a, b, style, sep) {
  if (style === 'hindi') return `${fmtTime(a, style)} से ${fmtTime(b, style)} तक`;
  if (style === 'hrs4') return `${a.replace(':', '')}-${b.replace(':', '')} hrs`;
  return `${fmtTime(a, style)}${sep}${fmtTime(b, style, { end: true })}`;
}

// ---------------------------------------------------------------- fake centre
function centreOf(rng, city, hindi, body) {
  const founder = pick(rng, FOUNDERS); const online = rng.next() < 0.3 && ['codeNameAddr'].includes(body.centre);
  const kind = pick(rng, KINDS);
  const name = online ? `${pick(rng, ONLINE_CENTRES)} ${rng.int(1, 9)}` : `${founder} ${kind}`;
  const second = !online && rng.next() < 0.35 ? `${pick(rng, FOUNDERS)} ${pick(rng, ['Degree College', 'Public School', 'Vidyalaya'])}` : '';
  const loc = pick(rng, LOCALITIES); const lm = pick(rng, LANDMARKS);
  const extra = rng.next() < 0.3 ? `${pick(rng, ['Sector', 'Block', 'Phase'])} ${rng.int(2, 40)}` : '';
  const nameHi = hindi && !online && HINDI_FOUNDERS[founder] && HINDI_KINDS[kind] ? `${HINDI_FOUNDERS[founder]} ${HINDI_KINDS[kind]}` : '';
  const locHi = hindi ? HINDI_PLACE[loc] || '' : '';
  return { name, second, loc, lm, extra, nameHi, locHi, online };
}

/** One random card. `kind`: 'tuning' | 'hidden' only labels it. */
export function makeSpec(rng, index) {
  let body = pick(rng, BODIES);
  let pool = CITIES;
  if (body.state) pool = CITIES.filter((c) => body.state.includes(c.state));
  if (body.id === 'psc') pool = CITIES.filter((c) => STATE_PSC_NAME[c.state]);
  const city = pick(rng, pool);
  const belt = HINDI_BELT.has(city.state);
  // language: Hindi only where it is the real language of the card
  let lang = 'en';
  if (body.lang === 'hi-belt' && belt) lang = pick(rng, ['hi', 'hi', 'bi']);
  else if (belt && ['psc', 'tet', 'board'].includes(body.id)) lang = pick(rng, ['en', 'bi', 'hi']);
  else if (belt && rng.next() < 0.15) lang = 'bi';
  if (body.id === 'police' && !belt) lang = 'en';
  const hindi = lang !== 'en' && Boolean(city.hi) && HINDI_BELT.has(city.state);
  const exam = pick(rng, body.exams);
  const year = body.id === 'iit' && exam.short.startsWith('CAT') ? 2025 : 2026;
  const n = rng.int(1, 2);
  const abbr = body.id === 'psc' ? STATE_PSC_NAME[city.state] : STATE_ABBR[city.state];
  const fill = (s) => s.replace(/\{year\}/g, year).replace(/\{n\}/g, n).replace(/\{mon\}/g, ['December', 'June'][n - 1]).replace(/\{abbr\}/g, abbr);
  const hiTitle = lang === 'hi' && exam.hi ? fill(exam.hi) : '';
  const titleLines = hiTitle ? [hiTitle] : exam.title.map(fill);
  const short = hiTitle || fill(exam.short);
  const bodyName = exam.stateBoard ? `${city.state} Board of School Education` : body.id === 'psc' ? `${city.state} Public Service Commission` : body.id === 'police' ? `${city.state} Police Recruitment and Promotion Board` : body.id === 'univ' ? `${pick(rng, FOUNDERS)} University` : body.name;
  const stateBoard = null;

  // dates and times
  const month = rng.int(1, 12); const day = rng.int(1, 28);
  const dateIso = `${year}-${pad(month)}-${pad(day)}`;
  const slotIndex = rng.int(0, body.slots.length - 1);
  const [report, gate, start, end] = body.slots[slotIndex];
  const days = [{ date: dateIso, report, gate: body.gate && gate ? gate : '', start, end, shift: String(slotIndex + 1) }];
  const timetable = Boolean(body.timetable || body.board) && rng.next() < 0.85 || rng.next() < 0.08;
  if (timetable) {
    const rows = rng.int(3, 6); days.length = 0;
    let d = day; let m = month;
    for (let k = 0; k < rows; k++) { d += rng.int(1, 3); if (d > 28) { d -= 28; m = m % 12 + 1; } days.push({ date: `${year}-${pad(m)}-${pad(d)}`, report, gate: '', start, end, shift: '', subject: pick(rng, ['English', 'Mathematics', 'Physics', 'Chemistry', 'Hindi', 'History', 'Economics', 'Biology', 'Accountancy', 'Computer Science', 'Political Science', 'Geography']) }); }
  }
  const printShift = Boolean(body.shiftWord) || rng.next() < 0.35;
  if (!printShift || timetable) for (const dd of days) dd.shift = '';

  const centre = centreOf(rng, city, hindi, body);
  const centreCode = body.centre === 'codeNameAddr' || rng.next() < 0.2 ? `${STATE_ABBR[city.state] || 'XX'}${digits(rng, 4)}` : '';
  const dateStyle = hindi && rng.next() < 0.4 ? 'hindi-month' : pick(rng, DATE_STYLES.slice(0, 7));
  const timeStyle = hindi && rng.next() < 0.3 ? 'hindi' : pick(rng, TIME_STYLES.slice(0, 9));
  const rangeSep = pick(rng, [' to ', ' - ', ' – ', ' till ']);
  const stateInAddress = rng.next() < 0.7; const pinStyle = pick(rng, ['dash', 'comma', 'label', 'plain']);
  const homeCity = pick(rng, CITIES.filter((c) => c.pin !== city.pin));
  const items = [0, 1, 2].map(() => pick(rng, ITEMS)).filter((v, i, a) => a.indexOf(v) === i).slice(0, rng.int(2, 3));

  return {
    index, body: body.id, bodyName, bodyHead: body.head, stateBoard, titleLines, short, lang, hindi, city, centre, centreCode, centreStyle: body.centre, days, timetable, year,
    dateStyle, timeStyle, rangeSep, stateInAddress, pinStyle, printGate: body.gate && Boolean(gate), printReport: rng.next() < 0.93,
    candidate: { name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`, father: `${pick(rng, FIRST)} ${pick(rng, LAST)}`, roll: digits(rng, 10), app: digits(rng, 12), dob: `${pad(rng.int(1, 28))}/${pad(rng.int(1, 12))}/${rng.int(1996, 2007)}` },
    homePin: homeCity.pin, homeCity: homeCity.city, notAllowed: items, issueDate: fmtDate(`${year}-${pad(Math.max(1, month - 1))}-${pad(rng.int(1, 28))}`, dateStyle),
  };
}

/** The labels this card uses (random wording per field; Hindi / bilingual when the card is). */
export function pickLabels(rng, spec) {
  const out = {};
  for (const key of Object.keys(LABEL_SETS)) {
    const en = pick(rng, LABEL_SETS[key]); const hi = LABEL_HI[key] ? pick(rng, LABEL_HI[key]) : en;
    out[key] = spec.lang === 'hi' && LABEL_HI[key] ? hi : spec.lang === 'bi' && LABEL_HI[key] ? `${en} / ${hi}` : en;
  }
  return out;
}

/** Address text as printed, and the answer key for the card. */
export function printedAddress(rng, spec) {
  const { city, centre, hindi } = spec;
  const loc = hindi && centre.locHi ? centre.locHi : centre.loc;
  const parts = [centre.extra, loc, hindi ? '' : centre.lm].filter(Boolean);
  const cityName = hindi ? city.hi : city.city;
  const state = hindi ? (HINDI_STATE[city.state] || city.state) : city.state;
  parts.push(cityName);
  if (spec.stateInAddress) parts.push(state);
  const base = parts.join(', ');
  switch (spec.pinStyle) {
    case 'dash': return `${base} - ${city.pin}`;
    case 'comma': return `${base}, ${city.pin}`;
    case 'label': return `${base}, ${hindi ? 'पिन' : 'PIN'}: ${city.pin}`;
    default: return `${base} ${city.pin}`;
  }
}

export function truthOf(spec, address) {
  const name = spec.hindi && spec.centre.nameHi ? spec.centre.nameHi : spec.centre.name;
  return {
    id: `h${String(spec.index).padStart(2, '0')}-${spec.body}-${spec.city.city.toLowerCase()}`, body: spec.body, exam: spec.short, centre: spec.centre.second && !spec.hindi ? name : name,
    centreCode: spec.centreCode, address, city: spec.hindi ? spec.city.hi : spec.city.city, state: spec.city.state, pincode: spec.city.pin, homePincode: spec.homePin,
    near: { lat: spec.city.lat, lon: spec.city.lon }, big: spec.city.big, lang: spec.lang,
    days: spec.days.map((d) => ({ date: d.date, reportTime: spec.printReport ? d.report : '', gateTime: spec.printGate ? d.gate : '', startTime: d.start, endTime: d.end, shift: d.shift, subject: d.subject || '' })),
    notAllowed: spec.notAllowed.map((i) => ITEM_KEYS[i]),
    candidate: spec.candidate,
  };
}
