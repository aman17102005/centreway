// Reminders for leaving on time. Web reminders are not guaranteed (the phone may sleep or the browser may be closed),
// so the app also gives a calendar file. Reminders fire only while the browser can run the app.
import { listPlans } from '../store.js';
import { buildIcs } from '../logic/share.js';
import { computeLeaveBy, parseHHMM } from '../dsa/leaveBy.js';

const timers = [];
const MAX_TIMEOUT = 2 ** 31 - 1; // about 24 days

/** When should the reminder ring (local time, ms)? 10 minutes before leaving. null if we cannot tell. */
export function reminderTime(plan, leave) {
  if (!leave || !plan.fields.examDate) return null;
  const [y, m, d] = plan.fields.examDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, leave.leaveMinutes).getTime() + leave.dayOffset * 86400000 - 10 * 60000;
}

/** Set a timer for every plan that wants a reminder and whose time is still ahead (and not more than ~24 days away). */
export function scheduleReminders(plans, leaveOf, title = 'Time to leave') {
  timers.splice(0).forEach(clearTimeout);
  let count = 0;
  for (const plan of plans) {
    if (!plan.reminder) continue;
    const leave = leaveOf(plan);
    const at = reminderTime(plan, leave);
    if (at === null) continue;
    const delay = at - Date.now();
    if (delay <= 0 || delay > MAX_TIMEOUT) continue;
    timers.push(setTimeout(async () => {
      const text = `${title}: ${leave.text}`;
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) reg.showNotification(text, { body: plan.fields.centreName || '', icon: 'icons/icon-192.png' });
      else if ('Notification' in window) new Notification(text);
    }, delay));
    count++;
  }
  return count;
}

/** Ask for permission (needs a tap) and return true if reminders can be shown. */
export async function askNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** One calendar file with the leave time of every exam day. */
export function icsForPlans(plans, leaveOf, timelineOf = null) {
  const events = [];
  for (const plan of plans) {
    const leave = leaveOf(plan);
    if (!leave || !plan.fields.examDate) continue;
    let date = plan.fields.examDate;
    if (leave.dayOffset < 0) { const dt = new Date(`${date}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + leave.dayOffset); date = dt.toISOString().slice(0, 10); }
    const one = buildIcs({
      title: `Leave by ${leave.text} - ${plan.fields.examName || plan.fields.centreName || 'exam'}`, date, leaveBy: leave.text,
      location: plan.fields.address || plan.fields.centreName, uid: plan.id, description: 'Always follow the instructions on your admit card.',
    });
    if (one) events.push(one);
    // every step of the exam-morning timeline is an event too (wake up, leave, stops, reach the centre, reporting, gate, exam)
    if (timelineOf) {
      for (const step of timelineOf(plan)) {
        const stepDate = new Date(`${plan.fields.examDate}T00:00:00Z`); stepDate.setUTCDate(stepDate.getUTCDate() + step.dayOffset);
        const e = buildIcs({ title: `${step.text} ${step.label} - ${plan.fields.examName || plan.fields.centreName || 'exam'}`, date: stepDate.toISOString().slice(0, 10), leaveBy: step.text, durationMin: 10,
          location: plan.fields.address || plan.fields.centreName, uid: `${plan.id}-${step.id}`, description: 'Exam-morning timeline. Always follow the instructions on your admit card.' });
        if (e) events.push(e);
      }
    }
  }
  if (!events.length) return null;
  // join the single-event calendars into one
  const body = events.map((e) => e.split('BEGIN:VEVENT')[1].split('END:VEVENT')[0]).map((b) => `BEGIN:VEVENT${b}END:VEVENT`);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CentreWay//EN', 'CALSCALE:GREGORIAN', ...body, 'END:VCALENDAR'].join('\r\n');
}

export { computeLeaveBy, parseHHMM, listPlans };
