// Route-to-Station Mapping Utilities
// Creates efficient mappings between stations and routes using stop_times and vehicle data
// Handles edge cases like missing data and provides fast lookup functions

import type { TranzyStopTimeResponse, TranzyVehicleResponse } from '../../types/rawTranzyApi';
import { API_CACHE_DURATION } from '../core/constants';
import { createTripToRouteMap } from '../vehicle/vehicleMappingUtils';

/**
 * Mapping of stop_id to array of route_ids serving that station
 */
export interface StationRouteMap {
  [stop_id: number]: number[];
}

/**
 * Mapping of trip_id to route_id derived from vehicle data
 */
export interface TripRouteMap {
  [trip_id: string]: number;
}

/**
 * Create a mapping from trip_id to route_id using vehicle data
 * @deprecated Use createTripToRouteMap from vehicleMappingUtils instead
 * @param vehicles - Array of vehicle responses from API
 * @returns Mapping of trip_id to route_id
 */
export function createTripRouteMapping(vehicles: TranzyVehicleResponse[]): TripRouteMap {
  const tripRouteMapFromUtil = createTripToRouteMap(vehicles);
  const tripRouteMap: TripRouteMap = {};
  
  // Convert Map to object for backward compatibility
  for (const [tripId, routeId] of tripRouteMapFromUtil) {
    tripRouteMap[tripId] = routeId;
  }
  
  return tripRouteMap;
}

/**
 * Create a mapping from stop_id to route_ids using stop_times and trip-route mapping
 * 
 * @param stopTimes - Array of stop time responses from API
 * @param tripRouteMap - Mapping of trip_id to route_id (from createTripRouteMapping)
 * @returns Mapping of stop_id to array of route_ids
 */
export function createStationRouteMapping(
  stopTimes: TranzyStopTimeResponse[], 
  tripRouteMap: TripRouteMap
): StationRouteMap {
  const stationRouteMap: StationRouteMap = {};
  
  // Handle edge case: empty or invalid stop times array
  if (!Array.isArray(stopTimes)) {
    return stationRouteMap;
  }
  
  for (const stopTime of stopTimes) {
    // Skip invalid stop times
    if (!stopTime || 
        stopTime.stop_id === null || 
        stopTime.stop_id === undefined ||
        !stopTime.trip_id || 
        stopTime.trip_id.trim() === '') {
      continue;
    }
    
    // Get route_id for this trip_id
    const route_id = tripRouteMap[stopTime.trip_id];
    
    // Skip if we don't have route information for this trip
    if (route_id === null || route_id === undefined) {
      continue;
    }
    
    // Initialize array for this station if it doesn't exist
    if (!stationRouteMap[stopTime.stop_id]) {
      stationRouteMap[stopTime.stop_id] = [];
    }
    
    // Add route_id if it's not already in the array (avoid duplicates)
    if (!stationRouteMap[stopTime.stop_id].includes(route_id)) {
      stationRouteMap[stopTime.stop_id].push(route_id);
    }
  }
  
  return stationRouteMap;
}

/**
 * Get route_ids for a specific station
 * 
 * @param stop_id - The station ID to look up
 * @param stationRouteMap - The station-to-routes mapping
 * @returns Array of route_ids serving this station, empty array if none found
 */
export function getRouteIdsForStation(
  stop_id: number, 
  stationRouteMap: StationRouteMap
): number[] {
  // Handle edge cases
  if (stop_id === null || stop_id === undefined || !stationRouteMap) {
    return [];
  }
  
  return stationRouteMap[stop_id] || [];
}

/**
 * Create complete route-to-station mapping from raw API data
 * Combines trip-route mapping and station-route mapping in one function
 * 
 * @param stopTimes - Array of stop time responses from API
 * @param vehicles - Array of vehicle responses from API
 * @returns Complete station-to-routes mapping
 */
