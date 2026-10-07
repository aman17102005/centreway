/*
 * BINARY MIN-HEAP
 * What:  a tree stored in an array where every parent is <= its children, so the
 *        smallest item is always at index 0. Parent of i is (i-1)/2, children
 *        are 2i+1 and 2i+2. push "bubbles up", pop "sinks down".
 * Used by: Dijkstra and A* (next closest road node), top-K nearby places
 *          (heap of size K), trie suggestions.
 * Time:  push = O(log n), pop = O(log n), peek = O(1), size = O(1).
 * Space: O(n).
 * Why not a sorted array? Keeping an array sorted costs O(n) per insert.
 *        A heap only keeps "smallest first", which is all we need, in O(log n).
 * Items are compared with isBefore(a, b) -> true if a should come out before b.
 * Default: smaller number first.
 */

const smallerFirst = (a, b) => a < b;

export class MinHeap {
  constructor(isBefore = smallerFirst) {
    this.items = [];
    this.isBefore = isBefore;
  }

  get size() { return this.items.length; }

  isEmpty() { return this.items.length === 0; }

  peek() { return this.items.length === 0 ? undefined : this.items[0]; }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  /** Remove and return the smallest item (undefined if empty). */
  pop() {
    const n = this.items.length;
    if (n === 0) return undefined;
    const smallest = this.items[0];
    const last = this.items.pop();
    if (n > 1) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return smallest;
  }

  /** Move item at index i up while it is smaller than its parent. */
  bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.isBefore(this.items[i], this.items[parent])) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Move item at index i down while a child is smaller than it. */
  sinkDown(i) {
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let best = i;
      if (left < n && this.isBefore(this.items[left], this.items[best])) best = left;
      if (right < n && this.isBefore(this.items[right], this.items[best])) best = right;
      if (best === i) return;
      this.swap(i, best);
      i = best;
    }
  }

  swap(a, b) {
    const temp = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = temp;
  }
}
