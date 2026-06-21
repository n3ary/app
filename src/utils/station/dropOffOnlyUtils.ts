/**
 * Drop-off-only detection at a station.
 *
 * A vehicle is "drop-off only" at a station when that station is the LAST stop
 * of its trip — passengers can't board there because the bus terminates. These
 * rows are the lowest-value entries in a station's vehicle list (you can't
 * catch this bus from here), so the UI demotes them to the bottom.
 *
 * The same detection has to handle two kinds of vehicles:
 *
 *  - LIVE GPS vehicles, whose trip stop sequence lives in the Tranzy
 *    `stop_times` store (`isStationEndForTrip`).
 *  - SCHEDULED / GHOST synthesized vehicles, whose trip is in the GTFS schedule
 *    payload but NOT in the partial Tranzy `stop_times` set. Their last stop
 *    is the highest-`q` entry in `scheduleData.stopTimes[trip_id]`.
 *
 * The card-level `isDropOffOnly` IIFE used to inline both branches; this util
 * captures the same rule once so the sort, the grouping, and the chip share a
 * single source of truth.
 */

import { isStationEndForTrip } from './stationRoleUtils';
import type { TranzyStopTimeResponse } from '../../types/rawTranzyApi';
import type { SchedulePayload } from '../../types/schedule';
import type { StationVehicle } from '../../types/stationFilter';

/** Whether `vehicle` terminates at `stationId` (no onward stops to board for). */
export function isVehicleDropOffOnlyAtStation(
  vehicle: StationVehicle,
  stationId: number | null | undefined,
  stopTimes: TranzyStopTimeResponse[],
  scheduleData: SchedulePayload | null,
): boolean {
  const tripId = vehicle.vehicle.trip_id;
  if (stationId == null || !tripId) return false;

  // Synthesized scheduled / ghost vehicle: look at the GTFS payload directly
  // since their trip isn't in the partial Tranzy `stop_times` set.
  if (vehicle.vehicle.isScheduled) {
    const sts = scheduleData?.stopTimes?.[tripId];
    if (!sts || sts.length === 0) return false;
    const last = sts.reduce((a, b) => (b.q > a.q ? b : a));
    return last.s === stationId;
  }

  // Live GPS vehicle: defer to the existing trip-end detector.
  return isStationEndForTrip(stationId, tripId, stopTimes);
}

/**
 * Build the set of vehicle ids that are drop-off-only at the given station.
 * Same rule as {@link isVehicleDropOffOnlyAtStation}, vectorised so the sort
 * and grouping passes can do an O(1) membership check per vehicle.
 */
export function buildDropOffOnlyVehicleIdSet(
  vehicles: StationVehicle[],
  stationId: number | null | undefined,
  stopTimes: TranzyStopTimeResponse[],
  scheduleData: SchedulePayload | null,
): Set<number> {
  const ids = new Set<number>();
  for (const v of vehicles) {
    if (isVehicleDropOffOnlyAtStation(v, stationId, stopTimes, scheduleData)) {
      ids.add(v.vehicle.id);
    }
  }
  return ids;
}
