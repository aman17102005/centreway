// From a read admit card to a complete plan, with no typing:
// centre on the map -> route from the user's location -> leave-by for each exam day -> nearby places -> checklist -> reminders.
import { findCentre } from './centreFinder.js';
import { CONFIG } from '../config.js';
import { routeFor } from './routePlan.js';
import { fetchNearby } from '../services/overpass.js';
import { computeLeaveBy, parseHHMM } from '../dsa/leaveBy.js';
import { validateResult, needsCheck } from '../ingest/validate.js';
import { makeField } from '../ingest/examFields.js';
import { newPlan, savePlan, getSettings, DEFAULT_CHECKLIST } from '../store.js';
import { Queue } from '../dsa/queue.js';
import { startNearbyJob } from './nearbyJob.js';
import { findMustBring } from '../logic/bringChecker.js';
import { chooseStart } from './startPoint.js';

export const draftFields = (result) => ({
  centreName: result.centreName.value, address: result.address.value, pincode: result.pincode.value, city: result.city.value,
});

/** Leave-by for one exam day of the draft, or null when something is missing. */
export function leaveForDay(draft, day) {
  const target = parseHHMM(day.reportTime.value) ?? parseHHMM(day.gateTime.value);
  const travel = draft.travelMin ?? draft.route?.durationMin;
  if (target === null || travel == null) return null;
  const leave = computeLeaveBy({ targetMinutes: target, travelMin: Math.round(travel), bufferMin: draft.buffer, extraMin: draft.extra });
  return leave && { ...leave, targetText: day.reportTime.value || day.gateTime.value, travel: Math.round(travel) };
}

/** Run the steps one after the other; `stage(name)` tells the progress screen what we are doing. */
export async function buildDraft(read, { location, stage = () => {}, deps = {}, now = new Date() } = {}) {
  const find = deps.findCentre || findCentre;
  const route = deps.routeFor || routeFor;
  const nearby = deps.fetchNearby || fetchNearby;
  const result = read.result;
  const draft = {
    id: `d${Date.now().toString(36)}`, createdAt: Date.now(), source: read.source,
    read: { examName: result.examName, centreName: result.centreName, address: result.address, city: result.city, pincode: result.pincode,
      days: result.days, notAllowed: result.notAllowed, fixes: result.fixes, issues: result.issues },
    aiText: result.aiText || '',
    nearby: [], nearbyEmpty: [], nearbyFailed: [], centre: null, centreError: null, start: null, locationReason: null, mode: 'car', route: null, routeError: null, travelMin: null, nearbyCount: null, buffer: 60, extra: 0,
  };

  // The steps wait in my queue and run in order.
  const steps = new Queue();
  steps.enqueue(async () => {
    stage('centre');
    try {
      const found = await find(draftFields(result));
      if (found.found) {
        draft.centre = { lat: found.lat, lng: found.lng, label: found.label, confidence: found.confidence, usedQuery: found.usedQuery, tried: found.tried, postcode: found.postcode };
        validateResult(result, { now, geo: found }); // pincode and city must fit the map
        // the card gave no usable city: take it from the map (shown in yellow so it is checked)
        if (!result.city.value && found.mapCity) Object.assign(result.city, makeField(found.mapCity, { base: 0.6, source: 'map', note: 'Taken from the map.' }), { flag: true });
      } else draft.centreError = 'notfound';
    } catch (e) { draft.centreError = e.code === 'offline' ? 'offline' : 'failed'; }
  });
  steps.enqueue(async () => {
    stage('route');
    // location -> the last start point the user chose -> (the screen asks)
    const chosen = chooseStart(location);
    draft.start = chosen.start;
    draft.locationReason = chosen.reason;
    if (draft.start && draft.centre) {
      const r = await route(draft.start, draft.centre, draft.mode, getSettings().orsKey);
      draft.route = r.route; draft.routeError = r.error;
    }
  });
  steps.enqueue(async () => {
    stage('nearby');
    if (!draft.centre) return;
    try {
      // wait only a little: the search keeps running in the background and the summary screen picks the answer up when it is ready
      const wait = new Promise((resolve) => setTimeout(() => resolve(null), deps.nearbyWaitMs ?? 9000));
      const out = await Promise.race([nearby({ lat: draft.centre.lat, lng: draft.centre.lng, city: result.city.value, pincode: result.pincode.value }), wait]);
      if (!out) { draft.nearbyCount = null; draft.nearby = []; return; }
      draft.nearby = out.items;
      draft.nearbyCount = out.items.length;
      draft.nearbyEmpty = out.emptyTypes || [];
      draft.nearbyFailed = out.failedTypes || [];
    } catch { draft.nearbyCount = null; draft.nearby = []; draft.nearbyFailed = []; }
  });
  while (!steps.isEmpty()) await steps.dequeue()();
  draft.read.issues = result.issues;
  return draft;
}

