/*
 * HAVERSINE DISTANCE + flat-map projection
 * What:  haversineMetres = great-circle ("as the crow flies") distance between two
 *        latitude/longitude points on the Earth, in metres.
 *        toPlane = turns lat/lon into flat x/y metres around a reference latitude,
 *        good enough for city-sized areas (used by the k-d tree).
 * Used by: A* (the guess), spatial grid (distance filter), nearest-node snapping,
 *          nearby places distance.
 * Time:  O(1).  Space: O(1).
 * Why this formula? Plain "difference in degrees" is wrong because one degree of
 *        longitude is shorter than one degree of latitude. Haversine fixes that.
 */

export const EARTH_RADIUS_M = 6371008.8;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function haversineMetres(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Flat x/y (metres) for a point, measured from a reference latitude (for cos scaling). */
export function toPlane(lat, lon, referenceLat) {
  const metresPerDegree = (Math.PI / 180) * EARTH_RADIUS_M;
  return { x: lon * metresPerDegree * Math.cos(toRadians(referenceLat)), y: lat * metresPerDegree };
}
