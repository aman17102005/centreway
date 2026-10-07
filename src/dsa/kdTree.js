/*
 * K-D TREE (2 dimensions)
 * What:  a binary tree that splits the points alternately by x and by y.
 *        Build: sort the points by the current axis, take the MIDDLE one as the
 *        node, put smaller ones on the left and bigger ones on the right, repeat
 *        with the other axis. The tree is balanced.
 *        Nearest neighbour: go down towards the query point, remember the best
 *        point seen, and on the way back only visit the other side if the
 *        splitting line is closer than the best distance found so far (pruning).
 *        Range search: visit a side only if the rectangle can reach it.
 * Used by: compared with the spatial grid in the benchmarks and the viva demo; it is
 *          the "tree" way to answer nearest-place questions (the grid is used in the app).
 * Time:  build = O(n log^2 n) here (merge sort at each level; O(n log n) with median
 *        selection), nearest = O(log n) on average (O(n) worst case),
 *        range search = O(sqrt(n) + answers) for a balanced 2-d tree.
 * Space: O(n).
 * Why a tree? It skips whole halves of the data, like binary search does in one dimension.
 * Points are flat x/y in metres: { x, y, data }.
 */
import { mergeSort } from './mergeSort.js';

export class KdTree {
  /** points: [{ x, y, data }] */
  constructor(points) {
    this.size = points.length;
    this.root = this.build(points.slice(), 0);
  }

  build(points, depth) {
    if (points.length === 0) return null;
    const axis = depth % 2 === 0 ? 'x' : 'y';
    const sorted = mergeSort(points, (a, b) => a[axis] - b[axis]);
    const middle = sorted.length >> 1;
    return {
      point: sorted[middle],
      axis,
      left: this.build(sorted.slice(0, middle), depth + 1),
      right: this.build(sorted.slice(middle + 1), depth + 1),
    };
  }

  /** Closest point to (x, y): { point, distance } or null for an empty tree. */
  nearest(x, y) {
    const best = { point: null, squared: Infinity };
    this.searchNearest(this.root, x, y, best);
    return best.point === null ? null : { point: best.point, distance: Math.sqrt(best.squared) };
  }

  searchNearest(node, x, y, best) {
    if (node === null) return;
    const dx = node.point.x - x;
    const dy = node.point.y - y;
    const squared = dx * dx + dy * dy;
    if (squared < best.squared) { best.squared = squared; best.point = node.point; }
    const gap = node.axis === 'x' ? x - node.point.x : y - node.point.y; // how far the query is from the splitting line
    const nearSide = gap < 0 ? node.left : node.right;
    const farSide = gap < 0 ? node.right : node.left;
    this.searchNearest(nearSide, x, y, best);
    if (gap * gap < best.squared) this.searchNearest(farSide, x, y, best); // the far side may still hold a closer point
  }

  /** All points inside the rectangle (inclusive). */
  rangeSearch(minX, minY, maxX, maxY) {
    const found = [];
    this.searchRange(this.root, minX, minY, maxX, maxY, found);
    return found;
  }

  searchRange(node, minX, minY, maxX, maxY, found) {
    if (node === null) return;
    const p = node.point;
    if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) found.push(p);
    const low = node.axis === 'x' ? minX : minY;
    const high = node.axis === 'x' ? maxX : maxY;
    const value = node.axis === 'x' ? p.x : p.y;
    if (low <= value) this.searchRange(node.left, minX, minY, maxX, maxY, found);
    if (high >= value) this.searchRange(node.right, minX, minY, maxX, maxY, found);
  }

  /** All points within `radius` of (x, y): [{ point, distance }]. */
  withinRadius(x, y, radius) {
    const candidates = this.rangeSearch(x - radius, y - radius, x + radius, y + radius);
    const result = [];
    for (let i = 0; i < candidates.length; i++) {
      const distance = Math.hypot(candidates[i].x - x, candidates[i].y - y);
      if (distance <= radius) result.push({ point: candidates[i], distance });
    }
    return result;
  }
}
