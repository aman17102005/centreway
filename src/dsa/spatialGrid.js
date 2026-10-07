/*
 * SPATIAL GRID (bucket grid)
 * What:  the map is cut into small square cells (for example 300 m x 300 m). Each
 *        point goes into the bucket of its cell. A bucket list is found through my
 *        HashMap using the cell name "column,row".
 *        within(R): only look at the cells that the circle of radius R touches.
 *        nearest: look at the cell of the point, then the ring of cells around it,
 *        then the next ring ... and stop when no unseen cell can hold a closer point.
 * Used by: (1) nearby places: put Overpass results in the grid, ask for places
 *              within a radius and the closest ones per type,
 *          (2) snapping a start/end point to the nearest road-graph node.
 * Time:  insert = O(1). within(R) = O(cells touched + points in them), not O(n).
 *        nearest = O(rings * cells per ring + points seen), usually a few cells.
 * Space: O(n + occupied cells).
 * Why not check every point? Brute force costs O(n) per question. With 30,000 road
 *        nodes that is too slow for every snap; the grid looks at a handful.
 * Flat-map note: cells are made on a flat x/y plane (metres) around a reference
 *        latitude. Final distances use haversine.
 */
import { HashMap } from './hashMap.js';
import { haversineMetres, toPlane } from './haversine.js';

export class SpatialGrid {
  constructor(cellMetres = 300, referenceLat = 30.7) {
    this.cellMetres = cellMetres;
    this.referenceLat = referenceLat;
    this.cells = new HashMap();   // "col,row" -> array of points
    this.count = 0;
  }

  get size() { return this.count; }

  cellOf(lat, lon) {
    const p = toPlane(lat, lon, this.referenceLat);
    return { col: Math.floor(p.x / this.cellMetres), row: Math.floor(p.y / this.cellMetres) };
  }

  insert(lat, lon, data = null) {
    const { col, row } = this.cellOf(lat, lon);
    const key = `${col},${row}`;
    let bucket = this.cells.get(key);
    if (bucket === undefined) { bucket = []; this.cells.set(key, bucket); }
    bucket.push({ lat, lon, data });
    this.count++;
  }

  /** All points within radiusMetres: [{ lat, lon, data, distance }] (not sorted). */
  within(lat, lon, radiusMetres) {
    const result = [];
    const centre = toPlane(lat, lon, this.referenceLat);
    // a little extra margin (2%) so flat-map rounding never hides a point
    const reach = radiusMetres * 1.02 + 1;
    const colFrom = Math.floor((centre.x - reach) / this.cellMetres);
    const colTo = Math.floor((centre.x + reach) / this.cellMetres);
    const rowFrom = Math.floor((centre.y - reach) / this.cellMetres);
    const rowTo = Math.floor((centre.y + reach) / this.cellMetres);
    for (let col = colFrom; col <= colTo; col++) {
      for (let row = rowFrom; row <= rowTo; row++) {
        const bucket = this.cells.get(`${col},${row}`);
        if (bucket === undefined) continue;
        for (let i = 0; i < bucket.length; i++) {
          const distance = haversineMetres(lat, lon, bucket[i].lat, bucket[i].lon);
          if (distance <= radiusMetres) result.push({ lat: bucket[i].lat, lon: bucket[i].lon, data: bucket[i].data, distance });
        }
      }
    }
    return result;
  }

  /** The closest point within maxMetres, or null. */
  nearest(lat, lon, maxMetres = 5000) {
    if (this.count === 0) return null;
    const home = this.cellOf(lat, lon);
    const maxRing = Math.ceil(maxMetres / this.cellMetres) + 1;
    let best = null;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Any point in an unseen ring is at least (ring - 1) cells away... after finishing ring r,
      // everything unseen is further than r * cellMetres (minus a 2% safety margin).
      if (best !== null && best.distance <= (ring - 1) * this.cellMetres * 0.98) break;
      for (let col = home.col - ring; col <= home.col + ring; col++) {
        for (let row = home.row - ring; row <= home.row + ring; row++) {
          const onRingEdge = col === home.col - ring || col === home.col + ring || row === home.row - ring || row === home.row + ring;
          if (!onRingEdge) continue; // inner cells were done in earlier rings
          const bucket = this.cells.get(`${col},${row}`);
          if (bucket === undefined) continue;
          for (let i = 0; i < bucket.length; i++) {
            const distance = haversineMetres(lat, lon, bucket[i].lat, bucket[i].lon);
            if (best === null || distance < best.distance) best = { lat: bucket[i].lat, lon: bucket[i].lon, data: bucket[i].data, distance };
          }
        }
      }
    }
    return best !== null && best.distance <= maxMetres ? best : null;
  }
}
