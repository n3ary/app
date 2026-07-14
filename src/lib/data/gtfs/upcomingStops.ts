import { getGtfsRepo } from './repo';
import type { ScheduleTripStop } from './types';

/** Returns all stops after `currentStopId` for the given trip, in order.
 *  Slicing is done here so no filtering logic leaks into UI components.
 *  Used by both the per-vehicle expanded-stops list and the headsign
 *  marker badge surface - both slice from this station forward, so
 *  one helper covers both callers.
 *
 *  Uses `shape_dist_traveled` (when available) to determine physical
 *  travel direction. `stop_sequence` is the fallback, but it does not
 *  guarantee monotonic physical order for loop routes or out-of-order
 *  GTFS feeds — a stop listed before the current station in sequence may
 *  still be physically after it if the route doubles back. */
export async function getUpcomingStops(
  tripId: string,
  currentStopId: string,
): Promise<ScheduleTripStop[]> {
  const repo = getGtfsRepo();
  const all = await repo.getStopsAlongTrip(tripId);

  const current = all.find((s) => s.stopId === currentStopId);
  if (!current) return []; // current stop not in this trip — caller error, fail safe

  // shape_dist_traveled is the canonical physical order. When available,
  // use it to filter stops that are genuinely after the current station
  // in distance-travelled order (handles loop routes and out-of-sequence
  // stop_times entries correctly).
  if (current.distAlongM != null) {
    return all.filter((s) => s.distAlongM != null && s.distAlongM > current.distAlongM!);
  }

  // Fallback: find the current stop's index in stop_sequence order and
  // return everything after it. Works for linear routes where stop_sequence
  // matches physical order, but may include physically-prior stops for
  // loop routes.
  const idx = all.findIndex((s) => s.stopId === currentStopId);
  return idx >= 0 ? all.slice(idx + 1) : [];
}