export function createCompleteStationRouteMapping(
  stopTimes: TranzyStopTimeResponse[],
  vehicles: TranzyVehicleResponse[]
): StationRouteMap {
  // Handle edge cases
  if (!Array.isArray(stopTimes) || !Array.isArray(vehicles)) {
    return {};
  }
  
  // Step 1: Create trip-to-route mapping from vehicle data
  const tripRouteMap = createTripRouteMapping(vehicles);
  
  // Step 2: Create station-to-routes mapping using stop times and trip-route mapping
  const stationRouteMap = createStationRouteMapping(stopTimes, tripRouteMap);
  
  return stationRouteMap;
}

/**
 * Check if a station has any routes serving it
 * 
 * @param stop_id - The station ID to check
 * @param stationRouteMap - The station-to-routes mapping
 * @returns True if station has routes, false otherwise
 */
export function hasRoutesForStation(
  stop_id: number, 
  stationRouteMap: StationRouteMap
): boolean {
  const routeIds = getRouteIdsForStation(stop_id, stationRouteMap);
  return routeIds.length > 0;
}

// Performance optimization: Global cache for route-to-station mapping
interface CacheEntry {
  mapping: StationRouteMap;
  timestamp: number;
  dataHash: string;
}

let globalMappingCache: CacheEntry | null = null;

/**
 * Create a simple hash of the input data for cache invalidation
 * 
 * @param stopTimes - Stop times data
 * @param vehicles - Vehicle data
 * @returns Simple hash string
 */
function createDataHash(stopTimes: TranzyStopTimeResponse[], vehicles: TranzyVehicleResponse[]): string {
  // Simple hash based on data lengths and first/last items
  const stopTimesHash = stopTimes.length > 0 ? 
    `${stopTimes.length}-${stopTimes[0]?.trip_id}-${stopTimes[stopTimes.length - 1]?.trip_id}` : 
    '0';
  const vehiclesHash = vehicles.length > 0 ? 
    `${vehicles.length}-${vehicles[0]?.id}-${vehicles[vehicles.length - 1]?.id}` : 
    '0';
  return `${stopTimesHash}:${vehiclesHash}`;
}

/**
 * Check if cached mapping is still valid
 * 
 * @param stopTimes - Current stop times data
 * @param vehicles - Current vehicle data
 * @returns True if cache is valid, false otherwise
 */
function isCacheValid(stopTimes: TranzyStopTimeResponse[], vehicles: TranzyVehicleResponse[]): boolean {
  if (!globalMappingCache) return false;
  
  const now = Date.now();
  const isNotExpired = (now - globalMappingCache.timestamp) < API_CACHE_DURATION.STATIC_DATA;
  const currentHash = createDataHash(stopTimes, vehicles);
  const isSameData = globalMappingCache.dataHash === currentHash;
  
  return isNotExpired && isSameData;
}

/**
 * Get cached route-to-station mapping or create new one if cache is invalid
 * This function provides efficient caching to avoid repeated expensive calculations
 * 
 * @param stopTimes - Array of stop time responses from API
 * @param vehicles - Array of vehicle responses from API
 * @returns Cached or newly created station-to-routes mapping
 */
export function getCachedStationRouteMapping(
  stopTimes: TranzyStopTimeResponse[],
  vehicles: TranzyVehicleResponse[]
): StationRouteMap {
  // Return cached mapping if valid
  if (isCacheValid(stopTimes, vehicles)) {
    return globalMappingCache!.mapping;
  }
  
  // Create new mapping and cache it
  const mapping = createCompleteStationRouteMapping(stopTimes, vehicles);
  const dataHash = createDataHash(stopTimes, vehicles);
  
  globalMappingCache = {
    mapping,
    timestamp: Date.now(),
    dataHash
  };
  
  return mapping;
}

/**
 * Clear the global mapping cache
 * Useful when you want to force a fresh calculation
 */
export function clearMappingCache(): void {
  globalMappingCache = null;
}

