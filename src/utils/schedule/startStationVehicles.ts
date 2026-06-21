/**
 * Start-station scheduled & ghost vehicle model (Requirement 12).
 *
 * Pure function (no I/O, no store access) that, for a station which is the
 * START station of one or more routes, produces the synthetic vehicle entries
 * to display alongside real GPS vehicles:
 *
 *   - phase 'scheduled': the next not-yet-departed trip for a route from this
 *     station → rendered as a blue "Scheduled in X" bubble (no movement yet).
 *   - phase 'ghost': a trip whose scheduled departure has passed (and end not
 *     passed) with NO GPS vehicle → rendered as a moving vehicle (predicted
 *     position/ETA) that stays flagged as scheduled/ghost.
 *
 * Trips that already have a GPS-visible vehicle are excluded here (the existing
 * real-vehicle flow renders those). When schedule data is unavailable the caller
 * simply doesn't call this (graceful degradation, Requirement 12.7).
 *
 * Note: this models the current service day. "Next service day" lookup (when no
 * departures remain today) is a higher-level concern handled by the caller
 * supplying tomorrow's active trips; it is intentionally out of scope here.
 */

import type { SchedulePayload, ScheduleStopTime } from '../../types/schedule';

/** Sentinel route id when a trip's route is not in the lookup. */
const UNKNOWN_ROUTE_ID = 0;

export type ScheduledVehiclePhase = 'scheduled' | 'ghost';

/** A synthetic schedule-derived vehicle entry for a start station. */
export interface StartStationVehicle {
  routeId: number;
  tripId: string;
  phase: ScheduledVehiclePhase;
  /** First-stop departure (minutes since midnight). */
  scheduledDepartureMinutes: number;
  /** Last-stop arrival (minutes since midnight). */
  scheduledEndMinutes: number;
  /**
   * Minutes from now to the scheduled departure. Positive while waiting
   * ('scheduled'); zero or negative once departed ('ghost').
   */
  minutesUntil: number;
  /** Ghost progress along the route in [0,1]; 0 for not-yet-departed entries. */
  estimatedProgress: number;
}

export interface StartStationVehiclesParams {
  /** The station being viewed. */
  stationId: number;
  /**
   * Active trip ids for today (caller scopes to routes serving the station and
   * filters by `isTripActiveToday`). Only trips whose FIRST stop is `stationId`
   * are considered (direction-aware: this is where the trip originates).
   */
  activeTrips: string[];
  /** Schedule payload (expanded form with stopTimes keyed by trip_id). */
  scheduleData: SchedulePayload;
  /** Trip ids that currently have a GPS-visible vehicle (excluded). */
  gpsVehicleTripIds: Set<string>;
  /** trip_id → route_id (from tripStore). Missing → {@link UNKNOWN_ROUTE_ID}. */
  tripRouteMap: Record<string, number>;
  /** Current time as minutes since midnight. */
  currentMinutes: number;
}

/** First (lowest stop_sequence) and last (highest) stop times for a trip. */
function bounds(stopTimes: ScheduleStopTime[]): { first: ScheduleStopTime; last: ScheduleStopTime } {
  let first = stopTimes[0];
  let last = stopTimes[0];
  for (const st of stopTimes) {
    if (st.q < first.q) first = st;
    if (st.q > last.q) last = st;
  }
  return { first, last };
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Compute scheduled (next upcoming) and ghost (departed, no GPS) entries for a
 * station that is the start of one or more routes.
 *
 * @returns One 'scheduled' entry per route (its single next departure) plus one
 *   'ghost' entry per qualifying in-progress trip. Trips with a GPS vehicle, or
 *   that do not start at this station, are excluded.
 */
export function getStartStationVehicles(
  params: StartStationVehiclesParams,
): StartStationVehicle[] {
  const { stationId, activeTrips, scheduleData, gpsVehicleTripIds, tripRouteMap, currentMinutes } =
    params;

  const ghosts: StartStationVehicle[] = [];
  // Per route, track the nearest upcoming departure (the single "scheduled" entry).
  const nextByRoute = new Map<number, StartStationVehicle>();

  for (const tripId of activeTrips) {
    const stopTimes = scheduleData.stopTimes[tripId];
    if (!stopTimes || stopTimes.length === 0) continue;

    const { first, last } = bounds(stopTimes);
    // Only trips that ORIGINATE at this station (direction-aware).
    if (first.s !== stationId) continue;

    // A trip with a live GPS vehicle is rendered by the existing real flow.
    if (gpsVehicleTripIds.has(tripId)) continue;

    const start = first.d;
    const end = last.a;
    const routeId = tripRouteMap[tripId] ?? UNKNOWN_ROUTE_ID;

    if (currentMinutes < start) {
      // Upcoming → candidate for this route's single "scheduled" entry.
      const existing = nextByRoute.get(routeId);
      if (!existing || start < existing.scheduledDepartureMinutes) {
        nextByRoute.set(routeId, {
          routeId,
          tripId,
          phase: 'scheduled',
          scheduledDepartureMinutes: start,
          scheduledEndMinutes: end,
          minutesUntil: start - currentMinutes,
          estimatedProgress: 0,
        });
      }
    } else if (currentMinutes <= end) {
      // Departed but not finished, no GPS → ghost (moving).
      const duration = end - start;
      ghosts.push({
        routeId,
        tripId,
        phase: 'ghost',
        scheduledDepartureMinutes: start,
        scheduledEndMinutes: end,
        minutesUntil: start - currentMinutes, // <= 0
        estimatedProgress: duration > 0 ? clamp01((currentMinutes - start) / duration) : 1,
      });
    }
    // else: trip already ended → omit (Requirement 12.6).
  }

  return [...ghosts, ...nextByRoute.values()];
}
