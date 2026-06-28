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
import { activeServicesOn } from '../activeServices';
import { selectAll } from '../sqlHelpers';

export function getRouteSchedule(
  db: Database,
  routeId: string,
  directionId: 0 | 1,
  localDate: string,
  fromMin: number,
  windowMinutes: number,
): ScheduleTrip[] {
  const services = activeServicesOn(db, localDate);
  if (services.length === 0) return [];

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
  return rows
    .map((r) => ({
      tripId: r.trip_id,
      tripStartMin: timeToMinutes(r.trip_start_time),
      tripEndMin: timeToMinutes(r.trip_end_time),
      headsign: r.trip_headsign,
      serviceId: r.service_id,
    }))
    .filter((r) => r.tripStartMin >= fromMin && r.tripStartMin <= upper)
    .sort((a, b) => a.tripStartMin - b.tripStartMin);
}
