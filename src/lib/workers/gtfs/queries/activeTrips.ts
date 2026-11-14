/*
 * getActiveTrips — every trip currently in transit feed-wide, no
 * per-stop join. Drives the worker's reconciliation pipeline: each
 * live poll calls this, hands the result + the live observations to
 * `reconcileWithLive`, and broadcasts the resulting Vehicle[].
 *
 * Returned Vehicles are all `kind: 'scheduled'`. Schedule fields are
 * origin-relative (`scheduledDeparture = tripStartMin`,
 * `scheduledArrival = tripEndMin`). Consumers that need per-stop
 * ETA recompute it locally.
 */

import type { Database } from '@sqlite.org/sqlite-wasm';
import type { Route, Vehicle } from '$lib/domain/types';
import { MISSING_ROUTE_COLOR, vehicleTypeFromGtfs } from '$lib/domain/types';
import { timeToMinutes } from '$lib/domain/pipeline/timeUtils';
import { serviceContextFor, serviceWindowsFor } from '$lib/domain/pipeline/serviceDay';
import { activeServicesOn } from '../activeServices';
import { selectAll } from '../sqlHelpers';
import { getRoutesWithSchedule } from './routesWithSchedule';

export function getActiveTrips(
  db: Database,
  tz: string,
  nowMs: number,
  lookbackMin: number,
  lookaheadMin: number,
): Vehicle[] {
  // A GTFS service day is not a calendar day - during the post-midnight
  // window yesterday's service day is still running its night-service
  // tail, so it is queried too and its times are shifted a day back
  // onto the shared timeline. See domain/pipeline/serviceDay.ts.
  const ctx = serviceContextFor(nowMs, tz);
  const nowMin = ctx.nowMin;

  const lower = nowMin - lookbackMin;
  const upper = nowMin + lookaheadMin;
  const withSchedule = getRoutesWithSchedule(db);
  const out: Vehicle[] = [];

  for (const win of serviceWindowsFor(ctx)) {
    const services = activeServicesOn(db, win.date);
    if (services.length === 0) continue;
    const placeholders = services.map(() => '?').join(',');
    type TripRow = {
      trip_id: string;
      trip_headsign: string | null;
      direction_id: number | null;
      trip_start_time: string;
      trip_end_time: string;
      route_id: string;
      route_short_name: string;
      route_color: string | null;
      route_text_color: string | null;
      route_type: number | null;
    };
    // Trip-level scan (no stop_times join in the select list): one
    // row per active trip with origin/end-stop times via the same
    // correlated subqueries getRouteMapView uses. Cheap thanks to
    // stop_times_trip_seq_idx.
    const rows = selectAll<TripRow>(
      db,
      `SELECT t.trip_id, t.trip_headsign, t.direction_id,
              (SELECT departure_time FROM stop_times WHERE trip_id = t.trip_id
               ORDER BY stop_sequence ASC LIMIT 1) AS trip_start_time,
              (SELECT arrival_time FROM stop_times WHERE trip_id = t.trip_id
               ORDER BY stop_sequence DESC LIMIT 1) AS trip_end_time,
              r.route_id, r.route_short_name, r.route_color, r.route_text_color, r.route_type
       FROM trips t
       JOIN routes r ON r.route_id = t.route_id
       WHERE t.service_id IN (${placeholders});`,
      services,
    );

    for (const r of rows) {
      const tripStartMin = timeToMinutes(r.trip_start_time) + win.offsetMin;
      const tripEndMin = timeToMinutes(r.trip_end_time) + win.offsetMin;
      if (tripStartMin < lower || tripStartMin > upper) continue;
      if (tripEndMin < nowMin) continue;
      const dir: 0 | 1 | -1 =
        r.direction_id === 0 || r.direction_id === 1 ? r.direction_id : -1;
      const route: Route = {
        id: String(r.route_id),
        shortName: r.route_short_name,
        color: r.route_color ? `#${r.route_color}` : MISSING_ROUTE_COLOR,
        textColor: r.route_text_color ? `#${r.route_text_color}` : undefined,
        type: vehicleTypeFromGtfs(r.route_type),
        hasSchedule: withSchedule.has(String(r.route_id)),
      };
      out.push({
        kind: 'scheduled',
        id: `trip:${r.trip_id}`,
        route,
        type: route.type ?? 'unknown',
        tripId: r.trip_id,
        directionId: dir,
        headsign: r.trip_headsign ?? undefined,
        confidence: 'low',
        schedule: {
          tripId: r.trip_id,
          scheduledDeparture: tripStartMin,
          scheduledArrival: tripEndMin,
          tripStartMin,
          headsign: r.trip_headsign ?? undefined,
          directionId: dir,
        },
      });
    }
  }
  return out;
}
