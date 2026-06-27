/**
 * Geometry Utilities
 * Pure geometric calculations for arrival time system
 */

import { calculateDistance } from '../location/distanceUtils.ts';
import type { Coordinates } from '../location/distanceUtils.ts';
import type { RouteShape } from '../../types/arrivalTime.ts';
import { CONFIDENCE_THRESHOLDS } from '../core/constants';

/**
 * Core projection calculation - projects a point onto a line segment
 * Returns the projection parameter and closest point
 */
function projectPointToSegmentCore(
  point: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates
): { t: number; closestPoint: Coordinates } {
  // Vector from start to end of segment
  const segmentVector = {
    lat: segmentEnd.lat - segmentStart.lat,
    lon: segmentEnd.lon - segmentStart.lon
  };
  
  // Vector from start to point
  const pointVector = {
    lat: point.lat - segmentStart.lat,
    lon: point.lon - segmentStart.lon
  };
  
  // Calculate projection parameter
  const segmentLengthSquared = segmentVector.lat * segmentVector.lat + segmentVector.lon * segmentVector.lon;
  
  if (segmentLengthSquared === 0) {
    // Segment is a point
    return { t: 0, closestPoint: segmentStart };
  }
  
  const t = Math.max(0, Math.min(1, 
    (pointVector.lat * segmentVector.lat + pointVector.lon * segmentVector.lon) / segmentLengthSquared
  ));
  
  // Find closest point on segment
  const closestPoint = {
    lat: segmentStart.lat + t * segmentVector.lat,
    lon: segmentStart.lon + t * segmentVector.lon
  };
  
  return { t, closestPoint };
}

/**
 * Calculate progress along segment (0 = at start, 1 = at end, <0 = before start, >1 = after end)
 */
export function calculateProgressAlongSegment(
  vehiclePosition: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates
): number {
  // Vector from start to end of segment
  const segmentVector = {
    lat: segmentEnd.lat - segmentStart.lat,
    lon: segmentEnd.lon - segmentStart.lon
  };
  
  // Vector from start to vehicle
  const vehicleVector = {
    lat: vehiclePosition.lat - segmentStart.lat,
    lon: vehiclePosition.lon - segmentStart.lon
  };
  
  // Calculate projection parameter (dot product)
  const segmentLengthSquared = segmentVector.lat * segmentVector.lat + segmentVector.lon * segmentVector.lon;
  
  if (segmentLengthSquared === 0) {
    return 0; // Segment is a point
  }
  
  return (vehicleVector.lat * segmentVector.lat + vehicleVector.lon * segmentVector.lon) / segmentLengthSquared;
}

/**
 * Calculate distance from a point to a line segment
 */
export function distancePointToLineSegment(
  point: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates
): number {
  const { closestPoint } = projectPointToSegmentCore(point, segmentStart, segmentEnd);
  return calculateDistance(point, closestPoint);
}

/**
 * Project a point onto a line segment (for route shape calculations)
 * Returns both the closest point and the position parameter
 */
export function projectPointToSegment(
  point: Coordinates, 
  segmentStart: Coordinates, 
  segmentEnd: Coordinates
): { point: Coordinates; position: number } {
  const { t, closestPoint } = projectPointToSegmentCore(point, segmentStart, segmentEnd);
  return { point: closestPoint, position: t };
}

// ============================================================================
// Route Shape Projection Utilities
// ============================================================================

/**
 * Check if a projection is between two other projections on route shape
 */
export function isProjectionBetween(
  vehicleProjection: { segmentIndex: number; positionAlongSegment: number },
  stopAProjection: { segmentIndex: number; positionAlongSegment: number },
  stopBProjection: { segmentIndex: number; positionAlongSegment: number },
  routeShape: RouteShape
): boolean {
  // Calculate position along entire route for each projection
  const vehicleRoutePosition = calculateRoutePosition(vehicleProjection, routeShape);
  const stopARoutePosition = calculateRoutePosition(stopAProjection, routeShape);
  const stopBRoutePosition = calculateRoutePosition(stopBProjection, routeShape);
  
  const minStopPosition = Math.min(stopARoutePosition, stopBRoutePosition);
  const maxStopPosition = Math.max(stopARoutePosition, stopBRoutePosition);
  
  return vehicleRoutePosition >= minStopPosition && vehicleRoutePosition <= maxStopPosition;
}

/**
 * Calculate position along entire route from segment index and position
 */
export function calculateRoutePosition(
  projection: { segmentIndex: number; positionAlongSegment: number },
  routeShape: RouteShape
): number {
  let totalDistance = 0;
  
  // Add distances from all previous segments
  for (let i = 0; i < projection.segmentIndex; i++) {
    totalDistance += routeShape.segments[i].distance;
  }
  
  // Add partial distance from current segment
  if (projection.segmentIndex < routeShape.segments.length) {
    totalDistance += routeShape.segments[projection.segmentIndex].distance * projection.positionAlongSegment;
  }
  
  return totalDistance;
}

/**
 * Calculate bearing (direction) from one point to another in degrees
 */
export function calculateBearing(start: Coordinates, end: Coordinates): number {
  const lat1 = start.lat * Math.PI / 180;
  const lat2 = end.lat * Math.PI / 180;
  const deltaLon = (end.lon - start.lon) * Math.PI / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360; // Normalize to 0-360 degrees
}

/**
 * Calculate confidence for segment identification
 */
export function calculateSegmentConfidence(
  vehicleProjection: { distanceToShape: number },
  stopAProjection: { distanceToShape: number },
  stopBProjection: { distanceToShape: number }
): number {
  const maxDistance = Math.max(
    vehicleProjection.distanceToShape,
    stopAProjection.distanceToShape,
    stopBProjection.distanceToShape
  );
  
  // Higher confidence when all points are close to route shape
  if (maxDistance < CONFIDENCE_THRESHOLDS.HIGH_DISTANCE) return CONFIDENCE_THRESHOLDS.HIGH_CONFIDENCE;
  if (maxDistance < CONFIDENCE_THRESHOLDS.MEDIUM_DISTANCE) return CONFIDENCE_THRESHOLDS.MEDIUM_CONFIDENCE;
  if (maxDistance < CONFIDENCE_THRESHOLDS.LOW_DISTANCE) return CONFIDENCE_THRESHOLDS.LOW_CONFIDENCE;
  return CONFIDENCE_THRESHOLDS.FALLBACK_CONFIDENCE;
}