/*
 * QUEUE (circular buffer)
 * What:  first in, first out line. Items live in an array; "head" points to the
 *        oldest item and the array wraps around at the end, so nothing is ever
 *        shifted. When the array is full it doubles in size.
 * Used by: rate limiter (waiting Nominatim requests).
 * Time:  enqueue, dequeue, peek, size = O(1) (enqueue is O(1) amortised because of growing).
 * Space: O(n).
 * Why not Array.shift()? shift() moves every item one step, so it is O(n).
 *        A circular buffer never moves items.
 */

export class Queue {
  constructor(capacity = 8) {
    this.items = new Array(capacity);
    this.head = 0;   // index of the oldest item
    this.count = 0;
  }

  get size() { return this.count; }

  isEmpty() { return this.count === 0; }

  /** Add to the back. */
  enqueue(item) {
    if (this.count === this.items.length) this.grow();
    this.items[(this.head + this.count) % this.items.length] = item;
    this.count++;
  }

  /** Remove and return the oldest item (undefined if empty). */
  dequeue() {
    if (this.count === 0) return undefined;
    const item = this.items[this.head];
    this.items[this.head] = undefined; // let the garbage collector free it
    this.head = (this.head + 1) % this.items.length;
    this.count--;
    return item;
  }

  /** Look at the oldest item without removing it. */
  peek() {
    return this.count === 0 ? undefined : this.items[this.head];
  }

  /** Double the array and copy items so the oldest is at index 0 again. */
  grow() {
    const bigger = new Array(this.items.length * 2);
    for (let i = 0; i < this.count; i++) bigger[i] = this.items[(this.head + i) % this.items.length];
    this.items = bigger;
    this.head = 0;
  }
}
