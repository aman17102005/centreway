/*
 * HASH MAP (separate chaining)
 * What:  key -> value table. Each bucket holds a small linked chain of entries.
 *        The hash function turns a string key into a bucket number.
 *        When the table gets too full (load factor > 0.75) it doubles the
 *        number of buckets and re-places every entry (resizing).
 * Used by: LRU cache (key -> list node), spatial grid (cell name -> points),
 *          trie (letter -> child), graph (road type -> speed), place suggestions.
 * Time:  set / get / has / delete = O(1) on average, O(n) in the worst case
 *        (all keys in one bucket). Resize = O(n) but happens rarely, so
 *        the cost of set stays O(1) amortised.
 * Space: O(n + buckets).
 * Why not a plain object or array? An array needs a search (O(n)) to find a key.
 *        A hash map jumps straight to the right bucket.
 */

const MAX_LOAD_FACTOR = 0.75;

/** String hash (djb2 style): mixes every character into one 32-bit number. */
export function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 33) + text.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // make it positive
}

export class HashMap {
  constructor(bucketCount = 16) {
    this.buckets = new Array(bucketCount).fill(null); // each slot is null or a chain of nodes
    this.count = 0;
  }

  /** Number of keys stored. */
  get size() { return this.count; }

  /** Which bucket does this key belong to? */
  bucketIndex(key) {
    return hashString(String(key)) % this.buckets.length;
  }

  /** Add a key, or change its value if it is already there. */
  set(key, value) {
    const name = String(key);
    const index = this.bucketIndex(name);
    for (let node = this.buckets[index]; node !== null; node = node.next) {
      if (node.key === name) { node.value = value; return; }
    }
    this.buckets[index] = { key: name, value, next: this.buckets[index] }; // new node at the front
    this.count++;
    if (this.count / this.buckets.length > MAX_LOAD_FACTOR) this.resize(this.buckets.length * 2);
  }

  /** Return the value, or undefined if the key is missing. */
  get(key) {
    const name = String(key);
    for (let node = this.buckets[this.bucketIndex(name)]; node !== null; node = node.next) {
      if (node.key === name) return node.value;
    }
    return undefined;
  }

  has(key) {
    const name = String(key);
    for (let node = this.buckets[this.bucketIndex(name)]; node !== null; node = node.next) {
      if (node.key === name) return true;
    }
    return false;
  }

  /** Remove a key. Returns true if it was there. */
  delete(key) {
    const name = String(key);
    const index = this.bucketIndex(name);
    let previous = null;
    for (let node = this.buckets[index]; node !== null; previous = node, node = node.next) {
      if (node.key === name) {
        if (previous === null) this.buckets[index] = node.next;
        else previous.next = node.next;
        this.count--;
        return true;
      }
    }
    return false;
  }

  /** Make a bigger table and put every entry into its new bucket. */
  resize(newBucketCount) {
    const oldBuckets = this.buckets;
    this.buckets = new Array(newBucketCount).fill(null);
    for (let i = 0; i < oldBuckets.length; i++) {
      let node = oldBuckets[i];
      while (node !== null) {
        const next = node.next;
        const index = hashString(node.key) % newBucketCount;
        node.next = this.buckets[index];
        this.buckets[index] = node;
        node = next;
      }
    }
  }

  /** All keys, in no particular order. */
  keys() {
    const result = [];
    for (let i = 0; i < this.buckets.length; i++) {
      for (let node = this.buckets[i]; node !== null; node = node.next) result.push(node.key);
    }
    return result;
  }

  values() {
    const result = [];
    for (let i = 0; i < this.buckets.length; i++) {
      for (let node = this.buckets[i]; node !== null; node = node.next) result.push(node.value);
    }
    return result;
  }

  clear() {
    this.buckets = new Array(16).fill(null);
    this.count = 0;
  }
}
