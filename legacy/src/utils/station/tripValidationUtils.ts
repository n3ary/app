/**
 * Trip Validation Utilities
 * Functions to validate station trip data using stop times
 */

import type { TranzyStopTimeResponse, TranzyStopResponse, TranzyVehicleResponse } from '../../types/rawTranzyApi';
import { getRouteIdsForTrips } from '../vehicle/vehicleMappingUtils';

/**
 * Check if a station has active trips using stop times data
 * @param station - The station to check
 * @param stopTimes - Array of stop times from trip store
 * @returns boolean indicating if station has active trips
 */
export function hasActiveTrips(
  station: TranzyStopResponse,
  stopTimes: TranzyStopTimeResponse[]
): boolean {
  // Handle edge cases
  if (!station || !station.stop_id || !Array.isArray(stopTimes) || stopTimes.length === 0) {
    return false;
  }

  // Find stop times for this station
  const stationStopTimes = stopTimes.filter(
    stopTime => stopTime && stopTime.stop_id === station.stop_id
  );
  
  // Station has active trips if it has stop times with valid trip_id
  return stationStopTimes.some(stopTime => 
    stopTime && stopTime.trip_id && stopTime.trip_id.trim().length > 0
  );
}



/**
 * Validate multiple stations for trip availability
 * @param stations - Array of stations to validate
 * @param stopTimes - Array of stop times from trip store
 * @returns Array of stations with their trip validation status
 */
export function validateStationsForTrips(
  stations: TranzyStopResponse[],
  stopTimes: TranzyStopTimeResponse[]
): Array<{ station: TranzyStopResponse; hasTrips: boolean }> {
  return stations.map(station => ({
    station,
    hasTrips: hasActiveTrips(station, stopTimes)
  }));
}

/**
 * Get stations that have active trips
 * @param stations - Array of stations to filter
 * @param stopTimes - Array of stop times from trip store
 * @returns Array of stations that have active trips
 */
export function getStationsWithTrips(
  stations: TranzyStopResponse[],
  stopTimes: TranzyStopTimeResponse[]
): TranzyStopResponse[] {
  const validatedStations = validateStationsForTrips(stations, stopTimes);
  
  return validatedStations
    .filter(item => item.hasTrips)
    .map(item => item.station);
}

/**
 * Get route IDs for trips serving a specific station
 * @param station - The station to check
 * @param stopTimes - Array of stop times from trip store
 * @param vehicles - Array of vehicles to get route mapping from trip_id
 * @returns Array of unique route IDs serving this station
 */
export function getStationRouteIds(
  station: TranzyStopResponse,
  stopTimes: TranzyStopTimeResponse[],
  vehicles: TranzyVehicleResponse[]
): string[] {
  // Handle edge cases
  if (!station || !station.stop_id || !Array.isArray(stopTimes) || !Array.isArray(vehicles)) {
    return [];
  }

  // Get all trip IDs for this station
  const stationTripIds = stopTimes
    .filter(stopTime => 
      stopTime && 
      stopTime.stop_id === station.stop_id && 
      stopTime.trip_id && 
      stopTime.trip_id.trim().length > 0
    )
    .map(stopTime => stopTime.trip_id);

  // Use consolidated utility to get route IDs for these trips
  const routeIds = getRouteIdsForTrips(stationTripIds, vehicles);

  return Array.from(routeIds);
}