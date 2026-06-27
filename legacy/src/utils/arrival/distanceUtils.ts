/**
 * Arrival Distance Utilities
 * Route shape distance calculations for arrival times
 * Reuses existing distanceUtils.calculateDistance to avoid duplication
 */

import { calculateDistance } from '../location/distanceUtils.ts';
import { projectPointToSegment } from './geometryUtils.ts';
import { CONFIDENCE_LEVELS, ARRIVAL_METHODS } from '../core/stringConstants';
import type {
  Coordinates,
  TranzyStopResponse,
  RouteShape,
  DistanceResult,
  ProjectionResult
} from '../../types/arrivalTime.ts';

// Confidence thresholds for projection quality (meters)
const PROJECTION_CONFIDENCE_THRESHOLDS = {
  HIGH_CONFIDENCE_MAX_DISTANCE: 50,   // Both points very close to route shape
  MEDIUM_CONFIDENCE_MAX_DISTANCE: 200 // Points reasonably close to route shape
} as const;

/**
 * Calculate distance along route shape from vehicle to target stop
 */
export function calculateDistanceAlongShape(
  vehiclePosition: Coordinates,
  targetStopPosition: Coordinates,
  routeShape: RouteShape
): DistanceResult {
  // Project vehicle position to route shape
  const vehicleProjection = projectPointToShape(vehiclePosition, routeShape);
  
  // Project target stop to route shape
  const stopProjection = projectPointToShape(targetStopPosition, routeShape);
  
  // Calculate distance along shape between projections
  const distanceAlongShape = calculateDistanceBetweenProjections(
    vehicleProjection,
    stopProjection,
    routeShape
  );
  
  // Total distance includes projection distances
  const totalDistance = 
    vehicleProjection.distanceToShape + 
    distanceAlongShape + 
    stopProjection.distanceToShape;

  return {
    totalDistance,
    method: 'route_shape',
    confidence: determineConfidence(vehicleProjection, stopProjection)
  };
}

/**
 * Calculate distance via intermediate stops (fallback method)
 * Reuses existing calculateDistance function
 */
export function calculateDistanceViaStops(
  vehiclePosition: Coordinates,
  targetStopPosition: Coordinates,
  intermediateStops: Coordinates[]
): DistanceResult {
  let totalDistance = 0;
  let currentPosition = vehiclePosition;

  // Add distances to each intermediate stop
  for (const stopPosition of intermediateStops) {
    totalDistance += calculateDistance(currentPosition, stopPosition);
    currentPosition = stopPosition;
  }

  // Add final distance to target stop
  totalDistance += calculateDistance(currentPosition, targetStopPosition);

  return {
    totalDistance,
    method: ARRIVAL_METHODS.STOP_SEGMENTS,
    confidence: CONFIDENCE_LEVELS.MEDIUM // stop_segments method is inherently medium confidence
  };
}

/**
 * Project a GPS point to the closest point on route shape
 */
export function projectPointToShape(point: Coordinates, shape: RouteShape): ProjectionResult {
  let closestPoint = shape.points[0];
  let minDistance = calculateDistance(point, closestPoint);
  let segmentIndex = 0;
  let positionAlongSegment = 0;

  // Find closest point on any segment
  for (let i = 0; i < shape.segments.length; i++) {
    const segment = shape.segments[i];
    const projection = projectPointToSegment(point, segment.start, segment.end);
    const distance = calculateDistance(point, projection.point);

    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = projection.point;
      segmentIndex = i;
      positionAlongSegment = projection.position;
    }
  }

  return {
    closestPoint,
    distanceToShape: minDistance,
    segmentIndex,
    positionAlongSegment
  };
}

/**
 * Calculate distance along shape between two projections
 */
function calculateDistanceBetweenProjections(
  projection1: ProjectionResult,
  projection2: ProjectionResult,
  routeShape: RouteShape
): number {
  // If both projections are on the same segment
  if (projection1.segmentIndex === projection2.segmentIndex) {
    const segment = routeShape.segments[projection1.segmentIndex];
    const segmentLength = segment.distance;
    const distance = Math.abs(projection2.positionAlongSegment - projection1.positionAlongSegment) * segmentLength;
    return distance;
  }

  // Calculate distance across multiple segments
  let totalDistance = 0;
  const startIndex = Math.min(projection1.segmentIndex, projection2.segmentIndex);
  const endIndex = Math.max(projection1.segmentIndex, projection2.segmentIndex);

  // Add partial distance from first segment
  const firstSegment = routeShape.segments[startIndex];
  const firstProjection = projection1.segmentIndex === startIndex ? projection1 : projection2;
  totalDistance += (1 - firstProjection.positionAlongSegment) * firstSegment.distance;

  // Add full distances for intermediate segments
  for (let i = startIndex + 1; i < endIndex; i++) {
    totalDistance += routeShape.segments[i].distance;
  }

  // Add partial distance from last segment
  if (endIndex > startIndex) {
    const lastSegment = routeShape.segments[endIndex];
    const lastProjection = projection1.segmentIndex === endIndex ? projection1 : projection2;
    totalDistance += lastProjection.positionAlongSegment * lastSegment.distance;
  }

  return totalDistance;
}

/**
 * Determine confidence level based on projection quality
 */
function determineConfidence(
  vehicleProjection: ProjectionResult,
  stopProjection: ProjectionResult
): 'high' | 'medium' | 'low' {
  const maxProjectionDistance = Math.max(
    vehicleProjection.distanceToShape,
    stopProjection.distanceToShape
  );

  if (maxProjectionDistance < PROJECTION_CONFIDENCE_THRESHOLDS.HIGH_CONFIDENCE_MAX_DISTANCE) {
    return 'high'; // Both points are close to route shape
  } else if (maxProjectionDistance < PROJECTION_CONFIDENCE_THRESHOLDS.MEDIUM_CONFIDENCE_MAX_DISTANCE) {
    return 'medium'; // Points are reasonably close
  } else {
    return 'low'; // Points are far from route shape
  }
}