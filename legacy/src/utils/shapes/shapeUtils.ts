/**
 * Shape Utilities
 * Convert raw API shape data to RouteShape format for distance calculations
 */

import { calculateDistance } from '../location/distanceUtils.ts';
import type { TranzyShapeResponse } from '../../types/rawTranzyApi.ts';
import type { RouteShape, ShapeSegment, Coordinates } from '../../types/arrivalTime.ts';

/**
 * Convert raw shape points from API to RouteShape format
 */
export function convertToRouteShape(shapePoints: TranzyShapeResponse[]): RouteShape {
  if (shapePoints.length === 0) {
    throw new Error('Cannot create RouteShape from empty shape points');
  }

  // Sort by sequence to ensure correct order
  const sortedPoints = [...shapePoints].sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
  
  // Convert to coordinate points
  const points: Coordinates[] = sortedPoints.map(point => ({
    lat: point.shape_pt_lat,
    lon: point.shape_pt_lon
  }));

  // Create segments between consecutive points
  const segments: ShapeSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const distance = calculateDistance(start, end);
    
    segments.push({
      start,
      end,
      distance
    });
  }

  return {
    id: sortedPoints[0].shape_id,
    points,
    segments
  };
}

/**
 * Cache for route shapes to avoid repeated API calls
 */
const shapeCache = new Map<string, RouteShape>();

/**
 * Get cached route shape or create new one
 */
export function getCachedRouteShape(shapeId: string, shapePoints: TranzyShapeResponse[]): RouteShape {
  if (shapeCache.has(shapeId)) {
    return shapeCache.get(shapeId)!;
  }

  const routeShape = convertToRouteShape(shapePoints);
  shapeCache.set(shapeId, routeShape);
  return routeShape;
}

/**
 * Clear shape cache (useful for testing or memory management)
 */
export function clearShapeCache(): void {
  shapeCache.clear();
}