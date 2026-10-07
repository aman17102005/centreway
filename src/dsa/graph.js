/*
 * ROAD GRAPH (adjacency list)
 * What:  the road network as a graph. Each junction/road end is a node; each road
 *        piece between two junctions is an edge with a length in metres and a road
 *        type. "Adjacency list" means: for every node we keep the list of roads
 *        that leave it. We store all lists in a few flat arrays (CSR layout):
 *        the roads leaving node i are numbered firstArc[i] .. firstArc[i+1]-1.
 *        Edge weight = travel TIME = length / speed, where speed depends on the
 *        road type and the travel mode (walk, bike, car).
 * Used by: the offline router (Dijkstra / A*) when the OSRM server cannot be used.
 * Time:  build = O(nodes + edges). Reading the roads of a node = O(its degree).
 * Space: O(nodes + edges).
 * Why an adjacency list and not a matrix? 30,000 nodes would need a 30,000 x 30,000
 *        table (900 million cells). Road maps are sparse (about 3 roads per node),
 *        so lists use far less memory and make "look at the neighbours" fast.
 * The data file is made by tools/buildGraph.js (OpenStreetMap data, ODbL).
 */
import { HashMap } from './hashMap.js';
import { haversineMetres } from './haversine.js';

// Road type numbers must match tools/buildGraph.js
export const ROAD_TYPES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian'];

// Simple speeds in km/h for each travel mode and road type. 0 = this mode may not use that road.
const SPEED_TABLE = new HashMap();
const SPEEDS = {
  car:  [80, 55, 40, 32, 28, 22, 18, 10, 0],
  bike: [70, 50, 38, 30, 26, 22, 18, 10, 0],  // motorbike
  foot: [0, 5, 5, 5, 5, 5, 5, 5, 5],          // no walking on motorways
};
for (const mode of ['car', 'bike', 'foot']) {
  for (let type = 0; type < ROAD_TYPES.length; type++) SPEED_TABLE.set(`${mode}:${type}`, SPEEDS[mode][type]);
}

export const MODES = ['car', 'bike', 'foot'];

export class RoadGraph {
  /** data = parsed data/graph.json */
  constructor(data) {
    this.bbox = data.bbox;
    const scale = data.scale;
    this.nodeCount = data.nodes.length / 2;
    this.lat = new Array(this.nodeCount);
    this.lon = new Array(this.nodeCount);
    for (let i = 0; i < this.nodeCount; i++) {
      this.lat[i] = data.nodes[2 * i] / scale;
      this.lon[i] = data.nodes[2 * i + 1] / scale;
    }

    // Speed per type for each mode, read once from the hash map into plain arrays (fast in the search loops).
    this.speedMs = {};      // mode -> array by road type, in metres per second (0 = not allowed)
    this.maxSpeedMs = {};   // mode -> fastest speed, used by A*
    for (const mode of MODES) {
      this.speedMs[mode] = [];
      let fastest = 0;
      for (let type = 0; type < ROAD_TYPES.length; type++) {
        const metresPerSecond = SPEED_TABLE.get(`${mode}:${type}`) / 3.6;
        this.speedMs[mode].push(metresPerSecond);
        if (metresPerSecond > fastest) fastest = metresPerSecond;
      }
      this.maxSpeedMs[mode] = fastest;
    }

    // Read the edge list: a, b, metres, type, oneway, bendCount
    const edges = data.edges;
    const edgeCount = edges.length / 6;
    this.edgeBendStart = new Array(edgeCount);
    this.geo = data.geo;
    this.scale = scale;
    const degree = new Array(this.nodeCount + 1).fill(0);
    let bendOffset = 0;
    for (let e = 0; e < edgeCount; e++) {
      const a = edges[6 * e];
      const b = edges[6 * e + 1];
      const oneway = edges[6 * e + 4] === 1;
      degree[a]++;
      if (!oneway) degree[b]++;
      this.edgeBendStart[e] = bendOffset;
      bendOffset += edges[6 * e + 5];
    }

    // CSR arrays: roads leaving node i are firstArc[i] .. firstArc[i + 1] - 1
    this.firstArc = new Array(this.nodeCount + 1).fill(0);
    for (let i = 0; i < this.nodeCount; i++) this.firstArc[i + 1] = this.firstArc[i] + degree[i];
    const arcTotal = this.firstArc[this.nodeCount];
    this.arcTo = new Array(arcTotal);
    this.arcMetres = new Array(arcTotal);
    this.arcType = new Array(arcTotal);
    this.arcEdge = new Array(arcTotal);
    this.arcForward = new Array(arcTotal); // true if the arc runs a -> b (same direction as the stored bend points)
    const fill = this.firstArc.slice(0, this.nodeCount);
    const addArc = (from, to, metres, type, edgeIndex, forward) => {
      const slot = fill[from]++;
      this.arcTo[slot] = to; this.arcMetres[slot] = metres; this.arcType[slot] = type;
      this.arcEdge[slot] = edgeIndex; this.arcForward[slot] = forward;
    };
    for (let e = 0; e < edgeCount; e++) {
      const [a, b, metres, type, oneway] = [edges[6 * e], edges[6 * e + 1], edges[6 * e + 2], edges[6 * e + 3], edges[6 * e + 4]];
      addArc(a, b, metres, type, e, true);
      if (oneway !== 1) addArc(b, a, metres, type, e, false);
    }
    this.arcCount = arcTotal;
  }

