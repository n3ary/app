/*
 * Planner network cache -- builds the RAPTOR graph (patterns + footpaths)
 * from the bound feed's SQLite once, then reuses it across planJourney
 * calls. Feed-scoped like shapeCache: `closeCurrent()` in bootstrap.ts
 * calls clearPlannerNetwork() on every feed switch so one feed's patterns
 * can't leak into the next.
 *
 * Built lazily -- only the first planJourney() pays the preprocessing, so
 * routes that never open the planner (Stations, Schedule, Map) don't carry
 * its cost. The heavy lifting (grouping trips into patterns) lives in the
 * pure `domain/raptor.ts`; this module is just the SQLite -> RAPTOR adapter
 * plus the metadata maps the query layer needs to hydrate legs.
 */

import type { Database } from '@sqlite.org/sqlite-wasm';
import { selectAll } from './sqlHelpers';
import { buildFootpaths, buildPatterns, type RaptorNetwork, type TripInput } from '$lib/domain/raptor';
import { vehicleTypeFromGtfs, type VehicleType } from '$lib/domain/types';

export interface RouteMeta {
  shortName: string;
  color: string;
  type: VehicleType;
}
export interface StopMeta {
  name: string;
  lat: number;
  lon: number;
}
export interface LatLon {
  lat: number;
  lon: number;
}
export interface PlannerNetwork {
  net: RaptorNetwork;
  routeMeta: ReadonlyMap<string, RouteMeta>;
  tripHeadsign: ReadonlyMap<string, string | null>;
  /** trip_id -> shape_id, for drawing the real road geometry of a leg. */
  tripShape: ReadonlyMap<string, string>;
  /** shape_id -> ordered polyline (shape_pt_sequence). */
  shapes: ReadonlyMap<string, readonly LatLon[]>;
  stops: ReadonlyMap<string, StopMeta>;
}

const WALK_SPEED_MPS = 1.3;
const TRANSFER_RADIUS_M = 200;

let cache: { db: Database; value: PlannerNetwork } | null = null;

/** GTFS "HH:MM:SS" (may exceed 24h, e.g. "25:13:00") -> seconds since
 *  midnight. Returns NaN for blank/malformed so the caller can drop it. */
function parseSeconds(t: string | null): number {
  if (!t) return NaN;
  const p = t.split(':');
  if (p.length < 2) return NaN;
  return Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2] ?? 0);
}

/** Build (or return cached) RAPTOR network for the given DB handle. Keyed
 *  on the handle itself: a feed switch opens a new Database, so the stale
 *  entry never matches. */
export function getPlannerNetwork(db: Database): PlannerNetwork {
  if (cache && cache.db === db) return cache.value;
  const value = build(db);
  cache = { db, value };
  return value;
}

export function clearPlannerNetwork(): void {
  cache = null;
}

interface TripRow { trip_id: string; route_id: string; service_id: string; trip_headsign: string | null; shape_id: string | null }
interface RouteRow { route_id: string; route_short_name: string | null; route_color: string | null; route_type: number | null }
interface StopRow { stop_id: string; stop_name: string | null; stop_lat: number; stop_lon: number }
interface StopTimeRow { trip_id: string; stop_id: string; arrival_time: string | null; departure_time: string | null }
interface ShapeRow { shape_id: string; shape_pt_lat: number; shape_pt_lon: number }

function build(db: Database): PlannerNetwork {
  const routeMeta = new Map<string, RouteMeta>();
  for (const r of selectAll<RouteRow>(db, `SELECT route_id, route_short_name, route_color, route_type FROM routes;`)) {
    routeMeta.set(r.route_id, {
      shortName: r.route_short_name ?? '?',
      color: r.route_color ? `#${r.route_color}` : '#666666',
      type: vehicleTypeFromGtfs(r.route_type),
    });
  }

  const tripRoute = new Map<string, string>();
  const tripService = new Map<string, string>();
  const tripHeadsign = new Map<string, string | null>();
  const tripShape = new Map<string, string>();
  for (const t of selectAll<TripRow>(db, `SELECT trip_id, route_id, service_id, trip_headsign, shape_id FROM trips;`)) {
    tripRoute.set(t.trip_id, t.route_id);
    tripService.set(t.trip_id, t.service_id);
    tripHeadsign.set(t.trip_id, t.trip_headsign);
    if (t.shape_id) tripShape.set(t.trip_id, t.shape_id);
  }

  const shapes = new Map<string, LatLon[]>();
  for (const s of selectAll<ShapeRow>(
    db,
    `SELECT shape_id, shape_pt_lat, shape_pt_lon FROM shapes ORDER BY shape_id, shape_pt_sequence;`,
  )) {
    const pts = shapes.get(s.shape_id);
    const p = { lat: s.shape_pt_lat, lon: s.shape_pt_lon };
    if (pts) pts.push(p);
    else shapes.set(s.shape_id, [p]);
  }

  const stops = new Map<string, StopMeta>();
  const stopPoints: Array<{ id: string; lat: number; lon: number }> = [];
  for (const s of selectAll<StopRow>(
    db,
    `SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL;`,
  )) {
    stops.set(s.stop_id, { name: s.stop_name ?? s.stop_id, lat: s.stop_lat, lon: s.stop_lon });
    stopPoints.push({ id: s.stop_id, lat: s.stop_lat, lon: s.stop_lon });
  }

  // Group stop_times (ordered by trip + sequence) into per-trip inputs.
  const byTrip = new Map<string, TripInput>();
  for (const st of selectAll<StopTimeRow>(
    db,
    `SELECT trip_id, stop_id, arrival_time, departure_time FROM stop_times ORDER BY trip_id, stop_sequence;`,
  )) {
    const routeId = tripRoute.get(st.trip_id);
    const serviceId = tripService.get(st.trip_id);
    if (routeId === undefined || serviceId === undefined) continue;
    let trip = byTrip.get(st.trip_id);
    if (!trip) {
      trip = { tripId: st.trip_id, serviceId, routeId, stops: [] };
      byTrip.set(st.trip_id, trip);
    }
    const arr = parseSeconds(st.arrival_time);
    const dep = parseSeconds(st.departure_time);
    trip.stops.push({
      stopId: st.stop_id,
      arr: Number.isFinite(arr) ? arr : dep,
      dep: Number.isFinite(dep) ? dep : arr,
    });
  }

  const { patterns, routesAtStop } = buildPatterns([...byTrip.values()]);
  const footpaths = buildFootpaths(stopPoints, { radiusM: TRANSFER_RADIUS_M, walkSpeedMps: WALK_SPEED_MPS });
  return { net: { patterns, routesAtStop, footpaths }, routeMeta, tripHeadsign, tripShape, shapes, stops };
}
