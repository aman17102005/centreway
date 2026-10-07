// The exam-morning timeline, worked backwards from the time the user must reach the centre:
//   Wake up -> Leave home -> [each stop in the planned order] -> Reach the centre -> Reporting time -> Gate closes -> Exam starts
// If the user sleeps near the centre the day before, it starts from the stay instead of home.
// Times are minutes after midnight of the exam day (negative = the evening / night before).
import { parseHHMM, formatHHMM } from '../dsa/leaveBy.js';
import { mergeSort } from '../dsa/mergeSort.js';
import { CONFIG } from '../config.js';

/** Steps that have a reminder switched on unless the user changes it. */
const REMIND_BY_DEFAULT = ['wake', 'leave'];

/**
 * leave: { leaveMinutes, dayOffset } for the trip that is planned (from home, or from the stay).
 * stops: stopClockTimes() of the errands (may be empty). arriveCentre: minutes after leaving (travel, with the stops).
 * Returns [{ id, kind, label, timeAbs, text, dayOffset, stop?, remind }] in time order. Steps without a time on the card are left out.
 */
export function buildTimeline({ fields, leave, stops = [], tripMin, getReadyMin = CONFIG.stay.getReadyMin, fromStay = null, reminders = {} }) {
  if (!leave) return [];
  const leaveAbs = leave.leaveMinutes + 1440 * leave.dayOffset;
  const steps = [];
  const add = (id, kind, label, timeAbs, extra = {}) => steps.push({ id, kind, label, timeAbs, text: formatHHMM(timeAbs), dayOffset: Math.floor(timeAbs / 1440), remind: id in reminders ? Boolean(reminders[id]) : REMIND_BY_DEFAULT.includes(id), ...extra });
  add('wake', 'wake', 'Wake up', leaveAbs - getReadyMin);
  add('leave', fromStay ? 'leaveStay' : 'leaveHome', fromStay ? `Leave ${fromStay.name || 'the stay'}` : 'Leave home', leaveAbs);
  stops.forEach((s, i) => add(`stop${i + 1}`, 'stop', `${s.name || s.kind}`, s.arriveClock, { stop: { kind: s.kind, name: s.name, departClock: s.departClock, early: s.early } }));
  add('reach', 'reach', 'Reach the centre', leaveAbs + tripMin);
  const report = parseHHMM(fields.reportTime); const gate = parseHHMM(fields.gateTime); const start = parseHHMM(fields.startTime);
  if (report !== null) add('report', 'report', 'Reporting time', report);
  if (gate !== null) add('gate', 'gate', 'Gate closes', gate);
  if (start !== null) add('start', 'start', 'Exam starts', start);
  return mergeSort(steps, (a, b) => a.timeAbs - b.timeAbs);       // stable: equal times keep the order above
}
