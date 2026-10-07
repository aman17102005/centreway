// Optional: tidy OCR text with Gemini, using the user's own key.
// Only the text is sent. Never the photo.
import { CONFIG } from '../config.js';
import { fetchJson } from './net.js';

const PROMPT = 'Below is text read by OCR from an exam admit card. Fix obvious OCR spelling mistakes in the exam centre name and address only. ' +
  'Do not invent anything. Keep the same labels and line breaks. Return only the corrected text.\n\n';

export async function cleanUpText(text, key) {
  const data = await fetchJson(CONFIG.gemini.url, {
    method: 'POST',
    timeout: 20000,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT + text.slice(0, 4000) }] }] }),
  });
  const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!out.trim()) throw new Error('empty');
  return out.trim();
}

const FIELDS_PROMPT = 'Below is text read by OCR from an Indian exam admit card. Personal details were already removed. ' +
  'Return ONLY a JSON object with these keys (use null when a value is not in the text, never guess): ' +
  'examName, centreName, address, city, pincode (6 digits), date (YYYY-MM-DD), reportTime (HH:MM 24-hour), gateTime (HH:MM), startTime (HH:MM), endTime (HH:MM).\n\n';

/** Ask Gemini for the exam details in the (already redacted) text. Returns an object, or throws. */
export async function extractFieldsWithAi(text, key) {
  const data = await fetchJson(CONFIG.gemini.url, {
    method: 'POST',
    timeout: 25000,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: FIELDS_PROMPT + text.slice(0, 5000) }] }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  const parsed = JSON.parse(out.replace(/^```json|```$/g, '').trim());
  if (!parsed || typeof parsed !== 'object') throw new Error('bad answer');
  return parsed;
}
