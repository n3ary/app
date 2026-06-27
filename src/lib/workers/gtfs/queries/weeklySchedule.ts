/*
 * Recurring weekly departure pattern for a (route, direction).
 * Origin departure times grouped by which day-of-week pattern the
 * trip's `service_id` matches (weekday / saturday / sunday).
 *
 * Intentionally ignores `calendar_dates` exceptions — the weekly
 * table is a recurring-pattern view, not a what-runs-on-a-specific-
 * day view.
 */

import type { Database } from '@sqlite.org/sqlite-wasm';
import type { WeeklySchedule } from '$lib/data/gtfs/types';
import { timeToMinutes } from '$lib/domain/pipeline/timeUtils';
import { selectAll } from '../sqlHelpers';

export function getWeeklySchedule(
  db: Database,
  routeId: string,
  directionId: 0 | 1,
): WeeklySchedule {
  type Row = {
    departure_time: string;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
  };
  const rows = selectAll<Row>(
    db,
    `SELECT
       (SELECT departure_time FROM stop_times
          WHERE trip_id = t.trip_id
          ORDER BY stop_sequence ASC LIMIT 1) AS departure_time,
       c.monday, c.tuesday, c.wednesday, c.thursday, c.friday,
       c.saturday, c.sunday
     FROM trips t
     JOIN calendar c ON c.service_id = t.service_id
     WHERE t.route_id = ? AND t.direction_id = ?;`,
    [routeId, directionId],
  );

  const weekday = new Set<number>();
  const saturday = new Set<number>();
  const sunday = new Set<number>();
  for (const r of rows) {
    if (!r.departure_time) continue;
    const m = timeToMinutes(r.departure_time);
    if (!Number.isFinite(m)) continue;
    if (r.monday || r.tuesday || r.wednesday || r.thursday || r.friday) {
      weekday.add(m);
    }
    if (r.saturday) saturday.add(m);
    if (r.sunday) sunday.add(m);
  }
  const sorted = (s: Set<number>) => Array.from(s).sort((a, b) => a - b);
  return {
    weekday: sorted(weekday),
    saturday: sorted(saturday),
    sunday: sorted(sunday),
  };
}
