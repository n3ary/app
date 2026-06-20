/**
 * Start station prediction suppression for GTFS schedule integration.
 *
 * Pure functions (no I/O, no store access) implementing the suppression logic
 * from the design document (Correctness Property 9: Start station prediction
 * suppression). A vehicle waiting at the start station of its trip before its
 * scheduled departure should be shown as stationary, so position prediction is
 * suppressed for it.
 *
 * Suppression is strictly additive: when schedule data is unavailable for the
 * trip (or any condition is not met) the function returns `false`, leaving
 * existing GPS-based position prediction behavior unchanged.
 */

import { calculateDistance, type Coordinates } from '../location/distanceUtils';
import { ARRIVAL_CONFIG } from '../core/constants';
import type { SchedulePayload } from '../../types/schedule';
import type {
  TranzyStopResponse,
  TranzyStopTimeResponse,
} from '../../types/rawTranzyApi';
import type { EnhancedVehicleData } from '../vehicle/vehicleEnhancementUtils';

/**
 * Proximity threshold (meters) for considering a vehicle "at" the start station.
 *
 * Reuses the existing "at stop" proximity threshold (`ARRIVAL_CONFIG.PROXIMITY_THRESHOLD`)
 * so that start-station detection is consistent with the rest of the app's
 * notion of a vehicle being at a stop.
 */
export const START_STATION_PROXIMITY_THRESHOLD_METERS =
  ARRIVAL_CONFIG.PROXIMITY_THRESHOLD;

/**
 * Build a stop_id -> coordinates lookup for fast repeated coordinate access.
 */
function buildStopCoordinateMap(
  stops: TranzyStopResponse[],
): Map<number, Coordinates> {
  const map = new Map<number, Coordinates>();
  for (const stop of stops) {
    map.set(stop.stop_id, { lat: stop.stop_lat, lon: stop.stop_lon });
  }
  return map;
}

/**
 * Find the stop in the trip's sequence physically nearest to the vehicle.
 *
 * Returns the nearest stop's `stop_sequence`, or `null` when no stop in the
 * trip has resolvable, valid coordinates. This is used to derive the vehicle's
 * current stop_sequence (Property 9 condition (a)) from its GPS position.
 */
function findNearestStopSequence(
  vehicleCoords: Coordinates,
  tripSequence: TranzyStopTimeResponse[],
  stopCoordinates: Map<number, Coordinates>,
): number | null {
  let nearestSequence: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const stopTime of tripSequence) {
    const coords = stopCoordinates.get(stopTime.stop_id);
    if (!coords) continue;

    let distance: number;
    try {
      distance = calculateDistance(vehicleCoords, coords);
    } catch {
      // Invalid coordinates for this stop — skip it.
      continue;
    }

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSequence = stopTime.stop_sequence;
    }
  }

  return nearestSequence;
}

/**
 * Determine whether position prediction should be suppressed for a vehicle that
 * is waiting at the start station of its trip before its scheduled departure.
 *
 * Suppression activates if and only if ALL of the following hold (Property 9):
 *  (d) schedule data exists for the vehicle's trip;
 *  (a) the vehicle's stop_sequence (nearest stop in the trip) equals the first
 *      stop in the trip;
 *  (b) the vehicle is within the proximity threshold of the first stop's
 *      coordinates;
 *  (c) the current time is before the scheduled departure from that stop.
 *
 * When any condition is not met (including missing/invalid inputs), the function
 * returns `false` so that normal position prediction applies.
 *
 * @param vehicle The enhanced vehicle (carries trip_id and current GPS position)
 * @param scheduleData The schedule payload (clock times keyed by trip_id)
 * @param tripStopTimes Tranzy stop-sequence rows for the vehicle's trip
 * @param stops Station data providing stop coordinates
 * @param currentMinutes Current time as minutes since midnight
 * @returns `true` to suppress position prediction, otherwise `false`
 */
export function shouldSuppressPrediction(
  vehicle: EnhancedVehicleData,
  scheduleData: SchedulePayload,
  tripStopTimes: TranzyStopTimeResponse[],
  stops: TranzyStopResponse[],
  currentMinutes: number,
): boolean {
  const tripId = vehicle.trip_id;
  if (!tripId) return false;

  // (d) Schedule data must exist for this trip.
  const scheduleStopTimes = scheduleData?.stopTimes?.[tripId];
  if (!scheduleStopTimes || scheduleStopTimes.length === 0) return false;

  // Identify the first stop in the trip from the Tranzy stop sequence.
  const tripSequence = tripStopTimes.filter((st) => st.trip_id === tripId);
  if (tripSequence.length === 0) return false;

  const firstStop = tripSequence.reduce((earliest, st) =>
    st.stop_sequence < earliest.stop_sequence ? st : earliest,
  );

  // Resolve the first stop's coordinates.
  const stopCoordinates = buildStopCoordinateMap(stops);
  const firstStopCoords = stopCoordinates.get(firstStop.stop_id);
  if (!firstStopCoords) return false;

  const vehicleCoords: Coordinates = {
    lat: vehicle.latitude,
    lon: vehicle.longitude,
  };

  // (b) Vehicle must be within the proximity threshold of the first stop.
  let distanceToFirstStop: number;
  try {
    distanceToFirstStop = calculateDistance(vehicleCoords, firstStopCoords);
  } catch {
    // Invalid vehicle/stop coordinates — fall back to normal prediction.
    return false;
  }
  if (distanceToFirstStop > START_STATION_PROXIMITY_THRESHOLD_METERS) {
    return false;
  }

  // (a) The vehicle's stop_sequence (nearest stop in the trip) must be the
  // first stop in the trip.
  const nearestSequence = findNearestStopSequence(
    vehicleCoords,
    tripSequence,
    stopCoordinates,
  );
  if (nearestSequence === null || nearestSequence !== firstStop.stop_sequence) {
    return false;
  }

  // (c) Current time must be before the scheduled departure from the first stop.
  // Match the schedule entry by stop_id; fall back to the lowest-sequence entry.
  const firstScheduleStop =
    scheduleStopTimes.find((st) => st.s === firstStop.stop_id) ??
    scheduleStopTimes.reduce((earliest, st) =>
      st.q < earliest.q ? st : earliest,
    );
  if (currentMinutes >= firstScheduleStop.d) return false;

  return true;
}