  /** Seconds to drive/walk along an arc in this mode. Infinity if the mode may not use it. */
  arcSeconds(arc, mode) {
    const speed = this.speedMs[mode][this.arcType[arc]];
    return speed === 0 ? Infinity : this.arcMetres[arc] / speed;
  }

  /** Does this node have at least one road that the mode may use (leaving or arriving)? Used when snapping points. */
  usableNodes(mode) {
    const usable = new Array(this.nodeCount).fill(false);
    for (let node = 0; node < this.nodeCount; node++) {
      for (let arc = this.firstArc[node]; arc < this.firstArc[node + 1]; arc++) {
        if (this.speedMs[mode][this.arcType[arc]] > 0) { usable[node] = true; usable[this.arcTo[arc]] = true; }
      }
    }
    return usable;
  }

  /** Straight-line metres between two nodes. */
  crowMetres(a, b) {
    return haversineMetres(this.lat[a], this.lon[a], this.lat[b], this.lon[b]);
  }

  /** [lat, lon] points along a path of arcs (includes the small bends inside each road piece). */
  geometryOf(startNode, arcs) {
    const points = [[this.lat[startNode], this.lon[startNode]]];
    for (let i = 0; i < arcs.length; i++) {
      const arc = arcs[i];
      const edge = this.arcEdge[arc];
      const first = this.edgeBendStart[edge];
      const count = (edge + 1 < this.edgeBendStart.length ? this.edgeBendStart[edge + 1] : this.geo.length / 2) - first;
      const bends = [];
      for (let k = 0; k < count; k++) bends.push([this.geo[2 * (first + k)] / this.scale, this.geo[2 * (first + k) + 1] / this.scale]);
      if (!this.arcForward[arc]) bends.reverse();
      for (let k = 0; k < bends.length; k++) points.push(bends[k]);
      const to = this.arcTo[arc];
      points.push([this.lat[to], this.lon[to]]);
    }
    return points;
  }
}

/** Turn the "which arc did we arrive by" table into the path from start to goal. */
export function buildPath(graph, cameByArc, cameFromNode, start, goal) {
  const nodes = [goal];
  const arcs = [];
  let metres = 0;
  for (let node = goal; node !== start; node = cameFromNode[node]) {
    arcs.push(cameByArc[node]);
    metres += graph.arcMetres[cameByArc[node]];
    nodes.push(cameFromNode[node]);
  }
  nodes.reverse();
  arcs.reverse();
  return { nodes, arcs, metres };
}
