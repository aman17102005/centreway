// "Stay the night before?" advice. Checked automatically for every plan.
// Shown when the leave-by time is before 04:30 (or the evening before) or the trip is longer than 3 hours (limits in config.js).
// It also says when you could leave if you slept near the centre, and lists the closest stays (top-K heap by distance).
import { CONFIG } from '../config.js';
import { topK } from '../dsa/topK.js';
import { computeLeaveBy } from '../dsa/leaveBy.js';

/** Minutes of travel from a stay at `km` kilometres, estimated from the straight distance (roads are longer: x detour, at an average speed). */
export function stayTravelMin(km) {
  return Math.max(3, Math.round((km * CONFIG.errands.estimateDetour / CONFIG.errands.estimateSpeedKmh) * 60));
}

/**
 * leave: { leaveMinutes, dayOffset } (from the plan), travelMin: the whole trip in minutes, stays: nearby places of the kind 'lodging'
 * (with distanceKm and name), target: { targetMinutes, bufferMin, extraMin }.
 * Returns { advise, reasons: ['early' | 'long'], stays: the 5 closest, fewStays, stayLeave: { text, dayOffset, travelMin, nearest } | null }.
 */
export function stayAdvice({ leave, travelMin, stays = [], target, limits = CONFIG.stay }) {
  if (!leave) return { advise: false, reasons: [], stays: [], fewStays: true, stayLeave: null };
  const reasons = [];
  if (leave.dayOffset < 0 || leave.leaveMinutes < limits.leaveBeforeMinutes) reasons.push('early');
  if (travelMin > limits.travelOverMinutes) reasons.push('long');
  const closest = topK(stays.filter((s) => Number.isFinite(s.distanceKm)), 5, (a, b) => a.distanceKm - b.distanceKm);
  let stayLeave = null;
  if (closest.length && target) {
    const minutes = stayTravelMin(closest[0].distanceKm);
    const r = computeLeaveBy({ targetMinutes: target.targetMinutes, travelMin: minutes, bufferMin: target.bufferMin, extraMin: target.extraMin });
    if (r) stayLeave = { text: r.text, leaveMinutes: r.leaveMinutes, dayOffset: r.dayOffset, travelMin: minutes, nearest: closest[0] };
  }
  return { advise: reasons.length > 0, reasons, stays: closest, fewStays: closest.length < 3, stayLeave };
}
