// Vehicle Mapping Utilities
// Consolidated trip-to-route mapping logic to eliminate duplication

import type { TranzyVehicleResponse } from '../../types/rawTranzyApi';

/**
 * Create a mapping from trip_id to route_id using vehicle data
 * Consolidates duplicate logic from routeStationMapping and tripValidationUtils
 * 
 * @param vehicles - Array of vehicle responses from API
 * @returns Map of trip_id to route_id for valid vehicles
 */
export function createTripToRouteMap(vehicles: TranzyVehicleResponse[]): Map<string, number> {
  const tripRouteMap = new Map<string, number>();
  
  // Handle edge case: empty or invalid vehicles array
  if (!Array.isArray(vehicles)) {
    return tripRouteMap;
  }
  
  for (const vehicle of vehicles) {
    // Skip vehicles with missing or invalid data
    if (!vehicle || 
        vehicle.trip_id === null || 
        vehicle.trip_id === undefined || 
        vehicle.trip_id.trim() === '' ||
        vehicle.route_id === null || 
        vehicle.route_id === undefined) {
      continue;
    }
    
    // Map trip_id to route_id
    tripRouteMap.set(vehicle.trip_id, vehicle.route_id);
  }
  
  return tripRouteMap;
}

/**
 * Get route IDs for specific trip IDs using vehicle data
 * Optimized for cases where you only need routes for a subset of trips
 * 
 * @param tripIds - Array of trip IDs to look up
 * @param vehicles - Array of vehicle responses from API
 * @returns Set of route IDs (as strings) for the given trip IDs
 */
export function getRouteIdsForTrips(tripIds: string[], vehicles: TranzyVehicleResponse[]): Set<string> {
  const routeIds = new Set<string>();
  
  // Handle edge cases
  if (!Array.isArray(tripIds) || !Array.isArray(vehicles)) {
    return routeIds;
  }
  
  for (const vehicle of vehicles) {
    if (vehicle && vehicle.trip_id && vehicle.route_id !== null) {
      if (tripIds.includes(vehicle.trip_id)) {
        routeIds.add(vehicle.route_id.toString());
      }
    }
  }
  
  return routeIds;
}