/**
 * Route Shape Service
 * Manages fetching and caching of route shapes for arrival time calculations
 * Uses proper store architecture with caching
 */

import type { RouteShape } from '../types/arrivalTime.ts';
import type { TranzyTripResponse } from '../types/rawTranzyApi.ts';

/**
 * Fetch route shapes for multiple trips efficiently
 * Uses store architecture with caching
 */
export async function fetchRouteShapesForTrips(trips: TranzyTripResponse[]): Promise<Map<string, RouteShape>> {
  const routeShapes = new Map<string, RouteShape>();
  
  // Get unique shape IDs to minimize processing
  const uniqueShapeIds = [...new Set(trips.map(trip => trip.shape_id).filter(Boolean))];
  
  if (uniqueShapeIds.length === 0) {
    return routeShapes;
  }

  try {
    // Load shapes through store (respects caching)
    const { useShapeStore } = await import('../stores/shapeStore');
    await useShapeStore.getState().loadShapes();
    
    // Get cached shapes from store
    const allShapes = useShapeStore.getState().shapes;
    
    // Create RouteShape objects for requested shape IDs from cached data
    uniqueShapeIds.forEach(shapeId => {
      const routeShape = allShapes.get(shapeId);
      if (routeShape) {
        routeShapes.set(shapeId, routeShape);
      }
    });

  } catch (error) {
    console.warn('Failed to fetch shapes from store:', error);
  }

  return routeShapes;
}

/**
 * Fetch route shapes for vehicles based on their current trips
 * Filters to only active vehicles with trip assignments
 */
export async function fetchRouteShapesForVehicles(
  vehicles: any[], 
  trips: TranzyTripResponse[]
): Promise<Map<string, RouteShape>> {
  // Get trips for active vehicles only
  const activeVehicleTrips = vehicles
    .filter(vehicle => vehicle.trip_id)
    .map(vehicle => trips.find(trip => trip.trip_id === vehicle.trip_id))
    .filter(Boolean) as TranzyTripResponse[];

  return fetchRouteShapesForTrips(activeVehicleTrips);
}