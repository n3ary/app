/**
 * Map Viewport Utilities
 * Functions for managing map viewport (center, zoom, bounds)
 * Used by map controls to adjust view based on mode
 */

import type { Coordinates } from '../../utils/location/distanceUtils';
import type { RouteShape } from '../../types/arrivalTime';
import type { TranzyStopResponse } from '../../types/rawTranzyApi';
import { MAP_DEFAULTS } from './mapConstants';

// ============================================================================
// Bounds Calculation
// ============================================================================

export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Calculate bounds that encompass all given coordinates
 */
export function calculateBounds(coordinates: Coordinates[]): ViewportBounds | null {
  if (coordinates.length === 0) return null;

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const coord of coordinates) {
    north = Math.max(north, coord.lat);
    south = Math.min(south, coord.lat);
    east = Math.max(east, coord.lon);
    west = Math.min(west, coord.lon);
  }

  return { north, south, east, west };
}

/**
 * Add padding to bounds (percentage of bounds size)
 */
export function addBoundsPadding(bounds: ViewportBounds, paddingPercent: number = 0.1): ViewportBounds {
  const latPadding = (bounds.north - bounds.south) * paddingPercent;
  const lonPadding = (bounds.east - bounds.west) * paddingPercent;

  return {
    north: bounds.north + latPadding,
    south: bounds.south - latPadding,
    east: bounds.east + lonPadding,
    west: bounds.west - lonPadding,
  };
}

/**
 * Calculate zoom level for bounds to fit in container
 */
export function calculateZoomForBounds(
  bounds: ViewportBounds,
  containerWidth: number,
  containerHeight: number
): number {
  const latDiff = bounds.north - bounds.south;
  const lonDiff = bounds.east - bounds.west;
  
  // More accurate zoom calculation using Web Mercator projection
  const latZoom = Math.log2(containerHeight * 360 / (latDiff * 256));
  const lonZoom = Math.log2(containerWidth * 360 / (lonDiff * 256));
  
  // Take the more restrictive zoom and add some buffer
  let zoom = Math.min(latZoom, lonZoom) - 0.5; // Less aggressive zoom out
  
  // Clamp to valid zoom range with better bounds
  return Math.max(MAP_DEFAULTS.MIN_ZOOM + 1, Math.min(MAP_DEFAULTS.MAX_ZOOM - 2, Math.floor(zoom)));
}

// ============================================================================
// Route Overview Viewport
// ============================================================================

/**
 * Calculate viewport to show entire route with minimal wasted space
 */
export function calculateRouteOverviewViewport(
  routeShapes: Map<string, RouteShape>,
  stations: TranzyStopResponse[],
  containerWidth: number = 800,
  containerHeight: number = 600
): { center: Coordinates; zoom: number; bounds: ViewportBounds } | null {
  const allCoordinates: Coordinates[] = [];

  // Add all route shape points (these are usually more accurate for the actual route)
  for (const shape of routeShapes.values()) {
    allCoordinates.push(...shape.points);
  }

  // Only add station coordinates if we don't have route shapes, or add key stations only
  if (routeShapes.size === 0) {
    // No route shapes, use all stations
    for (const station of stations) {
      if (station.stop_lat && station.stop_lon) {
        allCoordinates.push({ lat: station.stop_lat, lon: station.stop_lon });
      }
    }
  } else {
    // We have route shapes, only add terminus stations for better bounds
    if (stations.length > 0) {
      const firstStation = stations[0];
      const lastStation = stations[stations.length - 1];
      
      if (firstStation.stop_lat && firstStation.stop_lon) {
        allCoordinates.push({ lat: firstStation.stop_lat, lon: firstStation.stop_lon });
      }
      if (lastStation.stop_lat && lastStation.stop_lon && stations.length > 1) {
        allCoordinates.push({ lat: lastStation.stop_lat, lon: lastStation.stop_lon });
      }
    }
  }

  if (allCoordinates.length === 0) return null;

  // Calculate bounds with minimal padding (2% instead of 5%)
  const rawBounds = calculateBounds(allCoordinates);
  if (!rawBounds) return null;

  const bounds = addBoundsPadding(rawBounds, 0.02); // Reduced from 0.05 to 0.02

  // Calculate center
  const center: Coordinates = {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  };

  // Calculate appropriate zoom
  const zoom = calculateZoomForBounds(bounds, containerWidth, containerHeight);

  return { center, zoom, bounds };
}

