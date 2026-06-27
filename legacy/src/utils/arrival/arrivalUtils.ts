/**
 * Arrival Calculation Utilities
 * Main orchestration functions for arrival time calculations
 */

import { calculateDistanceAlongShape, calculateDistanceViaStops, projectPointToShape } from './distanceUtils.ts';
import { calculateArrivalTime } from './timeUtils.ts';
import { generateStatusMessage, getArrivalStatus } from './statusUtils.ts';
import { getTripStopSequence, findStopInSequence, getIntermediateStopData } from './tripUtils.ts';
import { estimateVehicleProgressWithShape, estimateVehicleProgressWithStops } from './vehicleProgressUtils.ts';
import { ARRIVAL_CONFIG } from '../core/constants.ts';
import type {
  TranzyStopResponse,
  TranzyTripResponse,
  TranzyStopTimeResponse,
  RouteShape,
  ArrivalTimeResult,
  VehicleProgressEstimation
} from '../../types/arrivalTime.ts';
import type { EnhancedVehicleData } from '../vehicle/vehicleEnhancementUtils.ts';
import { ARRIVAL_STATUS_SORT_ORDER } from '../../types/arrivalTime.ts';

/**
 * Calculate arrival time for a single vehicle to a target stop
 * Uses enhanced vehicle data with predicted position and speed
 */
export function calculateVehicleArrivalTime(
  vehicle: EnhancedVehicleData,
  targetStop: TranzyStopResponse,
  trips: TranzyTripResponse[],
  stopTimes: TranzyStopTimeResponse[],
  stops: TranzyStopResponse[],
  routeShape?: RouteShape
): ArrivalTimeResult {
  const vehiclePosition = { lat: vehicle.latitude, lon: vehicle.longitude };
  const stopPosition = { lat: targetStop.stop_lat, lon: targetStop.stop_lon };
  
  // Get intermediate stop data using consolidated utility
  const intermediateData = getIntermediateStopData(vehicle, targetStop, stopTimes, stops);
  
  const distanceResult = routeShape 
    ? calculateDistanceAlongShape(vehiclePosition, stopPosition, routeShape)
    : calculateDistanceViaStops(vehiclePosition, stopPosition, intermediateData.coordinates);

  // Calculate time estimate using predicted speed from enhanced vehicle
  const estimatedMinutes = calculateArrivalTime(
    distanceResult.totalDistance,
    intermediateData.count,
    vehicle.speed > 0 ? vehicle.speed : undefined
  );

  // Get status (determines both display and sort order)
  const status = getArrivalStatus(estimatedMinutes, vehicle, targetStop, trips, stopTimes, stops);

  // Generate status message
  const statusMessage = generateStatusMessage(status, estimatedMinutes);

  return {
    vehicleId: vehicle.id, // Keep as number - matches API type
    estimatedMinutes,
    status,
    statusMessage,
    confidence: distanceResult.confidence,
    calculationMethod: distanceResult.method,
    rawDistance: distanceResult.totalDistance
  };
}

/**
 * Calculate arrival times for multiple vehicles
 * Uses enhanced vehicle data with predicted positions and speeds
 */
export function calculateMultipleArrivals(
  vehicles: EnhancedVehicleData[],
  targetStop: TranzyStopResponse,
  trips: TranzyTripResponse[],
  stopTimes: TranzyStopTimeResponse[],
  stops: TranzyStopResponse[],
  routeShapes?: Map<string, RouteShape>
): ArrivalTimeResult[] {
  // Filter vehicles that serve the target stop (reuse existing filtering pattern)
  const relevantVehicles = vehicles.filter(vehicle => {
    if (!vehicle.trip_id) return false;
    return stopTimes.some(st => st.trip_id === vehicle.trip_id && st.stop_id === targetStop.stop_id);
  });
  
  return relevantVehicles.map(vehicle => {
    // Get route shape for this vehicle's trip
    let routeShape: RouteShape | undefined;
    if (routeShapes && vehicle.trip_id) {
      const trip = trips.find(t => t.trip_id === vehicle.trip_id);
      if (trip && trip.shape_id) {
        routeShape = routeShapes.get(trip.shape_id);
      }
    }
    
    return calculateVehicleArrivalTime(vehicle, targetStop, trips, stopTimes, stops, routeShape);
  });
}

