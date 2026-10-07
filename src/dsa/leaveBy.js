/*
 * LEAVE-BY TIME (greedy, working backwards)
 * What:  the exam day is a chain of things that must fit before the deadline:
 *            leave home -> travel -> extra time (queue/crowd) -> safety buffer -> deadline
 *        Greedy idea: start from the deadline (gate-closing time, or the reporting time
 *        the user chose) and walk BACKWARDS, taking each block of time in turn:
 *            leave-by = deadline - buffer - extra - travel time
 *        At every step we make the locally safest choice (take the whole block) and the
 *        result is also the LATEST time you can leave and still be safe. No other order
 *        or search is needed, so this greedy answer is optimal.
 *        If the result goes below 00:00 it wraps to the evening before (dayOffset = -1).
 * Used by: step 4 "Leave by" screen, the plan summary, reminders and the calendar file.
 * Time:  O(1).  Space: O(1).
 * Why greedy and not a search/DP? There is nothing to choose between: every block must
 *        be fully taken, and later is always better, so subtracting is exactly right.
 */

const MINUTES_PER_DAY = 1440;

/** "08:30" -> 510. Returns null if the text is not a valid time. */
export function parseHHMM(text) {
  const parts = String(text || '').trim().split(':');
  if (parts.length !== 2) return null;
  const [hourText, minuteText] = parts;
  if (hourText.length < 1 || hourText.length > 2 || minuteText.length !== 2) return null;
  for (const ch of hourText + minuteText) if (ch < '0' || ch > '9') return null;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** 510 -> "08:30". Wraps around midnight. */
export function formatHHMM(minutes) {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Greedy backward calculation. All inputs are minutes.
 * targetMinutes = deadline (minutes after midnight), e.g. gate closing time.
 * Returns { leaveMinutes, dayOffset, text, totalBeforeMin } or null for bad input.
 */
export function computeLeaveBy({ targetMinutes, travelMin, bufferMin = 60, extraMin = 0 }) {
  const numbers = [targetMinutes, travelMin, bufferMin, extraMin];
  for (const n of numbers) if (typeof n !== 'number' || Number.isNaN(n)) return null;
  if (travelMin < 0 || bufferMin < 0 || extraMin < 0) return null;

  let time = targetMinutes;   // start at the deadline
  time -= bufferMin;          // keep the safety buffer
  time -= extraMin;           // keep the crowd / queue time
  time -= travelMin;          // keep the travel time

  const dayOffset = Math.floor(time / MINUTES_PER_DAY);
  const leaveMinutes = ((time % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { leaveMinutes, dayOffset, text: formatHHMM(leaveMinutes), totalBeforeMin: travelMin + bufferMin + extraMin };
}
