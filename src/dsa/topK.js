/*
 * TOP-K (K best items using a heap of size K)
 * What:  go through the items once. Keep a heap holding the K best items seen so
 *        far, with the WORST of those K at the top. A new item is only interesting
 *        if it beats that worst one; then it replaces it.
 * Used by: nearby places (K closest per type), trie suggestions (K heaviest).
 * Time:  O(n log K).  Space: O(K).
 * Why not sort everything? Full sort is O(n log n) and needs all n items in memory.
 *        When K is small (like 5 of 5000), top-K is faster and smaller.
 * compare(a, b) < 0 means "a is better than b" (comes earlier).
 * Result is ordered best first.
 */
import { MinHeap } from './minHeap.js';

export function topK(items, k, compare) {
  if (k <= 0) return [];
  // "worst first" heap: the item that is worst among the kept ones sits on top
  const keptHeap = new MinHeap((a, b) => compare(a, b) > 0);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (keptHeap.size < k) keptHeap.push(item);
    else if (compare(item, keptHeap.peek()) < 0) {
      keptHeap.pop();
      keptHeap.push(item);
    }
  }
  const result = new Array(keptHeap.size);
  for (let i = result.length - 1; i >= 0; i--) result[i] = keptHeap.pop(); // worst goes last
  return result;
}
