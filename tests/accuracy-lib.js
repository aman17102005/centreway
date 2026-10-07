// Compares what the reader found with the answer key (tests/fixtures/truth.json), field by field.
// Used by the accuracy run (npm run accuracy) and by the offline tests.

const words = (text) => String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

/** Share of the important words of `expected` that appear in `actual` (0..1). */
export function wordOverlap(expected, actual) {
  const want = words(expected);
  if (!want.length) return 1;
  const have = words(actual);
  const hit = want.filter((w) => have.some((h) => h === w || (w.length > 5 && h.startsWith(w.slice(0, w.length - 1))) || (h.length > 5 && w.startsWith(h.slice(0, h.length - 1)))));
  return hit.length / want.length;
}

const cityMatches = (expected, actual) => {
  const a = String(actual || '').toLowerCase(); const e = String(expected || '').toLowerCase();
  return a !== '' && (a.includes(e) || e.includes(a));
};

/**
 * Returns an array of { field, ok (0..1), expected, actual } for one sample.
 * `result` is the object from readAdmitCard (result.result).
 */
export function compareToTruth(truth, result) {
  const rows = [];
  const add = (field, ok, expected, actual) => rows.push({ field, ok, expected, actual });
  add('examName', wordOverlap(truth.exam, result.examName.value) >= 0.7 ? 1 : 0, truth.exam, result.examName.value);
  add('centreName', wordOverlap(truth.centre, result.centreName.value) >= 0.7 ? 1 : 0, truth.centre, result.centreName.value);
  add('address', wordOverlap(truth.address.replace(truth.pincode, ''), result.address.value) >= 0.7 ? 1 : 0, truth.address, result.address.value);
  add('city', cityMatches(truth.city, result.city.value) ? 1 : 0, truth.city, result.city.value);
  if (truth.centreCode) add('centreCode', result.centreCode && result.centreCode.value === truth.centreCode ? 1 : 0, truth.centreCode, result.centreCode && result.centreCode.value);
  if (truth.homePincode) add('homePincodeNotUsed', result.pincode.value !== truth.homePincode && !String(result.address.value).includes(truth.homePincode) ? 1 : 0, `not ${truth.homePincode}`, result.pincode.value);
  add('pincode', result.pincode.value === truth.pincode ? 1 : 0, truth.pincode, result.pincode.value);
  const found = result.days.slice().sort((a, b) => (a.date.value < b.date.value ? -1 : 1));
  add('dayCount', found.length === truth.days.length ? 1 : 0, truth.days.length, found.length);
  truth.days.forEach((want, i) => {
    const got = found[i];
    const tag = truth.days.length > 1 ? `day${i + 1}.` : '';
    add(`${tag}date`, got && got.date.value === want.date ? 1 : 0, want.date, got && got.date.value);
    for (const [key, name] of [['reportTime', 'reportTime'], ['gateTime', 'gateTime'], ['startTime', 'startTime'], ['endTime', 'endTime'], ['shift', 'shift']]) {
      if (!want[key]) continue;
      add(`${tag}${name}`, got && got[name].value === want[key] ? 1 : 0, want[key], got && got[name].value);
    }
  });
  const items = result.notAllowed.join(' ').toLowerCase();
  const keywords = truth.notAllowed;
  if (keywords.length) add('notAllowed', keywords.filter((k) => items.includes(k.toLowerCase())).length / keywords.length, keywords.join(','), result.notAllowed.join(' / '));   // a card with no banned-items list has nothing to check
  return rows;
}

/** Candidate name / roll number must never appear in the result. */
export function leaksPersonalData(truth, result) {
  const text = JSON.stringify(result);
  const bad = [];
  if (text.includes(truth.candidate.roll)) bad.push('roll number');
  for (const part of truth.candidate.name.split(' ')) if (part.length > 4 && text.toUpperCase().includes(part)) bad.push(`name ${part}`);
  return bad;
}

/** Group name used in the report. */
export function categoryOf(t) {
  if (t.format === 'pdf-text') return 'PDF with text';
  if (t.format === 'pdf-image') return 'Scanned PDF (image only)';
  if (t.format === 'screenshot') return 'Normal phone photos and screenshots';
  const hard = t.degrade.some((d) => ['blur', 'lowlight', 'shadow', 'crop', 'lowres'].includes(d));
  return hard ? 'Hard photos (blur / low light / shadow / cropped)' : 'Normal phone photos and screenshots';
}
