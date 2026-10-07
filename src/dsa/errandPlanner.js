/*
 * ERRAND PLANNER (bitmask dynamic programming)
 * What:  the student starts at home, must visit ONE shop of each ticked kind (for example a photocopy shop, an ATM and a chemist)
 *        and then reach the exam centre. Each kind has a few candidate shops (up to 5). Which shop of each kind, and in WHICH ORDER,
 *        gives the smallest total time (travel time between the places + the minutes spent at every stop)?
 *        This is a small travelling-salesman problem with a choice of place for every kind ("group TSP").
 * How:   a bitmask says which KINDS are already visited (bit g = kind g). The state is (mask, last place).
 *            best[mask][place] = the least time to start at home, visit exactly the kinds in `mask`, and stand at `place`
 *        Move on to an unvisited kind g by going to any candidate c of that kind:
 *            best[mask | bit g][c] = min( best[mask][place] + travel[place][c] + dwell[g] )
 *        The answer is min over `place` of best[all kinds][place] + travel[place][centre]. A parent table remembers the choices,
 *        so the order and the shops can be rebuilt. Travel times need not be symmetric (one-way roads are fine).
 * Used by: the "stops on the way" planner on the plan screen (src/logic/errands.js), and the demo on dsa.html.
 * Time:  O(2^T * N * N) with T kinds (at most 3 in the app, 8 allowed) and N = places (home, candidates, centre).
 *        With T = 3 and 5 candidates each: 8 * 16 * 16 steps, far below a millisecond.
 * Space: O(2^T * N) for the table and the parent table.
 * Why DP and not brute force? Brute force tries every order of the kinds times every choice of shop: T! * 5^T (6 * 125 = 750 for T = 3,
 *        but 40320 * 390625 for T = 8). The DP re-uses the best way to reach "these kinds visited, standing here", which is
 *        why it grows with 2^T instead of T!. The tests check that both always give the same total time on random inputs.
 * No built-in sort, Map or Set are used (only arrays).
 */

const INF = Infinity;

/**
 * travel: n x n matrix of minutes (travel[i][j] = from place i to place j).
 * start, centre: place numbers. groups[g]: place numbers of the candidates of kind g. dwell[g]: minutes spent at a stop of kind g.
 * Returns { totalMin, travelMin, dwellMin, order: [{ group, node, arriveMin, departMin }], centreArriveMin } or null if a kind has no
 * candidate or a time is missing. Times in `order` are minutes after leaving home.
 */
export function planErrands({ travel, start, centre, groups, dwell }) {
  const T = groups.length;
  if (T > 8) throw new Error('too many kinds (8 at most)');
  const n = travel.length;
  for (let g = 0; g < T; g++) if (!groups[g] || groups[g].length === 0) return null;
  const full = (1 << T) - 1;

  const best = new Array(1 << T);
  const parentNode = new Array(1 << T);       // the place we came from
  const parentKind = new Array(1 << T);       // the kind we were visiting when we arrived here
  for (let mask = 0; mask <= full; mask++) {
    best[mask] = new Array(n).fill(INF);
    parentNode[mask] = new Array(n).fill(-1);
    parentKind[mask] = new Array(n).fill(-1);
  }
  best[0][start] = 0;

  for (let mask = 0; mask < full; mask++) {
    for (let place = 0; place < n; place++) {
      const here = best[mask][place];
      if (here === INF) continue;
      for (let g = 0; g < T; g++) {
        if (mask & (1 << g)) continue;
        const next = mask | (1 << g);
        for (let k = 0; k < groups[g].length; k++) {
          const c = groups[g][k];
          const cost = here + travel[place][c] + dwell[g];
          if (cost < best[next][c]) { best[next][c] = cost; parentNode[next][c] = place; parentKind[next][c] = g; }
        }
      }
    }
  }

  // the centre is the last place
  let totalMin = INF; let last = -1;
  for (let place = 0; place < n; place++) {
    if (best[full][place] === INF) continue;
    const total = best[full][place] + travel[place][centre];
    if (total < totalMin) { totalMin = total; last = place; }
  }
  if (totalMin === INF || Number.isNaN(totalMin)) return null;

  // walk the parents backwards to rebuild the order of the stops
  const reversed = [];
  let mask = full; let place = last;
  while (mask !== 0) {
    const g = parentKind[mask][place];
    reversed.push({ group: g, node: place });
    const before = parentNode[mask][place];
    mask &= ~(1 << g); place = before;
  }
  const order = [];
  let clock = 0; let at = start; let dwellMin = 0;
  for (let i = reversed.length - 1; i >= 0; i--) {
    const { group, node } = reversed[i];
    const arriveMin = clock + travel[at][node];
    const departMin = arriveMin + dwell[group];
    order.push({ group, node, arriveMin, departMin });
    dwellMin += dwell[group]; clock = departMin; at = node;
  }
  const centreArriveMin = clock + travel[at][centre];
  return { totalMin, travelMin: totalMin - dwellMin, dwellMin, order, centreArriveMin };
}
