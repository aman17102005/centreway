// Everything is saved in this browser only (localStorage). No server, no account.
const PREFIX = 'cw_';
const PLANS = `${PREFIX}plans`;
const SETTINGS = `${PREFIX}settings`;

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const DEFAULT_CHECKLIST = [
  'Admit card printouts (2 copies)',
  'Photo ID card (original)',
  'Passport size photos',
  'Black/blue pens',
  'Transparent water bottle (if allowed)',
  'Screenshot of the route',
  'Phone fully charged',
  'Some cash',
  'Check what is not allowed in the centre',
];

export function getSettings() {
  return { lang: 'en', orsKey: '', geminiKey: '', geminiNoticeSeen: false, placesEnabled: false, placesWorkerUrl: '', ...read(SETTINGS, {}) };
}
export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  write(SETTINGS, s);
  return s;
}

// ---------------------------------------------------------------- storage room
// localStorage gives a website about 5 million characters. The app counts what it uses against that, warns above 80%,
// clears its own search / nearby caches before a plan save fails, and tells the user when a plan could not be saved.
export const STORAGE_LIMIT_CHARS = 5000000;
export const STORAGE_WARN_AT = 0.8;

/** How much of the storage is used, 0..1 (keys and values counted in characters). 0 when it cannot be measured. */
function storageKeys() {
  return typeof localStorage.length === 'number' && typeof localStorage.key === 'function'
    ? Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)) : Object.keys(localStorage);
}
export function storageFraction() {
  try {
    const keys = storageKeys();
    let chars = 0;
    for (const k of keys) chars += String(k).length + String(localStorage.getItem(k) || '').length;
    return chars / STORAGE_LIMIT_CHARS;
  } catch { return 0; }
}
export const isStorageAlmostFull = () => storageFraction() > STORAGE_WARN_AT;

/** Remove the cached answers (search, nearby places, OCR hints): they can always be fetched again. Plans are never touched. */
export function clearCaches() {
  try { storageKeys().filter((k) => k.startsWith(`${PREFIX}c_`)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

const saveFailedListeners = [];
/** fn() is called whenever a plan could not be saved (storage full). */
export function onSaveFailed(fn) { saveFailedListeners.push(fn); }

/** Write a plan list; if the storage is full, clear the caches first and try again. Returns true when it was saved. */
function writePlans(plans) {
  if (write(PLANS, plans)) return true;
  clearCaches();                                    // search and nearby caches go first, before a plan save fails
  if (write(PLANS, plans)) return true;
  for (const fn of saveFailedListeners) { try { fn(); } catch { /* a screen that is gone */ } }
  return false;
}

export function listPlans() { return read(PLANS, []); }
export function getPlan(id) { return listPlans().find((p) => p.id === id) || null; }
export function savePlan(plan) {
  const plans = listPlans();
  const i = plans.findIndex((p) => p.id === plan.id);
  const next = { ...plan, updatedAt: Date.now() };
  if (i >= 0) plans[i] = next; else plans.unshift(next);
  writePlans(plans);
  return next;
}
export function deletePlan(id) { write(PLANS, listPlans().filter((p) => p.id !== id)); }
/** Delete several plans at once (the user asked for it: nothing is ever deleted automatically). */
export function deletePlans(ids) { const gone = new Set(ids); write(PLANS, listPlans().filter((p) => !gone.has(p.id))); }

export function newPlan(checklistLabels = DEFAULT_CHECKLIST) {
  return {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    fields: { centreName: '', address: '', pincode: '', city: '', examDate: '', reportTime: '', gateTime: '' },
    centre: null,        // { lat, lng }
    start: null,         // { lat, lng, label }
    mode: 'car',
    route: null,         // { distanceKm, durationMin, geometry, source, straightLine }
    travelMin: null,     // user can override the route time
    target: 'report',    // 'report' | 'gate'
    buffer: 60,
    extra: 0,
    checklist: checklistLabels.map((text, i) => ({ id: `d${i}`, text, done: false })),
  };
}

/** Small cache for service answers (search, nearby places). Entries can expire. */
export function cacheGet(key, maxAgeMs) {
  const e = read(`${PREFIX}c_${key}`, null);
  if (!e || Date.now() - e.t > maxAgeMs) return null;
  return e.v;
}
export function cacheSet(key, value) { write(`${PREFIX}c_${key}`, { t: Date.now(), v: value }); }

/** Delete everything CentreWay saved, including cached OCR language data. */
export async function clearAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  try { indexedDB.deleteDatabase('keyval-store'); } catch { /* ignore */ }
}
