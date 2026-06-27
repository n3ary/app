import { getGtfsRepo } from './repo';
import type { ScheduleTripStop } from './types';

/** Returns all stops after `currentStopId` for the given trip, in order.
 *  Slicing is done here so no filtering logic leaks into UI components. */
export async function getUpcomingStops(
  tripId: string,
  currentStopId: number,
): Promise<ScheduleTripStop[]> {
  const repo = getGtfsRepo();
  const all = await repo.getStopsAlongTrip(tripId);
  const idx = all.findIndex((s) => s.stopId === currentStopId);
  return idx >= 0 ? all.slice(idx + 1) : all;
}
