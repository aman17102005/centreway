/*
 * RATE LIMITER (uses my Queue)
 * What:  makes sure a task STARTS at most once every `minGapMs` milliseconds.
 *        Tasks wait in a first-in-first-out queue. When the gap has passed, the
 *        oldest waiting task runs.
 * Used by: Nominatim address search. Their policy allows at most 1 request per
 *          second, so we use a gap of 1100 ms.
 * Time:  schedule = O(1), taking the next task = O(1).  Space: O(waiting tasks).
 * Why a queue? Requests must be served in the order they were asked, and a queue
 *        gives O(1) add/remove at both ends. (Array.shift would be O(n).)
 * The clock and timer are passed in, so tests can use a fake clock.
 */
import { Queue } from './queue.js';

export class RateLimiter {
  constructor(minGapMs, { now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms) } = {}) {
    this.minGapMs = minGapMs;
    this.now = now;
    this.setTimer = setTimer;
    this.waiting = new Queue();
    this.lastStart = -Infinity;
    this.timerRunning = false;
  }

  /** How many tasks are waiting. */
  get pending() { return this.waiting.size; }

  /** Ask to run a task. Returns a promise with the task's result. */
  schedule(task) {
    return new Promise((resolve, reject) => {
      this.waiting.enqueue({ task, resolve, reject });
      this.pump();
    });
  }

  /** If tasks are waiting and no timer is set, wait until the gap has passed, then run one. */
  pump() {
    if (this.timerRunning || this.waiting.isEmpty()) return;
    const waitMs = Math.max(0, this.lastStart + this.minGapMs - this.now());
    this.timerRunning = true;
    this.setTimer(() => {
      this.timerRunning = false;
      const job = this.waiting.dequeue();
      this.lastStart = this.now();
      Promise.resolve().then(job.task).then(job.resolve, job.reject);
      this.pump(); // schedule the next one (it will wait for the gap)
    }, waitMs);
  }
}
