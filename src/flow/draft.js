// The "draft" is what the app worked out from the admit card, shown on the summary screen before the user says "Looks right".
// Saved in this browser only (localStorage), so a reload does not lose it. Never holds the photo or the candidate's name or roll number.
import { cacheGet, cacheSet } from '../store.js';

const KEY = 'draft_v1';

export function loadDraft() { return cacheGet(KEY, Infinity); }
export function saveDraft(draft) { cacheSet(KEY, draft); }
export function clearDraft() { cacheSet(KEY, null); }
