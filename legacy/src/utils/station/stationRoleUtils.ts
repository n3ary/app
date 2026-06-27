/**
 * Station Role Utilities
 * 
 * Utilities for calculating and managing station roles (Start, End, Turnaround, Standard)
 * for transit routes based on trip data and stop sequences.
 * 
 * @module stationRoleUtils
 */

import type { TranzyTripResponse, TranzyStopTimeResponse } from '../../types/rawTranzyApi';

/**
 * Station role classification for a route
 * - 'start': Station where trips originate (first stop in sequence)
 * - 'end': Station where trips terminate (last stop in sequence)
 * - 'turnaround': Station that serves as both start and end for different trips
 * - 'standard': Regular intermediate stop (neither start nor end)
 */
export type StationRole = 'start' | 'end' | 'turnaround' | 'standard';

/**
 * Station roles identified for a single trip
 * Contains the start and end stations for a specific trip
 */
export interface TripStationRoles {
  /** Unique identifier for the trip */
  tripId: string;
  /** Route ID this trip belongs to */
  routeId: number;
  /** Station ID where this trip starts (stop_sequence = 0) */
  startStation: number;
  /** Station ID where this trip ends (highest stop_sequence) */
  endStation: number;
}

/**
 * Aggregated station roles for an entire route
 * Maps each station to its role classification for the route
 */
export interface RouteStationRoles {
  /** Route ID these roles apply to */
  routeId: number;
  /** Map of station ID to its role classification */
  stations: Map<number, StationRole>;
}

/**
 * Calculate station roles for a single trip
 * 
 * Identifies the start station (stop_sequence = 0) and end station (highest stop_sequence)
 * for a given trip based on its stop_times data.
 * 
 * @param trip - Trip data from Tranzy API
 * @param stopTimes - All stop_times data (will be filtered by trip_id)
 * @returns TripStationRoles object with start and end stations identified
 * 
 * @example
 * const trip = { trip_id: 'T1', route_id: 35, ... };
 * const stopTimes = [
 *   { trip_id: 'T1', stop_id: 100, stop_sequence: 0 },
 *   { trip_id: 'T1', stop_id: 101, stop_sequence: 1 },
 *   { trip_id: 'T1', stop_id: 102, stop_sequence: 2 }
 * ];
 * const roles = calculateRolesForTrip(trip, stopTimes);
 * // roles.startStation === 100
 * // roles.endStation === 102
 */
export function calculateRolesForTrip(
  trip: TranzyTripResponse,
  stopTimes: TranzyStopTimeResponse[]
): TripStationRoles {
  // Filter stop_times for this specific trip
  const tripStopTimes = stopTimes.filter(st => st.trip_id === trip.trip_id);
  
  // Sort by stop_sequence to ensure correct ordering
  const sortedStops = [...tripStopTimes].sort((a, b) => a.stop_sequence - b.stop_sequence);
  
  // First stop (sequence = 0) is the start station
  const startStation = sortedStops[0]?.stop_id ?? 0;
  
  // Last stop (highest sequence) is the end station
  const endStation = sortedStops[sortedStops.length - 1]?.stop_id ?? 0;
  
  return {
    tripId: trip.trip_id,
    routeId: trip.route_id,
    startStation,
    endStation
  };
}

/**
 * Aggregate trip-level roles to route-level classifications
 * 
 * Analyzes all trips for a route and determines each station's role:
 * - Turnaround: Appears as both start and end in different trips
 * - Start: Appears only as start station
 * - End: Appears only as end station
 * - Standard: Appears in trips but never as start or end
 * 
 * @param tripRoles - Array of TripStationRoles from calculateRolesForTrip()
 * @returns RouteStationRoles with aggregated classifications
 * 
 * @example
 * const tripRoles = [
 *   { tripId: 'T1', routeId: 35, startStation: 100, endStation: 102 },
 *   { tripId: 'T2', routeId: 35, startStation: 102, endStation: 100 }
 * ];
 * const routeRoles = aggregateRolesToRoute(tripRoles);
 * // routeRoles.stations.get(100) === 'turnaround' (both start and end)
 * // routeRoles.stations.get(102) === 'turnaround' (both start and end)
 */
