// Reminders for the steps of the exam-morning timeline. Every step can have its own reminder (on / off).
// All switched-on reminders of all plans go into my MIN-HEAP (priority queue) ordered by time; the app sets ONE timer for the
// earliest one, and when it rings the next one is taken from the heap. (A phone that sleeps or a closed browser can still miss a reminder:
// the calendar file is the back-up.)
import { MinHeap } from '../dsa/minHeap.js';

const MAX_TIMEOUT = 2 ** 31 - 1;
let timer = null;

/** When a step rings (ms, local time of the phone). The timeline gives minutes after midnight of the exam day. */
export function stepTimeMs(plan, step) {
  if (!plan.fields.examDate) return null;
  const [y, m, d] = plan.fields.examDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0).getTime() + step.timeAbs * 60000;
}

/** Heap of { at, planId, stepId, label, text } for every step with the reminder on and a time still ahead. timelineOf(plan) -> steps. */
export function buildReminderHeap(plans, timelineOf, nowMs = Date.now()) {
  const heap = new MinHeap((a, b) => a.at < b.at || (a.at === b.at && a.stepId < b.stepId));
  for (const plan of plans) {
    for (const step of timelineOf(plan)) {
      if (!step.remind) continue;
      const at = stepTimeMs(plan, step);
      if (at === null || at <= nowMs) continue;
      heap.push({ at, planId: plan.id, stepId: step.id, label: step.label, text: step.text, centre: plan.fields.centreName || '' });
    }
  }
  return heap;
}

/** The reminders in the order they will ring (the heap is emptied: use a fresh one). */
export function ringOrder(heap) { const out = []; while (!heap.isEmpty()) out.push(heap.pop()); return out; }

/** Set the timer for the earliest reminder; when it rings, show it and set the timer for the next one. Returns how many are waiting. */
export function armTimelineReminders(plans, timelineOf, { show, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (timer !== null) { clearTimer(timer); timer = null; }
  const heap = buildReminderHeap(plans, timelineOf, now());
  const waiting = heap.size;
  const next = () => {
    const item = heap.peek();
    if (!item) return;
    const delay = item.at - now();
    if (delay > MAX_TIMEOUT) return;                       // more than about 24 days away: armed again next time the app opens
    timer = setTimer(() => {
      const due = heap.pop();
      if (show) show(due);
      next();
    }, Math.max(0, delay));
    if (timer && timer.unref) timer.unref();
  };
  next();
  return waiting;
}

/** Show a ring as a notification (service worker when there is one). */
export async function showTimelineNotification(item) {
  const text = `${item.text} · ${item.label}`;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(text, { body: item.centre, icon: 'icons/icon-192.png' });
    else if ('Notification' in window) new Notification(text);
  } catch { /* reminders are best effort */ }
}
