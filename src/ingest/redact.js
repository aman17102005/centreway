// Removes personal details from text before it can go anywhere (only used for the optional Gemini step).
// Lines holding the candidate's name, roll number, ids, birth date, parents, category are dropped completely.
import { asciiLower, kmpFirst } from '../dsa/kmp.js';

const PERSONAL = ['candidate name', 'name of candidate', "candidate's name", 'applicant name', 'name of the candidate', 'roll no', 'roll number', 'roll. no', 'application no',
  'application number', 'registration no', 'registration number', 'regn no', 'reg. no', 'seat no', 'enrolment', 'enrollment', 'admit card no', 'form no', 'form number',
  "father's name", "mother's name", 'father name', 'mother name', 'guardian', 'date of birth', 'dob', 'd.o.b', 'gender', 'category', 'aadhaar', 'aadhar', 'pan no',
  'mobile', 'phone', 'email', 'e-mail', 'signature', 'अनुक्रमांक', 'रोल नंबर', 'रोल नं', 'अभ्यर्थी का नाम', 'परीक्षार्थी का नाम', 'पिता का नाम', 'माता का नाम', 'जन्म तिथि', 'आवेदन संख्या', 'पंजीकरण'];

/** True if the line is about a person (name, roll no ...). */
export function isPersonalLine(text) {
  const lower = asciiLower(text);
  if (lower.trim().startsWith('name') && (lower.trim()[4] === ':' || lower.trim()[4] === ' ')) return true;
  return PERSONAL.some((p) => kmpFirst(lower, p) >= 0);
}

/** Drop personal lines and any long digit strings (ids). lines: [{text}] or strings. Returns text. */
export function redactText(lines) {
  const kept = [];
  for (const line of lines) {
    const text = typeof line === 'string' ? line : line.text;
    if (!text || isPersonalLine(text)) continue;
    kept.push(text.replace(/\b\d{7,}\b/g, '[number]'));
  }
  return kept.join('\n');
}