/**
 * Sort vehicles by arrival priority using status-based ordering
 */
export function sortVehiclesByArrival(results: ArrivalTimeResult[]): ArrivalTimeResult[] {
  return [...results].sort((a, b) => {
    // Primary: sort by status priority
    const priorityDiff = ARRIVAL_STATUS_SORT_ORDER[a.status] - ARRIVAL_STATUS_SORT_ORDER[b.status];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Secondary: sort by time within same status group
    if (a.estimatedMinutes !== b.estimatedMinutes) {
      return a.estimatedMinutes - b.estimatedMinutes;
    }
    
    // Tertiary: stable sort by vehicle ID
    return a.vehicleId - b.vehicleId;
  });
}

/**
 * Determine target stop relationship using enhanced vehicle progress estimation
 */
export function determineTargetStopRelation(
  vehicle: EnhancedVehicleData,
  targetStop: TranzyStopResponse,
  trips: TranzyTripResponse[],
  stopTimes: TranzyStopTimeResponse[],
  stops: TranzyStopResponse[],
  routeShape?: RouteShape
): 'upcoming' | 'passed' | 'not_in_trip' {
  if (!vehicle.trip_id) return 'not_in_trip';
  
  // Get stop times for this trip using utility
  const tripStopTimes = getTripStopSequence(vehicle, stopTimes);

  // Find target stop in trip sequence using utility
  const { stopTime: targetStopInTrip } = findStopInSequence(targetStop.stop_id, tripStopTimes);
  if (!targetStopInTrip) return 'not_in_trip';
  
  // Estimate vehicle's current position using available method
  let vehicleProgress: VehicleProgressEstimation;
  
  if (routeShape) {
    // Use route shape projection (most accurate)
    vehicleProgress = estimateVehicleProgressWithShape(vehicle, tripStopTimes, stops, routeShape);
  } else {
    // Fallback: use stop-to-stop GPS segments
    vehicleProgress = estimateVehicleProgressWithStops(vehicle, tripStopTimes, stops);
  }
  
  // Compare target stop with vehicle's segment
  if (vehicleProgress.segmentBetweenStops) {
    const nextStopSequence = vehicleProgress.segmentBetweenStops.nextStop.stop_sequence;
    const targetSequence = targetStopInTrip.stop_sequence;
    
    return targetSequence >= nextStopSequence ? 'upcoming' : 'passed';
  }
  
  // Low confidence or no segment identified - assume upcoming
  return 'upcoming';
}

/**
 * Check if vehicle is off-route based on route_id, trip_id, timestamp age, and distance threshold
 */
export function isVehicleOffRoute(
  vehicle: EnhancedVehicleData,
  routeShape?: RouteShape
): boolean {
  // No route ID or trip ID means off-route
  if (!vehicle.route_id || !vehicle.trip_id) {
    return true;
  }
  
  // Check if timestamp is older than 30 minutes (stale data)
  const vehicleTimestamp = new Date(vehicle.timestamp);
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  
  if (vehicleTimestamp < thirtyMinutesAgo) {
    return true; // Stale data, consider off-route
  }
  
  // If we have route shape, check distance threshold
  if (routeShape) {
    const vehiclePosition = { lat: vehicle.latitude, lon: vehicle.longitude };
    const projection = projectPointToShape(vehiclePosition, routeShape);
    
    return projection.distanceToShape > ARRIVAL_CONFIG.OFF_ROUTE_THRESHOLD;
  }
  
  // No route shape available, assume on-route if has route_id and fresh timestamp
  return false;
}