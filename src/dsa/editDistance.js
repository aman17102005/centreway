/*
 * EDIT DISTANCE (Levenshtein) with dynamic programming
 * What:  the smallest number of single-letter changes (insert, delete, replace)
 *        needed to turn word A into word B. "kitten" -> "sitting" = 3.
 *        Table cell [i][j] = distance between first i letters of A and first j
 *        letters of B. Each cell needs only the cell above, left and diagonal,
 *        so we keep just TWO rows instead of the whole table.
 *        Early stop: if every number in a row is already above the limit, the
 *        final answer cannot be below the limit, so we stop and return limit+1.
 * Used by: "Did you mean ...?" hints for OCR mistakes in the fields screen.
 * Time:  O(len(a) * len(b)) (less with the early stop).
 * Space: O(min(len(a), len(b))) -> two rows.
 * Why DP? Trying all edit sequences is exponential. DP reuses sub-answers.
 */

export function editDistance(a, b, limit = Infinity) {
  let first = Array.from(a); // Array.from keeps whole characters (Hindi, emoji) together
  let second = Array.from(b);
  if (first.length < second.length) { const t = first; first = second; second = t; } // rows = shorter word
  if (first.length - second.length > limit) return limit + 1;
  if (second.length === 0) return first.length;

  let previousRow = new Array(second.length + 1);
  let currentRow = new Array(second.length + 1);
  for (let j = 0; j <= second.length; j++) previousRow[j] = j;

  for (let i = 1; i <= first.length; i++) {
    currentRow[0] = i;
    let rowMinimum = currentRow[0];
    for (let j = 1; j <= second.length; j++) {
      const replaceCost = previousRow[j - 1] + (first[i - 1] === second[j - 1] ? 0 : 1);
      const deleteCost = previousRow[j] + 1;
      const insertCost = currentRow[j - 1] + 1;
      let best = replaceCost;
      if (deleteCost < best) best = deleteCost;
      if (insertCost < best) best = insertCost;
      currentRow[j] = best;
      if (best < rowMinimum) rowMinimum = best;
    }
    if (rowMinimum > limit) return limit + 1; // early stop
    const swap = previousRow; previousRow = currentRow; currentRow = swap;
  }
  const result = previousRow[second.length];
  return result > limit ? limit + 1 : result;
}