/**
 * Calculate viewport to include target station, vehicle, and next vehicle station
 * Used for comprehensive view when clicking station or vehicle buttons
 */
export function calculateComprehensiveViewport(
  targetStation: TranzyStopResponse,
  vehiclePosition: Coordinates,
  nextVehicleStation: TranzyStopResponse | null,
  containerWidth: number = 800,
  containerHeight: number = 600
): { center: Coordinates; zoom: number; bounds: ViewportBounds } | null {
  const coordinates: Coordinates[] = [
    { lat: targetStation.stop_lat, lon: targetStation.stop_lon },
    vehiclePosition
  ];

  // Add next vehicle station if available and different from target station
  if (nextVehicleStation && nextVehicleStation.stop_id !== targetStation.stop_id) {
    coordinates.push({ lat: nextVehicleStation.stop_lat, lon: nextVehicleStation.stop_lon });
  }

  if (coordinates.length === 0) return null;

  // Calculate bounds with padding
  const rawBounds = calculateBounds(coordinates);
  if (!rawBounds) return null;

  const bounds = addBoundsPadding(rawBounds, 0.1); // 10% padding for better visibility

  // Calculate center
  const center: Coordinates = {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  };

  // Calculate appropriate zoom
  const zoom = calculateZoomForBounds(bounds, containerWidth, containerHeight);

  return { center, zoom, bounds };
}

// ============================================================================
// Vehicle Tracking Viewport
// ============================================================================

/**
 * Calculate viewport to center on a vehicle
 */
export function calculateVehicleTrackingViewport(
  vehiclePosition: Coordinates,
  currentZoom: number = 15
): { center: Coordinates; zoom: number } {
  return { 
    center: vehiclePosition, 
    zoom: currentZoom 
  };
}

/**
 * Calculate viewport to include target station, vehicle, and next vehicle station
 * Used for vehicle tracking with comprehensive context
 */
export function calculateVehicleComprehensiveViewport(
  vehiclePosition: Coordinates,
  targetStation: TranzyStopResponse | null,
  nextVehicleStation: TranzyStopResponse | null,
  containerWidth: number = 800,
  containerHeight: number = 600
): { center: Coordinates; zoom: number; bounds: ViewportBounds } | null {
  const coordinates: Coordinates[] = [vehiclePosition];

  // Add target station if available
  if (targetStation) {
    coordinates.push({ lat: targetStation.stop_lat, lon: targetStation.stop_lon });
  }

  // Add next vehicle station if available and different from target station
  if (nextVehicleStation && (!targetStation || nextVehicleStation.stop_id !== targetStation.stop_id)) {
    coordinates.push({ lat: nextVehicleStation.stop_lat, lon: nextVehicleStation.stop_lon });
  }

  if (coordinates.length === 1) {
    // Only vehicle position, use simple centering
    return { 
      center: vehiclePosition, 
      zoom: 15,
      bounds: {
        north: vehiclePosition.lat + 0.01,
        south: vehiclePosition.lat - 0.01,
        east: vehiclePosition.lon + 0.01,
        west: vehiclePosition.lon - 0.01
      }
    };
  }

  // Calculate bounds with padding
  const rawBounds = calculateBounds(coordinates);
  if (!rawBounds) return null;

  const bounds = addBoundsPadding(rawBounds, 0.1); // 10% padding for better visibility

  // Calculate center
  const center: Coordinates = {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  };

  // Calculate appropriate zoom
  const zoom = calculateZoomForBounds(bounds, containerWidth, containerHeight);

  return { center, zoom, bounds };
}