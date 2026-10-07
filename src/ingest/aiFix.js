// Optional help from Gemini (the user's own free key) for fields the reader is unsure about.
// Only redacted text is sent (no name, roll number or ids), never the picture. The app works fully without this.
import { makeField } from './examFields.js';
import { parseHHMM } from '../dsa/leaveBy.js';

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const isPin = (v) => /^[1-8]\d{5}$/.test(String(v || ''));
const isTime = (v) => parseHHMM(v) !== null;

/** Fill only fields that are empty or low confidence. AI values are marked "check this" (yellow). Returns how many fields changed. */
export function applyAiFields(result, ai) {
  if (!ai || typeof ai !== 'object') return 0;
  let changed = 0;
  const maybe = (field, value, valid = () => true) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || !valid(text) || (field.value && field.level !== 'low')) return;
    Object.assign(field, makeField(text, { base: 0.6, source: 'ai', note: 'Suggested by AI. Please check.' }), { flag: true });
    changed++;
  };
  maybe(result.examName, ai.examName); maybe(result.centreName, ai.centreName); maybe(result.address, ai.address);
  maybe(result.city, ai.city); maybe(result.pincode, ai.pincode, isPin);
  const day = result.days[0];
  if (day) {
    maybe(day.date, ai.date, isDate); maybe(day.reportTime, ai.reportTime, isTime); maybe(day.gateTime, ai.gateTime, isTime);
    maybe(day.startTime, ai.startTime, isTime); maybe(day.endTime, ai.endTime, isTime);
  }
  return changed;
}
