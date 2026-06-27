/**
 * Arrival Time Utilities - Main exports
 * Pure functions for arrival time calculations
 */

// Main calculation functions
export {
  calculateVehicleArrivalTime,
  calculateMultipleArrivals,
  sortVehiclesByArrival,
  determineTargetStopRelation,
  isVehicleOffRoute
} from './arrivalUtils.ts';

// Geometry utilities
export {
  calculateProgressAlongSegment,
  distancePointToLineSegment,
  projectPointToSegment,
  isProjectionBetween,
  calculateRoutePosition,
  calculateSegmentConfidence
} from './geometryUtils.ts';

// Trip parsing utilities
export {
  getTripStopSequence,
  findStopInSequence,
  getIntermediateStopData
} from './tripUtils.ts';

// Distance calculation utilities
export {
  calculateDistanceAlongShape,
  calculateDistanceViaStops,
  projectPointToShape
} from './distanceUtils.ts';

// Distance Calculator class removed - use direct function imports from distanceUtils.ts

// Time calculation utilities
export {
  calculateArrivalTime,
  calculateDwellTime,
  calculateSpeedAdjustedTime,
  calculateTimeRange
} from './timeUtils.ts';

// Status message utilities
export {
  generateStatusMessage,
  getArrivalStatus,
  generateStatusWithConfidence
} from './statusUtils.ts';

// Re-export types and constants for convenience
export type {
  ArrivalTimeResult,
  DistanceResult,
  RouteShape,
  ArrivalStatus
} from '../../types/arrivalTime.ts';

export { ARRIVAL_STATUS_SORT_ORDER } from '../../types/arrivalTime.ts';

// Re-export existing coordinate type
export type { Coordinates } from '../location/distanceUtils.ts';