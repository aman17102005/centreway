/*
 * STACK
 * What:  last in, first out pile. We keep a "top" number that says how many
 *        items are stored; push writes at top, pop reads just below it.
 * Used by: (1) undo in the day-before checklist (each change is pushed, Undo pops),
 *          (2) Back button through the steps (each screen visited is pushed).
 * Time:  push, pop, peek, size = O(1).  Space: O(n).
 * Why a stack? Undo and Back both need "the most recent thing first", which is
 *        exactly last-in-first-out. A queue would give the oldest thing instead.
 */

export class Stack {
  constructor() {
    this.items = [];
    this.top = 0; // number of items stored
  }

  get size() { return this.top; }

  isEmpty() { return this.top === 0; }

  push(item) {
    this.items[this.top] = item;
    this.top++;
  }

  /** Remove and return the newest item (undefined if empty). */
  pop() {
    if (this.top === 0) return undefined;
    this.top--;
    const item = this.items[this.top];
    this.items[this.top] = undefined;
    return item;
  }

  /** Look at the newest item without removing it. */
  peek() {
    return this.top === 0 ? undefined : this.items[this.top - 1];
  }

  clear() {
    this.items = [];
    this.top = 0;
  }
}
