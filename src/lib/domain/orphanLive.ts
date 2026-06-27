/*
 * orphanLive — synthesize a `kind: 'live'` Vehicle for a live GPS
 * observation whose trip_id wasn't surfaced by the schedule scanner
 * (bus running early/late, calendar mismatch, etc.).
 *
 * Pure. The only inputs we need beyond the live observation itself
 * are the route (already on the station card from the schedule scan)
 * and the trip's shape (already fetched by the existing
 * `getShapesForTrips` call for reconciled ETAs). No new worker query,
 * no stops-along-trip lookup — the bucketer doesn't need
 * scheduledArrival/Departure for `kind: 'live'`, and predictEta
 * returns negative minutes when the bus is past the station so a
 * stop-sequence check would be redundant.
 */

import { predictEta } from './predictEta';
import type { Polyline } from './shapeProjection';
import type { LiveVehicleObservation } from '$lib/data/live/gtfsRtClient';
import type { Route, Vehicle } from './types';

/** ETA at which we consider the bus to have passed the station and
 *  drop the orphan. 1 min of grace covers GPS jitter and a bus
 *  dwelling slightly past the stop's projection. */
const PAST_STATION_MIN = -1;

/** Build a `kind: 'live'` Vehicle for an orphan observation. Returns
 *  null when:
 *  - the polyline has < 2 points (can't project)
 *  - the station doesn't lie on this trip's shape (low projection
 *    confidence → wrong trip for this station)
 *  - the bus has already passed the station on the shape
 *
 *  `headsign` is optional. GTFS-RT doesn't carry it for vehicle
 *  positions, but callers usually have a sibling scheduled trip on
 *  the same (route, direction) to copy from — trips on the same
 *  route+direction share the same destination headsign in every
 *  feed we've seen. */
export function buildOrphanLiveVehicle(
  obs: LiveVehicleObservation,
  route: Route,
  shape: Polyline,
  stationPos: { lat: number; lon: number },
  headsign?: string,
): Vehicle | null {
  if (shape.length < 2) return null;

  const p = predictEta({
    vehiclePos: { lat: obs.lat, lon: obs.lon },
    stopPos: stationPos,
    polyline: shape,
    vehicleSpeedMs: obs.speedMs ?? null,
  });

  // Either point projecting far off the shape means this trip's
  // route doesn't really visit this station — wrong orphan to attach
  // here. predictEta encodes that as confidence: 'low'.
  if (p.confidence === 'low') return null;
  if (p.minutes < PAST_STATION_MIN) return null;

  return {
    kind: 'live',
    id: `live:${obs.tripId}`,
    route,
    type: route.type ?? 'unknown',
    headsign,
    confidence: 'medium',
    position: {
      lat: obs.lat,
      lon: obs.lon,
      source: 'gps',
      asOf: obs.asOfMs > 0 ? obs.asOfMs : Date.now(),
      speedMs: obs.speedMs,
    },
    liveSources: ['gtfs-rt'],
    eta: {
      minutes: Math.round(p.minutes),
      distanceMeters: p.distanceMeters,
      confidence: p.confidence,
    },
  };
}
