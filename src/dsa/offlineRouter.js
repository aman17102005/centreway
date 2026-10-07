/*
 * OFFLINE ROUTER (glue: spatial grid + A*)
 * What:  takes two real-world points (lat/lon), snaps each to the nearest road node
 *        using the spatial grid, runs A* on the road graph, and returns the same
 *        kind of answer the app gets from OSRM (distance, time, line to draw).
 * Used by: the offline route fallback in the app (inside a Web Worker) and the demo page.
 * Time:  snapping O(cells looked at), then A*: O((V + E) log V).  Space: O(V).
 * Why glue code? The grid, graph and A* each solve one problem. This file only joins them, so each
 *        part stays small and testable on its own.
 * Returns null when a point is outside the map area, too far from any road, or no
 * path exists. The numbers are ESTIMATES made from simple speeds per road type.
 */
import { RoadGraph, MODES } from './graph.js';
import { SpatialGrid } from './spatialGrid.js';
import { aStar } from './aStar.js';
import { dijkstra } from './dijkstra.js';
import { haversineMetres } from './haversine.js';

const MAX_SNAP_METRES = 1500;
const WALK_METRES_PER_SECOND = 5 / 3.6;

export class OfflineRouter {
  constructor(graphData) {
    this.graph = new RoadGraph(graphData);
    this.snappers = {};   // mode -> SpatialGrid with only the nodes that mode can use (built when first needed)
    this.referenceLat = (graphData.bbox[0] + graphData.bbox[2]) / 2;
  }

  /** Is the point inside the area covered by the map data? */
  covers(lat, lon) {
    const [south, west, north, east] = this.graph.bbox;
    return lat >= south && lat <= north && lon >= west && lon <= east;
  }

  snapperFor(mode) {
    if (!this.snappers[mode]) {
      const grid = new SpatialGrid(300, this.referenceLat);
      const usable = this.graph.usableNodes(mode);
      for (let node = 0; node < this.graph.nodeCount; node++) if (usable[node]) grid.insert(this.graph.lat[node], this.graph.lon[node], node);
      this.snappers[mode] = grid;
    }
    return this.snappers[mode];
  }

  /** Nearest road node for a point: { node, metres } or null. */
  snap(lat, lon, mode) {
    const hit = this.snapperFor(mode).nearest(lat, lon, MAX_SNAP_METRES);
    return hit === null ? null : { node: hit.data, metres: hit.distance };
  }

  /**
   * route({lat,lng}, {lat,lng}, 'car'|'bike'|'foot', 'astar'|'dijkstra')
   * -> { distanceKm, durationMin, geometry, nodesVisited, algorithm } or null
   */
  route(from, to, mode = 'car', algorithm = 'astar') {
    if (!MODES.includes(mode)) return null;
    if (!this.covers(from.lat, from.lng) || !this.covers(to.lat, to.lng)) return null;
    const a = this.snap(from.lat, from.lng, mode);
    const b = this.snap(to.lat, to.lng, mode);
    if (a === null || b === null) return null;
    const search = algorithm === 'dijkstra' ? dijkstra : aStar;
    const result = search(this.graph, a.node, b.node, mode);
    if (!result.found) return null;
    // the short walks from the real points to the road nodes
    const connectorMetres = a.metres + b.metres;
    const metres = result.metres + connectorMetres;
    const seconds = result.seconds + connectorMetres / WALK_METRES_PER_SECOND;
    const line = this.graph.geometryOf(a.node, result.arcs);
    return {
      distanceKm: metres / 1000,
      durationMin: seconds / 60,
      geometry: [[from.lat, from.lng], ...line, [to.lat, to.lng]],
      nodesVisited: result.nodesVisited,
      algorithm,
    };
  }
}

export { haversineMetres };
