/**
 * Vehicle Arrival Time TypeScript interfaces and types
 * Core interfaces for arrival time calculations, distance calculations, and configuration
 * Reuses existing coordinate types from distanceUtils
 */

import type { Coordinates } from '../utils/location/distanceUtils.ts';
import type { TranzyStopResponse, TranzyVehicleResponse, TranzyTripResponse, TranzyStopTimeResponse } from './rawTranzyApi.ts';
import { type ConfidenceLevel, type ArrivalMethod } from '../utils/core/stringConstants';

// Re-export types for use in arrival modules
export type { Coordinates, TranzyStopResponse, TranzyVehicleResponse, TranzyTripResponse, TranzyStopTimeResponse };

// ============================================================================
// Geometric Types
// ============================================================================

export interface ProjectionResult {
  closestPoint: Coordinates;
  distanceToShape: number;
  segmentIndex: number;
  positionAlongSegment: number; // 0-1
}

// ============================================================================
// Route Shape and Trip Data
// ============================================================================

export interface RouteShape {
  id: string;
  points: Coordinates[];
  segments: ShapeSegment[];
}

export interface ShapeSegment {
  start: Coordinates;
  end: Coordinates;
  distance: number;
}

export interface DistanceResult {
  totalDistance: number;
  method: ArrivalMethod;
  confidence: ConfidenceLevel;
}

// ============================================================================
// Vehicle Progress Estimation
// ============================================================================

export interface VehicleProgressEstimation {
  projectionPoint: Coordinates;
  segmentBetweenStops: {
    previousStop: TranzyStopTimeResponse | null; // null when before first stop
    nextStop: TranzyStopTimeResponse;
  } | null; // null when after last stop or off-route
  confidence: ConfidenceLevel;
  method: ArrivalMethod;
}

export interface ArrivalTimeResult {
  vehicleId: number; // Matches TranzyVehicleResponse.id type
  estimatedMinutes: number; // Always positive - actual time value
  status: ArrivalStatus;    // Determines sort order and display
  statusMessage: string;
  confidence: ConfidenceLevel;
  calculationMethod: ArrivalMethod;
  rawDistance?: number;
  debugInfo?: {
    vehicleToShapeDistance: number;
    distanceAlongShape: number;
    stopToShapeDistance: number;
    totalCalculatedDistance: number;
    targetStopRelation: 'upcoming' | 'passed' | 'not_in_trip';
  };
}

// ============================================================================
// Status Types and Sort Order
// ============================================================================

export type ArrivalStatus = 
  | 'at_stop'          // within proximity threshold AND speed = 0
  | 'in_minutes'       // target stop upcoming, sorted by estimated minutes ascending
  | 'departed'         // target stop already passed in trip sequence
  | 'off_route';       // no route_id or exceeds distance threshold

// Sort order: lower number = higher priority
export const ARRIVAL_STATUS_SORT_ORDER: Record<ArrivalStatus, number> = {
  'at_stop': 0,
  'in_minutes': 1,
  'departed': 2,
  'off_route': 3
};

export interface StatusMessageConfig {
  arrivingSoonThreshold: number; // minutes
  maxDisplayMinutes: number; // maximum minutes to display
  proximityThreshold: number; // meters
  recentDepartureWindow: number; // minutes
}

export const DEFAULT_STATUS_CONFIG: StatusMessageConfig = {
  arrivingSoonThreshold: 1, // 1 minute
  maxDisplayMinutes: 30, // 30 minutes
  proximityThreshold: 50, // 50 meters
  recentDepartureWindow: 2 // 2 minutes
};