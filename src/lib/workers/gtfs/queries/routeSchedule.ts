/*
 * Per-route schedule view — trips on a (route, direction) whose
 * service is active for the given `localDate` and whose origin
 * departure falls in the requested window. Caller controls the
 * window (rest-of-today, tomorrow until noon, night-route past
 * midnight) so this stays a pure window query.
 */

import type { Database } from '@sqlite.org/sqlite-wasm';
import type { ScheduleTrip } from '$lib/data/gtfs/types';
import { timeToMinutes } from '$lib/domain/pipeline/timeUtils';
import { serviceContextFor, serviceWindowsFor } from '$lib/domain/pipeline/serviceDay';
import { activeServicesOn } from '../activeServices';
import { selectAll } from '../sqlHelpers';

export function getRouteSchedule(
  db: Database,
  routeId: string,
  directionId: 0 | 1,
  localDate: string,
  fromMin: number,
  windowMinutes: number,
  /**
   * The PREVIOUS service day, when it is still running its late-night
   * tail (i.e. between local midnight and the rollover hour). Its trip
   * times are shifted by `offsetMin` so they land on the same timeline
   * as `fromMin`. See domain/pipeline/serviceDay.ts.
   */
  previousServiceDay?: { date: string; offsetMin: number } | null,
): ScheduleTrip[] {
  const windows = [
    { date: localDate, offsetMin: 0 },
    ...(previousServiceDay ? [previousServiceDay] : []),
  ];
  const out: ScheduleTrip[] = [];

  for (const win of windows) {
    const services = activeServicesOn(db, win.date);
    if (services.length === 0) continue;

    const placeholders = services.map(() => '?').join(',');
    type Row = {
      trip_id: string;
      trip_headsign: string | null;
      service_id: string;
      trip_start_time: string;
      trip_end_time: string;
    };
    const rows = selectAll<Row>(
      db,
      `SELECT t.trip_id, t.trip_headsign, t.service_id,
              (SELECT departure_time FROM stop_times WHERE trip_id = t.trip_id
               ORDER BY stop_sequence ASC LIMIT 1) AS trip_start_time,
              (SELECT arrival_time   FROM stop_times WHERE trip_id = t.trip_id
               ORDER BY stop_sequence DESC LIMIT 1) AS trip_end_time
       FROM trips t
       WHERE t.route_id = ?
         AND t.direction_id = ?
         AND t.service_id IN (${placeholders});`,
      [routeId, directionId, ...services],
    );

    const upper = fromMin + windowMinutes;
    for (const r of rows) {
      const tripStartMin = timeToMinutes(r.trip_start_time) + win.offsetMin;
      if (tripStartMin < fromMin || tripStartMin > upper) continue;
      out.push({
        tripId: r.trip_id,
        tripStartMin,
        tripEndMin: timeToMinutes(r.trip_end_time) + win.offsetMin,
        headsign: r.trip_headsign,
        serviceId: r.service_id,
      });
    }
  }
  return out.sort((a, b) => a.tripStartMin - b.tripStartMin);
}

/** Distinct route_ids that have at least one trip departing in the
 *  given window on the given local date. Used by the /favorites
 *  Routes tab to rank "routes running right now" to the top of the
 *  picker without an N+1 schedule call per route.
 *
 *  Window semantics match getRouteSchedule: trips whose trip_start
 *  (the first stop_time departure_time) falls in
 *  [nowMin, nowMin + windowMin]. Both directions collapse into a
 *  single route_id set so the caller can rank without caring about
 *  direction. */
export function getActiveRouteIdsInWindow(
  db: Database,
  nowMs: number,
  tz: string,
  windowMinutes: number,
): string[] {
  // A GTFS service day is not a calendar day - during the post-midnight
  // window yesterday's service day is still running its night-service
  // tail, so it is queried too and its times are shifted a day back
  // onto the shared timeline. See domain/pipeline/serviceDay.ts.
  const ctx = serviceContextFor(nowMs, tz);
  const nowMin = ctx.nowMin;
  const out: string[] = [];

  for (const win of serviceWindowsFor(ctx)) {
    const services = activeServicesOn(db, win.date);
    if (services.length === 0) continue;

    const placeholders = services.map(() => '?').join(',');
    // Reuses the same trip_start_time projection as getRouteSchedule
    // (first stop_time's departure_time, "HH:MM:SS" minutes since
    // midnight). SUBSTR parses the string in SQL since timeToMinutes
    // is a JS helper unavailable inside the query.
    type Row = { route_id: string; trip_start_min: number };
    const rows = selectAll<Row>(
      db,
      `SELECT t.route_id,
              CAST(SUBSTR((SELECT departure_time FROM stop_times WHERE trip_id = t.trip_id
                           ORDER BY stop_sequence ASC LIMIT 1), 1, 2) AS INTEGER) * 60
            + CAST(SUBSTR((SELECT departure_time FROM stop_times WHERE trip_id = t.trip_id
                           ORDER BY stop_sequence ASC LIMIT 1), 4, 2) AS INTEGER)
              AS trip_start_min
       FROM trips t
       WHERE t.service_id IN (${placeholders})
         AND EXISTS (
           SELECT 1 FROM stop_times st
           WHERE st.trip_id = t.trip_id
             AND st.arrival_time IS NOT NULL
             AND st.arrival_time != ''
         );`,
      [...services],
    );

    const upper = nowMin + windowMinutes;
    for (const r of rows) {
      const tripStartMin = r.trip_start_min + win.offsetMin;
      if (tripStartMin < nowMin || tripStartMin > upper) continue;
      out.push(r.route_id);
    }
  }
  return Array.from(new Set(out));
}
