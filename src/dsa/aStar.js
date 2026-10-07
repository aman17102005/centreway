/*
 * A* SEARCH (with my min-heap and haversine)
 * What:  Dijkstra with a "guess". Nodes are ordered in the heap by
 *            known time so far (g)  +  guessed time still to go (h)
 *        where h = straight-line distance to the goal / fastest possible speed.
 *        The guess never over-guesses (no road can beat a straight line at top
 *        speed), so A* still finds the best path, but it walks mostly towards the
 *        goal and visits far fewer nodes than Dijkstra.
 *        (h is multiplied by 0.99 to stay safely below the real time even with
 *        tiny rounding differences in the map data.)
 * Used by: the offline route fallback ("Offline route (estimate)") and the demo page.
 * Time:  O((V + E) log V) worst case, usually much less work than Dijkstra.
 * Space: O(V).
 * Why A* over Dijkstra? Same answer, fewer nodes visited, so it is faster on a phone.
 * Returns { found, nodes, arcs, seconds, metres, nodesVisited, visited? }.
 */
import { MinHeap } from './minHeap.js';
import { buildPath } from './graph.js';

const GUESS_SAFETY = 0.99;

export function aStar(graph, start, goal, mode = 'car', { trackVisited = false } = {}) {
  const n = graph.nodeCount;
  const empty = { found: false, nodes: [], arcs: [], seconds: Infinity, metres: 0, nodesVisited: 0, visited: [] };
  if (!(start >= 0 && start < n && goal >= 0 && goal < n)) return empty;

  const topSpeed = graph.maxSpeedMs[mode];
  const guess = (node) => (GUESS_SAFETY * graph.crowMetres(node, goal)) / topSpeed;

  const best = new Array(n).fill(Infinity);    // g: best known seconds from start
  const cameFromNode = new Array(n).fill(-1);
  const cameByArc = new Array(n).fill(-1);
  const settled = new Array(n).fill(false);
  const heap = new MinHeap((a, b) => a.score < b.score);
  const visited = [];
  let nodesVisited = 0;

  best[start] = 0;
  heap.push({ node: start, score: guess(start) });
  while (!heap.isEmpty()) {
    const { node } = heap.pop();
    if (settled[node]) continue;
    settled[node] = true;
    nodesVisited++;
    if (trackVisited) visited.push(node);
    if (node === goal) {
      const path = buildPath(graph, cameByArc, cameFromNode, start, goal);
      return { found: true, nodes: path.nodes, arcs: path.arcs, seconds: best[goal], metres: path.metres, nodesVisited, visited };
    }
    for (let arc = graph.firstArc[node]; arc < graph.firstArc[node + 1]; arc++) {
      const next = graph.arcTo[arc];
      if (settled[next]) continue;
      const cost = graph.arcSeconds(arc, mode);
      if (cost === Infinity) continue;
      const seconds = best[node] + cost;
      if (seconds < best[next]) {
        best[next] = seconds;
        cameFromNode[next] = node;
        cameByArc[next] = arc;
        heap.push({ node: next, score: seconds + guess(next) });
      }
    }
  }
  return { ...empty, nodesVisited, visited };
}
