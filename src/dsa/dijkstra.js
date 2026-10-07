/*
 * DIJKSTRA'S SHORTEST PATH (with my min-heap)
 * What:  finds the fastest road path from a start node to a goal node.
 *        It keeps the best known travel time to every node. Repeatedly it takes the
 *        node with the smallest known time from the heap, "settles" it, and tries
 *        to improve the time of each neighbour. The first time the goal is taken
 *        from the heap, its time is the best possible (all weights are >= 0).
 *        (Lazy version: a node can be in the heap more than once; old copies are skipped.)
 * Used by: offline route fallback and the viva demo page (compared with A*).
 * Time:  O((V + E) log V) with a binary heap.
 * Space: O(V) for the time table and heap.
 * Why Dijkstra and not BFS? BFS counts roads, but roads have different lengths and
 *        speeds. Dijkstra handles weights. It explores in all directions equally,
 *        which is why A* (aStar.js) usually visits fewer nodes.
 * Returns { found, nodes, arcs, seconds, metres, nodesVisited, visited? }.
 */
import { MinHeap } from './minHeap.js';
import { buildPath } from './graph.js';

export function dijkstra(graph, start, goal, mode = 'car', { trackVisited = false } = {}) {
  const n = graph.nodeCount;
  const empty = { found: false, nodes: [], arcs: [], seconds: Infinity, metres: 0, nodesVisited: 0, visited: [] };
  if (!(start >= 0 && start < n && goal >= 0 && goal < n)) return empty;

  const best = new Array(n).fill(Infinity);   // best known seconds to each node
  const cameFromNode = new Array(n).fill(-1);
  const cameByArc = new Array(n).fill(-1);
  const settled = new Array(n).fill(false);
  const heap = new MinHeap((a, b) => a.seconds < b.seconds);
  const visited = [];
  let nodesVisited = 0;

  best[start] = 0;
  heap.push({ node: start, seconds: 0 });
  while (!heap.isEmpty()) {
    const { node, seconds } = heap.pop();
    if (settled[node]) continue;          // an older, slower copy: skip
    settled[node] = true;
    nodesVisited++;
    if (trackVisited) visited.push(node);
    if (node === goal) {
      const path = buildPath(graph, cameByArc, cameFromNode, start, goal);
      return { found: true, nodes: path.nodes, arcs: path.arcs, seconds, metres: path.metres, nodesVisited, visited };
    }
    for (let arc = graph.firstArc[node]; arc < graph.firstArc[node + 1]; arc++) {
      const next = graph.arcTo[arc];
      if (settled[next]) continue;
      const cost = graph.arcSeconds(arc, mode);
      if (cost === Infinity) continue;    // this mode may not use this road
      if (seconds + cost < best[next]) {
        best[next] = seconds + cost;
        cameFromNode[next] = node;
        cameByArc[next] = arc;
        heap.push({ node: next, seconds: best[next] });
      }
    }
  }
  return { ...empty, nodesVisited, visited };
}