/** Turn the confirmed draft into saved plans: one per exam day. */
export function finalizeDraft(draft) {
  const plans = [];
  const r = draft.read;
  const days = r.days.length ? r.days : [null];
  for (const day of days) {
    const plan = newPlan();
    plan.fields = {
      centreName: r.centreName.value, address: r.address.value, pincode: r.pincode.value, city: r.city.value,
      examDate: day ? day.date.value : '', reportTime: day ? day.reportTime.value : '', gateTime: day ? day.gateTime.value : '',
      centreNameSure: Boolean(r.centreName.value) && !needsCheck(r.centreName),      // a sure (not yellow) name may be used in the Google Maps links
      examName: r.examName.value, startTime: day ? day.startTime.value : '', endTime: day ? day.endTime.value : '', shift: day ? day.shift.value : '', subject: day ? day.subject : '',
    };
    plan.centre = draft.centre ? { lat: draft.centre.lat, lng: draft.centre.lng, confidence: draft.centre.confidence } : null;      // confidence: only a HIGH pin is used as coordinates in the Google Maps links
    plan.start = draft.start;
    plan.mode = draft.mode;
    plan.route = draft.route;
    plan.travelMin = draft.travelMin;
    plan.buffer = draft.buffer;
    plan.extra = draft.extra;
    plan.target = plan.fields.reportTime ? 'report' : 'gate';
    plan.notAllowed = r.notAllowed;
    plan.instructions = r.instructions || [];          // the card's own instruction lines (no personal lines): the "Can I bring...?" checker reads them
    plan.errands = { enabled: false, kinds: [], dwell: { ...CONFIG.errands.dwellMin }, result: null };
    plan.reminder = true;
    // what the card says you MUST bring (ID, photos, admit card, pen) goes into the day-before checklist, with the card's own words
    for (const { item, evidence } of findMustBring(plan.instructions)) {
      const same = plan.checklist.find((c) => item.synonyms.some((w) => w.charCodeAt(0) < 128 && c.text.toLowerCase().includes(w.toLowerCase())));
      if (same) { same.fromCard = evidence; same.mustBring = true; } else plan.checklist.push({ id: `mb_${item.id}`, text: `Must bring: ${item.label}`, done: false, fromCard: evidence, mustBring: true });
    }
    if (r.notAllowed.length) plan.checklist.push({ id: 'na', text: `Not allowed (from your admit card): ${r.notAllowed.join(', ')}`, done: false });
    // the nearby places found so far travel with the plan (they show offline and on exam day); an incomplete list is completed in the background
    const failedTypes = draft.nearbyFailed || [];
    plan.nearby = { items: draft.nearby || [], failedTypes, at: Date.now(), status: draft.nearbyCount != null && !failedTypes.length ? 'done' : 'partial' };
    savePlan(plan);
    plans.push(plan);
  }
  if (typeof window !== 'undefined') for (const plan of plans) if (plan.centre && plan.nearby.status !== 'done') startNearbyJob(plan.id);
  return plans;
}

export { DEFAULT_CHECKLIST };
