/**
 * Arrival Time Utilities
 * Pure functions for converting distances to arrival times
 * Enhanced with dynamic speed prediction support (Requirements 5.1, 5.3, 5.4)
 */

import { ARRIVAL_CONFIG } from '../../utils/core/constants.ts';
import type { EnhancedVehicleData } from '../vehicle/vehicleEnhancementUtils';

/**
 * Calculate arrival time based on distance and intermediate stops
 * Enhanced version that can use predicted speed from vehicle data (Requirement 5.1)
 */
export function calculateArrivalTime(
  distance: number,
  intermediateStops: number,
  predictedSpeed?: number
): number {
  // Convert distance from meters to kilometers
  const distanceKm = distance / 1000;
  const averageSpeed = ARRIVAL_CONFIG.AVERAGE_SPEED;

  // Travel time. When a live speed is available, blend it toward the average
  // travel speed by distance: a momentary reading (a bus briefly stopped or
  // crawling at e.g. 8 km/h) must not be extrapolated over a long remaining
  // trip. Near stops are dominated by the current speed; far stops by the
  // average — which keeps the ETA stable as the vehicle stops and starts.
  let travelTimeMinutes: number;
  if (predictedSpeed && predictedSpeed > 0) {
    const timeAtCurrent = (distanceKm / predictedSpeed) * 60;
    const timeAtAverage = (distanceKm / averageSpeed) * 60;
    const weight = Math.min(1, distance / ARRIVAL_CONFIG.ETA_SPEED_BLEND_DISTANCE_METERS);
    travelTimeMinutes = timeAtCurrent * (1 - weight) + timeAtAverage * weight;
  } else {
    travelTimeMinutes = (distanceKm / averageSpeed) * 60;
  }

  // Add dwell time for intermediate stops
  const dwellTimeMinutes = calculateDwellTime(intermediateStops);
  
  // Total estimated time
  const totalMinutes = travelTimeMinutes + dwellTimeMinutes;
  
  // Round to reasonable precision (0.1 minutes = 6 seconds)
  return Math.round(totalMinutes * 10) / 10;
}

/**
 * Calculate arrival time using enhanced vehicle data with speed prediction
 * Integrates with dynamic speed prediction system (Requirements 5.1, 5.3)
 */
export function calculateArrivalTimeWithPrediction(
  distance: number,
  intermediateStops: number,
  vehicle: EnhancedVehicleData
): number {
  // Extract predicted speed from vehicle metadata (Requirement 5.1)
  const predictedSpeed = vehicle.predictionMetadata?.predictedSpeed;
  
  // Use the enhanced calculation with predicted speed
  return calculateArrivalTime(distance, intermediateStops, predictedSpeed);
}

/**
 * Calculate total dwell time for intermediate stops
 */
export function calculateDwellTime(intermediateStops: number): number {
  // Convert dwell time from seconds to minutes
  const dwellTimePerStopMinutes = ARRIVAL_CONFIG.DWELL_TIME / 60;
  
  // Total dwell time for all intermediate stops
  return intermediateStops * dwellTimePerStopMinutes;
}

/**
 * Calculate speed-adjusted time (enhanced with dynamic speed prediction)
 * Supports both legacy currentSpeed parameter and enhanced vehicle data (Requirements 5.1, 5.3)
 */
export function calculateSpeedAdjustedTime(
  distance: number,
  currentSpeed: number,
  averageSpeed: number = ARRIVAL_CONFIG.AVERAGE_SPEED,
  vehicle?: EnhancedVehicleData
): number {
  // If enhanced vehicle data is provided, use predicted speed (Requirement 5.1)
  if (vehicle?.predictionMetadata?.predictedSpeed) {
    const predictedSpeed = vehicle.predictionMetadata.predictedSpeed;
    const distanceKm = distance / 1000;
    const timeAtPredictedSpeed = (distanceKm / predictedSpeed) * 60; // minutes
    
    // For enhanced vehicles, use predicted speed directly without blending
    // as it already incorporates traffic conditions and nearby vehicle data
    return Math.round(timeAtPredictedSpeed * 10) / 10;
  }
  
  // Legacy behavior: If current speed is available and positive, use it for initial calculation
  if (currentSpeed > 0) {
    const distanceKm = distance / 1000;
    const timeAtCurrentSpeed = (distanceKm / currentSpeed) * 60; // minutes
    
    // Blend current speed with average speed for more realistic estimates
    const timeAtAverageSpeed = (distanceKm / averageSpeed) * 60;
    
    // Weight current speed more heavily for short distances
    const distanceWeight = Math.min(1, distance / 2000); // 2km threshold
    const blendedTime = timeAtCurrentSpeed * (1 - distanceWeight) + timeAtAverageSpeed * distanceWeight;
    
    return Math.round(blendedTime * 10) / 10;
  }
  
  // Fall back to average speed calculation if speed is 0 or unavailable
  return calculateArrivalTime(distance, 0);
}

/**
 * Calculate confidence-adjusted time range
 */
import { CONFIDENCE_LEVELS } from '../core/stringConstants';

export function calculateTimeRange(
  estimatedTime: number,
  confidence: typeof CONFIDENCE_LEVELS[keyof typeof CONFIDENCE_LEVELS]
): { min: number; max: number; estimate: number } {
  let variabilityFactor: number;
  
  switch (confidence) {
    case 'high':
      variabilityFactor = 0.1; // ±10%
      break;
    case 'medium':
      variabilityFactor = 0.2; // ±20%
      break;
    case 'low':
      variabilityFactor = 0.3; // ±30%
      break;
  }
  
  const variation = estimatedTime * variabilityFactor;
  
  return {
    min: Math.max(0, estimatedTime - variation),
    max: estimatedTime + variation,
    estimate: estimatedTime
  };
}