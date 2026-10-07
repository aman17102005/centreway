// Loads the nearby places of a plan in the background and keeps trying quietly for up to one hour if the servers fail.
// The places are saved inside the plan (plan.nearby), so they show offline and on exam day.
// The retries run while the app is open; when the app is opened again, plans that are still incomplete (and younger than an hour) continue.
import { getPlan, savePlan, listPlans } from '../store.js';
import { fetchNearby } from '../services/overpass.js';

export const RETRY_WINDOW_MS = 3600000;                       // one hour after the plan was made
const DELAYS_MS = [45000, 120000, 300000, 600000, 900000];    // 45 s, 2 min, 5 min, 10 min, then every 15 min
const timers = {};

/** Save a (partial) answer inside the plan. status: 'done' (all types answered) or 'partial'. */
export function storeNearby(planId, out, now = Date.now()) {
  const plan = getPlan(planId);
  if (!plan) return null;
  const failedTypes = out.failedTypes || [];
  const pending = out.pendingTypes || [];
  plan.nearby = { items: out.items || [], failedTypes: failedTypes.concat(pending), at: now, status: out.final && !failedTypes.length ? 'done' : 'partial', bundled: Boolean(out.bundled) };
  savePlan(plan);
  return plan.nearby;
}

/** One attempt. Returns 'done' | 'partial' | 'failed' | 'skipped'. */
export async function runNearbyAttempt(planId, deps = {}) {
  const plan = getPlan(planId);
  if (!plan || !plan.centre) return 'skipped';
  const ask = deps.fetchNearby || fetchNearby;
  try {
    const out = await ask({ lat: plan.centre.lat, lng: plan.centre.lng, city: plan.fields.city, pincode: plan.fields.pincode }, { onPartial: (p) => storeNearby(planId, p) });
    const saved = storeNearby(planId, { ...out, final: true });
    return saved && saved.status === 'done' ? 'done' : 'partial';
  } catch { return 'failed'; }
}

/** Start the background job for a plan: now, and again later while it is incomplete. */
export function startNearbyJob(planId, deps = {}) {
  if (timers[planId]) return;
  const attempt = async (i) => {
    delete timers[planId];
    const plan = getPlan(planId);
    if (!plan || !plan.centre) return;
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const status = online ? await runNearbyAttempt(planId, deps) : 'failed';
    if (status === 'done' || status === 'skipped') return;
    const delay = DELAYS_MS[Math.min(i, DELAYS_MS.length - 1)];
    const latest = getPlan(planId);
    if (!latest || Date.now() + delay > (latest.createdAt || 0) + RETRY_WINDOW_MS) return;     // the hour is over: the plan screen has a retry button
    timers[planId] = setTimeout(() => attempt(i + 1), delay);
    if (timers[planId] && timers[planId].unref) timers[planId].unref();     // (Node, tests) a waiting retry must not keep the process alive
  };
  return attempt(0);
}

/** When the app opens: continue with plans whose places are incomplete and that are less than an hour old. */
export function resumeNearbyJobs(plans = listPlans(), now = Date.now(), deps = {}) {
  const started = [];
  for (const p of plans) {
    if (!p.centre || (p.nearby && p.nearby.status === 'done')) continue;
    if (now > (p.createdAt || 0) + RETRY_WINDOW_MS) continue;
    started.push(p.id); startNearbyJob(p.id, deps);
  }
  return started;
}

export function stopNearbyJobs() { for (const id of Object.keys(timers)) { clearTimeout(timers[id]); delete timers[id]; } }
