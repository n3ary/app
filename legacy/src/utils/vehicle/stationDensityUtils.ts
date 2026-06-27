/**
 * Station Density Utilities
 * Simple functions for calculating station density centers (replaces StationDensityCalculator class)
 */

import { calculateDistance, type Coordinates } from '../location/distanceUtils';
import type { TranzyStopResponse } from '../../types/rawTranzyApi';

// ============================================================================
// Coordinate Validation
// ============================================================================

/**
 * Validate that coordinates are within valid ranges
 */
function isValidCoordinate(coords: Coordinates): boolean {
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lon === 'number' &&
    !isNaN(coords.lat) &&
    !isNaN(coords.lon) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lon >= -180 &&
    coords.lon <= 180
  );
}

// ============================================================================
// Station Density Functions
// ============================================================================

/**
 * Calculate the geographic center of all stations - replaces StationDensityCalculator class
 */
export function calculateStationDensityCenter(stops: TranzyStopResponse[]): Coordinates {
  if (stops.length === 0) {
    throw new Error('Cannot calculate density center with no stops');
  }

  // Filter out stops with invalid coordinates
  const validStops = stops.filter(stop => 
    isValidCoordinate({ lat: stop.stop_lat, lon: stop.stop_lon })
  );

  if (validStops.length === 0) {
    throw new Error('No stops with valid coordinates found');
  }

  // Simple centroid calculation
  const totalLat = validStops.reduce((sum, stop) => sum + stop.stop_lat, 0);
  const totalLon = validStops.reduce((sum, stop) => sum + stop.stop_lon, 0);

  return {
    lat: totalLat / validStops.length,
    lon: totalLon / validStops.length
  };
}

/**
 * Calculate average distance from center (for metadata/debugging)
 */
export function calculateAverageDistanceFromCenter(
  stops: TranzyStopResponse[], 
  center: Coordinates
): number {
  if (stops.length === 0 || !isValidCoordinate(center)) return 0;

  const validStops = stops.filter(stop => 
    isValidCoordinate({ lat: stop.stop_lat, lon: stop.stop_lon })
  );

  if (validStops.length === 0) return 0;

  let totalDistance = 0;
  let validDistances = 0;

  for (const stop of validStops) {
    try {
      const distance = calculateDistance(center, { lat: stop.stop_lat, lon: stop.stop_lon });
      totalDistance += distance;
      validDistances++;
    } catch (error) {
      // Skip stops with invalid coordinates
      continue;
    }
  }

  return validDistances > 0 ? totalDistance / validDistances : 0;
}

/**
 * Find stations within a radius of a point
 */
export function findStationsWithinRadius(
  stops: TranzyStopResponse[],
  center: Coordinates,
  radiusMeters: number
): TranzyStopResponse[] {
  if (!isValidCoordinate(center) || radiusMeters < 0) {
    return [];
  }

  return stops.filter(stop => {
    const stopCoords = { lat: stop.stop_lat, lon: stop.stop_lon };
    
    if (!isValidCoordinate(stopCoords)) {
      return false;
    }

    try {
      const distance = calculateDistance(center, stopCoords);
      return distance <= radiusMeters;
    } catch (error) {
      return false;
    }
  });
}