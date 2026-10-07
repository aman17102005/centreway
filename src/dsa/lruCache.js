/*
 * LRU CACHE (Least Recently Used)
 * What:  a fixed-size memory of answers. When it is full and a new answer comes
 *        in, the answer that was used LEAST recently is thrown away.
 *        Two parts work together:
 *          - my HashMap: key -> list node (so we can find an entry in O(1))
 *          - my doubly linked list: newest at the front, oldest at the back
 *            (so we can move an entry to the front, or drop the last, in O(1))
 * Used by: address search, routes and nearby places (src/services/lruStore.js).
 *          A repeated request is answered from here and not sent again.
 * Time:  get, put, has, delete = O(1).   Space: O(capacity).
 * Why not a plain array or the hash map alone? An array needs O(n) to find and
 *        reorder entries. A hash map alone does not remember "who is oldest".
 *        Map + list together give O(1) for both.
 */
import { HashMap } from './hashMap.js';

export class LRUCache {
  constructor(capacity) {
    this.capacity = Math.max(1, capacity | 0);
    this.index = new HashMap();
    // Two empty "guard" nodes mean we never have to check for null ends.
    this.head = { key: null, value: null, prev: null, next: null }; // newest side
    this.tail = { key: null, value: null, prev: null, next: null }; // oldest side
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get size() { return this.index.size; }

  /** Take a node out of the list. */
  unlink(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  /** Put a node right after head (= most recently used). */
  addToFront(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /** Return the value and mark it as most recently used. undefined if missing. */
  get(key) {
    const node = this.index.get(key);
    if (node === undefined) return undefined;
    this.unlink(node);
    this.addToFront(node);
    return node.value;
  }

  /** Is the key there? Does NOT change the order. */
  has(key) { return this.index.has(key); }

  /** Add or update. If the cache is full, the oldest entry is removed. */
  put(key, value) {
    const existing = this.index.get(key);
    if (existing !== undefined) {
      existing.value = value;
      this.unlink(existing);
      this.addToFront(existing);
      return;
    }
    if (this.index.size >= this.capacity) {
      const oldest = this.tail.prev;
      this.unlink(oldest);
      this.index.delete(oldest.key);
    }
    const node = { key: String(key), value, prev: null, next: null };
    this.addToFront(node);
    this.index.set(key, node);
  }

  delete(key) {
    const node = this.index.get(key);
    if (node === undefined) return false;
    this.unlink(node);
    this.index.delete(key);
    return true;
  }

  /** All entries from oldest to newest, as [key, value]. Used to save to storage. */
  entries() {
    const result = [];
    for (let node = this.tail.prev; node !== this.head; node = node.prev) result.push([node.key, node.value]);
    return result;
  }

  /** Load entries given oldest to newest (the format entries() gives). */
  load(entries) {
    for (let i = 0; i < entries.length; i++) this.put(entries[i][0], entries[i][1]);
  }
}
