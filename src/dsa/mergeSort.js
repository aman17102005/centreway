/*
 * MERGE SORT (stable)
 * What:  split the list in two halves, sort each half, then merge the two sorted
 *        halves by always taking the smaller front item. "Stable" means items
 *        that compare equal keep their original order (we take from the left
 *        half on ties).
 * Used by: nearby places sorted by distance, k-d tree building, top-K output order,
 *          search suggestions.
 * Time:  O(n log n) in best, average and worst case.
 * Space: O(n) extra (the merged copies).
 * Why not quicksort? Quicksort is not stable and can be O(n^2) on bad input.
 *        Merge sort is always O(n log n) and keeps ties in order.
 * compare(a, b) returns a negative number if a goes first, positive if b goes
 * first, 0 if equal. Returns a NEW array; the input is not changed.
 */

const numberCompare = (a, b) => a - b;

export function mergeSort(items, compare = numberCompare) {
  if (items.length <= 1) return items.slice();
  const middle = items.length >> 1;
  const left = mergeSort(items.slice(0, middle), compare);
  const right = mergeSort(items.slice(middle), compare);
  return merge(left, right, compare);
}

/** Join two sorted lists into one sorted list. */
function merge(left, right, compare) {
  const result = new Array(left.length + right.length);
  let l = 0;
  let r = 0;
  let out = 0;
  while (l < left.length && r < right.length) {
    // "<= 0" takes from the left on ties, which keeps the sort stable.
    if (compare(left[l], right[r]) <= 0) result[out++] = left[l++];
    else result[out++] = right[r++];
  }
  while (l < left.length) result[out++] = left[l++];
  while (r < right.length) result[out++] = right[r++];
  return result;
}