export function aggregateRolesToRoute(
  tripRoles: TripStationRoles[]
): RouteStationRoles {
  if (tripRoles.length === 0) {
    return {
      routeId: 0,
      stations: new Map()
    };
  }
  
  // All trips should have the same routeId
  const routeId = tripRoles[0].routeId;
  
  // Track which stations appear as start and/or end
  const startStations = new Set<number>();
  const endStations = new Set<number>();
  
  // Collect all stations that appear as start or end
  for (const tripRole of tripRoles) {
    startStations.add(tripRole.startStation);
    endStations.add(tripRole.endStation);
  }
  
  // Build the role map
  const stations = new Map<number, StationRole>();
  
  // Get all unique stations
  const allStations = new Set([...startStations, ...endStations]);
  
  for (const stationId of allStations) {
    const isStart = startStations.has(stationId);
    const isEnd = endStations.has(stationId);
    
    if (isStart && isEnd) {
      // Appears as both start and end -> turnaround
      stations.set(stationId, 'turnaround');
    } else if (isStart) {
      // Only appears as start
      stations.set(stationId, 'start');
    } else if (isEnd) {
      // Only appears as end
      stations.set(stationId, 'end');
    } else {
      // Neither start nor end -> standard
      stations.set(stationId, 'standard');
    }
  }
  
  return {
    routeId,
    stations
  };
}

/**
 * Check if a station is the end station for a specific trip
 * 
 * Determines whether the given station has the highest stop_sequence
 * in the trip's stop_times, indicating it's where the trip terminates.
 * 
 * @param stationId - Station ID to check
 * @param tripId - Trip ID to check against
 * @param stopTimes - All stop_times data (will be filtered by trip_id)
 * @returns true if station is the end station for this trip, false otherwise
 * 
 * @example
 * const stopTimes = [
 *   { trip_id: 'T1', stop_id: 100, stop_sequence: 0 },
 *   { trip_id: 'T1', stop_id: 101, stop_sequence: 1 },
 *   { trip_id: 'T1', stop_id: 102, stop_sequence: 2 }
 * ];
 * isStationEndForTrip(102, 'T1', stopTimes); // true
 * isStationEndForTrip(101, 'T1', stopTimes); // false
 */
export function isStationEndForTrip(
  stationId: number,
  tripId: string,
  stopTimes: TranzyStopTimeResponse[]
): boolean {
  // Filter stop_times for this specific trip
  const tripStopTimes = stopTimes.filter(st => st.trip_id === tripId);
  
  if (tripStopTimes.length === 0) {
    return false;
  }
  
  // Find the stop with the highest stop_sequence
  const lastStop = tripStopTimes.reduce((max, current) => 
    current.stop_sequence > max.stop_sequence ? current : max
  );
  
  // Check if the given station is the last stop
  return lastStop.stop_id === stationId;
}

/**
 * Check if station-level "Drop off only" indicator should be shown
 * 
 * Determines whether all vehicles serving a station are drop-off only
 * (i.e., the station is the end station for all vehicle trips).
 * Returns false if vehicles array is empty or if any vehicle allows boarding.
 * 
 * Requirements: 4.1, 4.5
 * 
 * @param vehicles - Array of vehicles serving the station
 * @param stationId - Station ID to check
 * @param stopTimes - All stop_times data
 * @returns true if all vehicles are drop-off only, false otherwise
 * 
 * @example
 * const vehicles = [
 *   { vehicle: { trip_id: 'T1' }, route: {...}, trip: {...} },
 *   { vehicle: { trip_id: 'T2' }, route: {...}, trip: {...} }
 * ];
 * const stopTimes = [...];
 * shouldShowStationDropOffIndicator(vehicles, 100, stopTimes); // true if all trips end at station 100
 */
export function shouldShowStationDropOffIndicator(
  vehicles: Array<{ vehicle: { trip_id?: string }; route: any; trip: any }>,
  stationId: number,
  stopTimes: TranzyStopTimeResponse[]
): boolean {
  // Return false if vehicles array is empty (Requirement 4.5)
  if (vehicles.length === 0) {
    return false;
  }
  
  // Check if all vehicles have station as end station
  // Return false if any vehicle allows boarding (Requirement 4.1)
  return vehicles.every(({ vehicle }) => {
    // Skip vehicles without trip_id
    if (!vehicle.trip_id) {
      return false; // Vehicle without trip_id allows boarding (not drop-off only)
    }
    
    // Check if this vehicle's trip ends at the station
    return isStationEndForTrip(stationId, vehicle.trip_id, stopTimes);
  });
}
