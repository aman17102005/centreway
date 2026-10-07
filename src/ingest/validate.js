// Checks the fields against each other. Anything that does not fit is flagged (shown in yellow with a short note).
import { parseHHMM } from '../dsa/leaveBy.js';

/** A field needs a look from the user if it is flagged or not high confidence. Empty fields always need a look. */
export function needsCheck(field) {
  return !field.value || Boolean(field.flag) || field.level !== 'high';
}

function flag(field, note, issues, name) {
  if (!field || !field.value) return;
  field.flag = true;
  if (!(field.note || '').includes(note)) field.note = field.note ? `${field.note} ${note}` : note;
  if (!issues.some((i) => i.field === name && i.note === note)) issues.push({ field: name, note });
}

/** YYYY-MM-DD for "today" in local time. */
export function todayIso(now) {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * AM/PM is the most common thing OCR gets wrong ("02:30 PM" read as "02:30 AM"). Times on a card go in order
 * (reporting, gate closing, start, end), so when one is earlier than the one before it, adding 12 hours may fix it.
 * The changed time is flagged so the user can check it.
 */
export function repairTimeOrder(day, issues, tag) {
  // Reporting and gate closing are normally 0 to 5 hours before the exam starts. A gap of 12 hours means AM/PM was lost.
  const start = parseHHMM(day.startTime.value);
  if (start !== null) {
    for (const key of ['reportTime', 'gateTime']) {
      const m = parseHHMM(day[key].value);
      if (m === null) continue;
      const gap = start - m;
      if (gap >= 0 && gap <= 300) continue;
      for (const shift of [720, -720]) {
        const moved = m + shift;
        const newGap = start - moved;
        if (moved < 0 || moved >= 1440 || newGap < 0 || newGap > 300) continue;
        const field = day[key];
        const text = `${String(Math.floor(moved / 60)).padStart(2, '0')}:${String(moved % 60).padStart(2, '0')}`;
        field.note = `${field.note ? `${field.note} ` : ''}Changed ${field.value} to ${text} (AM/PM was probably misread).`;
        field.value = text; field.flag = true;
        issues.push({ field: `${tag}.${key}`, note: 'AM/PM corrected from the exam start time.' });
        break;
      }
    }
  }
  const keys = ['reportTime', 'gateTime', 'startTime', 'endTime'].filter((k) => parseHHMM(day[k].value) !== null);
  const minutes = keys.map((k) => parseHHMM(day[k].value));
  const inOrder = (list) => list.every((m, i) => i === 0 || m >= list[i - 1]);
  if (inOrder(minutes)) return;
  // change ONE time by 12 hours; accept only if that makes every time fit in order
  for (let i = 0; i < keys.length; i++) {
    for (const shift of [720, -720]) {
      const moved = minutes[i] + shift;
      if (moved < 0 || moved >= 1440) continue;
      const trial = minutes.slice(); trial[i] = moved;
      if (!inOrder(trial)) continue;
      const field = day[keys[i]];
      const text = `${String(Math.floor(moved / 60)).padStart(2, '0')}:${String(moved % 60).padStart(2, '0')}`;
      field.note = `${field.note ? `${field.note} ` : ''}Changed ${field.value} to ${text} (AM/PM was probably misread).`;
      field.value = text;
      field.flag = true;
      issues.push({ field: `${tag}.${keys[i]}`, note: 'AM/PM corrected from the order of times.' });
      return;
    }
  }
}

/**
 * result: from extractExamFields. now: a Date. geo: optional { postcode, city, pincodeDistanceKm } for the found centre.
 * Changes the fields (flag, note) and fills result.issues.
 */
export function validateResult(result, { now = new Date(), geo = null } = {}) {
  const issues = result.issues;
  const today = todayIso(now);
  result.days.forEach((day, i) => {
    const tag = `day${i + 1}`;
    repairTimeOrder(day, issues, tag);
    if (day.date.value && day.date.value < today) flag(day.date, 'This date has already passed.', issues, `${tag}.date`);
    const rep = parseHHMM(day.reportTime.value);
    const gate = parseHHMM(day.gateTime.value);
    const start = parseHHMM(day.startTime.value);
    const end = parseHHMM(day.endTime.value);
    if (rep !== null && start !== null && rep >= start) {
      flag(day.reportTime, 'Reporting time should be before the exam starts.', issues, `${tag}.reportTime`);
      flag(day.startTime, 'Please check: the exam should start after reporting time.', issues, `${tag}.startTime`);
    }
    if (rep !== null && gate !== null && gate < rep) flag(day.gateTime, 'Gate closing should not be before reporting time.', issues, `${tag}.gateTime`);
    if (gate !== null && start !== null && gate > start + 30) flag(day.gateTime, 'Gate closing is much later than the exam start.', issues, `${tag}.gateTime`);
    if (start !== null && end !== null && end <= start) flag(day.endTime, 'Exam end should be after the start.', issues, `${tag}.endTime`);
  });
  if (result.pincode.value && !/^[1-8]\d{5}$/.test(result.pincode.value)) flag(result.pincode, 'This is not a valid 6-digit pincode.', issues, 'pincode');
  if (geo) {
    if (geo.postcode && result.pincode.value && geo.postcode !== result.pincode.value) {
      flag(result.pincode, `The map shows pincode ${geo.postcode} at this spot.`, issues, 'pincode');
    }
    if (geo.pincodeDistanceKm != null && geo.pincodeDistanceKm > 15) {
      flag(result.pincode, 'The pincode area is far from the pin on the map.', issues, 'pincode');
    }
    if (geo.cityMismatch) flag(result.city, 'The city does not match the map.', issues, 'city');
  }
  return issues;
}
