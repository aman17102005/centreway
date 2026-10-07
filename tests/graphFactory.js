// Makes small random road graphs (same format as data/graph.json) for tests.
import { haversineMetres } from '../src/dsa/haversine.js';

const SCALE = 1e5;

/**
 * width x height junctions, ~100 m apart, around Chandigarh. Some roads are one-way,
 * some missing; `islands` extra nodes have no roads (unreachable).
 */
export function makeGraphData(rng, { width = 8, height = 8, dropChance = 0.15, onewayChance = 0.15, islands = 2, types = [2, 3, 4, 5, 6, 8] } = {}) {
  const baseLat = 30.7, baseLon = 76.78;
  const nodes = [];
  const place = (r, c) => [Math.round((baseLat + r * 0.0009) * SCALE), Math.round((baseLon + c * 0.001) * SCALE)];
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) nodes.push(...place(r, c));
  for (let i = 0; i < islands; i++) nodes.push(Math.round((baseLat + 0.5 + i * 0.01) * SCALE), Math.round((baseLon + 0.5) * SCALE)); // far away, unconnected
  const edges = [];
  const addEdge = (a, b) => {
    if (rng.next() < dropChance) return;
    const metres = Math.ceil(haversineMetres(nodes[2 * a] / SCALE, nodes[2 * a + 1] / SCALE, nodes[2 * b] / SCALE, nodes[2 * b + 1] / SCALE) * (1 + rng.float(0, 0.3)) + 2);
    edges.push(a, b, metres, types[rng.int(0, types.length - 1)], rng.next() < onewayChance ? 1 : 0, 0);
  };
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const id = r * width + c;
    if (c + 1 < width) addEdge(id, id + 1);
    if (r + 1 < height) addEdge(id, id + width);
  }
  return {
    version: 1, scale: SCALE, bbox: [30.6, 76.55, 31.3, 77.3], nodes, edges, geo: [],
    nodeCount: nodes.length / 2,
  };
}

/** Slow but obviously correct shortest time: Bellman-Ford over every arc. Returns seconds or Infinity. */
export function bellmanFordSeconds(graph, start, goal, mode) {
  const dist = new Array(graph.nodeCount).fill(Infinity);
  dist[start] = 0;
  for (let round = 0; round < graph.nodeCount; round++) {
    let changed = false;
    for (let node = 0; node < graph.nodeCount; node++) {
      if (dist[node] === Infinity) continue;
      for (let arc = graph.firstArc[node]; arc < graph.firstArc[node + 1]; arc++) {
        const cost = graph.arcSeconds(arc, mode);
        if (dist[node] + cost < dist[graph.arcTo[arc]]) { dist[graph.arcTo[arc]] = dist[node] + cost; changed = true; }
      }
    }
    if (!changed) break;
  }
  return dist[goal];
}
