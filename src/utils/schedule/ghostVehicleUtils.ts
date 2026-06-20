/**
 * Ghost vehicle detection for GTFS schedule data.
 *
 * A "ghost vehicle" is a trip that, according to the schedule, should currently
 * be running (its scheduled start is in the past and its scheduled end has not
 * yet passed) but has no GPS-visible vehicle assigned to it. These candidates
 * let the app surface scheduled service that the real-time feed is missing.
 *
 * This is a pure function (no I/O, no store access) following the semantics of
 * the design document (Correctness Property 7: Ghost vehicle lifecycle).
 *
 * ## Route ID derivation
 *
 * `GhostVehicleCandidate.routeId` cannot be derived from `SchedulePayload`
 * alone: the payload's `tripServiceMap` maps `trip_id → service_id`, not
 * `trip_id → route_id`. Per the design, the `trip_id → route_id` mapping lives
 * in the existing `tripStore` (`TranzyTripResponse.route_id`). To keep this
 * function pure and decoupled from stores, the caller may pass an optional
 * `tripRouteMap` lookup (wired from `tripStore` at the integration layer, see
 * task 8.1). When a trip's route is not present in the map, `routeId` defaults
 * to `0` (unknown route sentinel).
 */

import type {
  SchedulePayload,
  ScheduleStopTime,
  GhostVehicleCandidate,
} from '../../types/schedule';

/** Sentinel route id used when a trip's route is not available in the lookup. */
const UNKNOWN_ROUTE_ID = 0;

/**
 * Find the first (earliest stop_sequence) and last (latest stop_sequence) stop
 * times for a trip without mutating the input array.
 *
 * @returns The first and last stop times, or `null` if the list is empty.
 */
function getTripBounds(
  stopTimes: ScheduleStopTime[],
): { first: ScheduleStopTime; last: ScheduleStopTime } | null {
  if (stopTimes.length === 0) return null;

  let first = stopTimes[0];
  let last = stopTimes[0];
  for (const stopTime of stopTimes) {
    if (stopTime.q < first.q) first = stopTime;
    if (stopTime.q > last.q) last = stopTime;
  }
  return { first, last };
}

/** Clamp a value to the inclusive range [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Identify ghost vehicle candidates among the active trips.
 *
 * A trip is a ghost candidate when ALL of the following hold:
 * 1. Its scheduled start (first stop's departure) is in the past
 *    (`scheduledStartMinutes < currentMinutes`).
 * 2. Its scheduled end (last stop's arrival) has NOT passed
 *    (`currentMinutes <= scheduledEndMinutes`).
 * 3. No GPS-visible vehicle is assigned to the trip
 *    (`!gpsVehicleTripIds.has(tripId)`).
 *
 * The estimated progress along the route is the fraction of elapsed time
 * relative to the total scheduled trip duration, bounded to [0, 1]. When the
 * total duration is zero (degenerate single-point trip), progress is `1` once
 * any time has elapsed (the trip is effectively complete).
 *
 * Once the scheduled end time passes, the trip no longer satisfies condition 2
 * and is therefore excluded — implementing the "candidate removed after end"
 * part of the lifecycle.
 *
 * @param activeTrips Trip IDs active today (from active-service resolution).
 * @param gpsVehicleTripIds Trip IDs that currently have a GPS-visible vehicle.
 * @param scheduleData The schedule payload providing stop times per trip.
 * @param currentMinutes Current time as minutes since midnight.
 * @param tripRouteMap Optional `trip_id → route_id` lookup (from `tripStore`).
 *   When omitted or missing a trip, `routeId` defaults to {@link UNKNOWN_ROUTE_ID}.
 * @returns Ghost vehicle candidates with bounded estimated progress.
 */
export function identifyGhostTrips(
  activeTrips: string[],
  gpsVehicleTripIds: Set<string>,
  scheduleData: SchedulePayload,
  currentMinutes: number,
  tripRouteMap: Record<string, number> = {},
): GhostVehicleCandidate[] {
  const candidates: GhostVehicleCandidate[] = [];

  for (const tripId of activeTrips) {
    // A trip with a live GPS vehicle is never a ghost.
    if (gpsVehicleTripIds.has(tripId)) continue;

    const stopTimes = scheduleData.stopTimes[tripId];
    if (!stopTimes || stopTimes.length === 0) continue;

    const bounds = getTripBounds(stopTimes);
    if (!bounds) continue;

    const scheduledStartMinutes = bounds.first.d;
    const scheduledEndMinutes = bounds.last.a;

    // Condition 1: scheduled start is in the past.
    if (scheduledStartMinutes >= currentMinutes) continue;
    // Condition 2: scheduled end has not passed.
    if (currentMinutes > scheduledEndMinutes) continue;

    const elapsedMinutes = currentMinutes - scheduledStartMinutes;
    const totalTripDurationMinutes = scheduledEndMinutes - scheduledStartMinutes;
    const estimatedProgress =
      totalTripDurationMinutes > 0
        ? clamp01(elapsedMinutes / totalTripDurationMinutes)
        : 1;

    candidates.push({
      tripId,
      routeId: tripRouteMap[tripId] ?? UNKNOWN_ROUTE_ID,
      scheduledStartMinutes,
      elapsedMinutes,
      estimatedProgress,
    });
  }

  return candidates;
}
