/*
 * Distance helpers — shared by the domain layer.
 *
 * Haversine on a sphere of WGS84 mean radius. Accurate to ~0.5 % at city
 * scale, which is fine for bucketing decisions (we never use the result
 * for anything where sub-meter accuracy matters). Pure.
 */

const EARTH_R_M = 6_371_008.8;
const DEG = Math.PI / 180;

export function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const sa = Math.sin(dLat / 2);
  const so = Math.sin(dLon / 2);
  const c = sa * sa + Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * so * so;
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(c));
}
