/**
 * Speed Calculation Utilities
 * Core speed calculation functions without unnecessary classes
 */

import { calculateDistance, type Coordinates } from '../location/distanceUtils';
import { SPEED_PREDICTION_CONFIG } from '../core/constants';
import type { TranzyVehicleResponse } from '../../types/rawTranzyApi';

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
// Core Interfaces (Simplified)
// ============================================================================

export interface SpeedPrediction {
  speed: number; // km/h
  method: 'api_speed' | 'nearby_average' | 'location_based' | 'stopped_at_station' | 'static_fallback';
  confidence: 'high' | 'medium' | 'low' | 'very_low';
  metadata?: {
    apiSpeed?: number;
    nearbyVehicleCount?: number;
    nearbyAverageSpeed?: number;
    distanceToCenter?: number;
    locationBasedSpeed?: number;
  };
}

// ============================================================================
// Core Speed Calculation Functions
// ============================================================================

/**
 * Main speed prediction function - replaces SpeedPredictor class
 */
export function predictVehicleSpeed(
  vehicle: TranzyVehicleResponse,
  nearbyVehicles: TranzyVehicleResponse[],
  stationDensityCenter: Coordinates
): SpeedPrediction {
  // 1. Try API speed first (only if > SPEED_THRESHOLD = 5 km/h)
  if (vehicle.speed && vehicle.speed > SPEED_PREDICTION_CONFIG.SPEED_THRESHOLD) {
    return {
      speed: vehicle.speed,
      method: 'api_speed',
      confidence: 'high',
      metadata: { apiSpeed: vehicle.speed }
    };
  }

  // 2. Try nearby vehicle average (only vehicles > SPEED_THRESHOLD)
  const nearbySpeed = calculateNearbyAverageSpeed(vehicle, nearbyVehicles);
  if (nearbySpeed.speed > SPEED_PREDICTION_CONFIG.SPEED_THRESHOLD) {
    return {
      speed: nearbySpeed.speed,
      method: 'nearby_average',
      confidence: nearbySpeed.confidence,
      metadata: {
        nearbyVehicleCount: nearbySpeed.count,
        nearbyAverageSpeed: nearbySpeed.speed
      }
    };
  }

  // 3. Try location-based speed estimation
  const locationSpeed = calculateLocationBasedSpeed(vehicle, stationDensityCenter);
  if (locationSpeed.speed > SPEED_PREDICTION_CONFIG.SPEED_THRESHOLD) {
    return {
      speed: locationSpeed.speed,
      method: 'location_based',
      confidence: locationSpeed.confidence,
      metadata: {
        distanceToCenter: locationSpeed.distanceToCenter,
        locationBasedSpeed: locationSpeed.speed
      }
    };
  }

  // 4. Static fallback
  return {
    speed: SPEED_PREDICTION_CONFIG.FALLBACK_SPEED,
    method: 'static_fallback',
    confidence: 'very_low'
  };
}

/**
 * Calculate average speed from nearby vehicles
 */
function calculateNearbyAverageSpeed(
  vehicle: TranzyVehicleResponse,
  nearbyVehicles: TranzyVehicleResponse[]
): { speed: number; confidence: 'high' | 'medium' | 'low'; count: number } {
  const vehiclePosition = { lat: vehicle.latitude, lon: vehicle.longitude };
  
  // Validate vehicle coordinates
  if (!isValidCoordinate(vehiclePosition)) {
    return { speed: 0, confidence: 'low', count: 0 };
  }
  
  const validSpeeds: number[] = [];

  for (const nearby of nearbyVehicles) {
    // Skip self and vehicles with speed <= SPEED_THRESHOLD (5 km/h)
    if (nearby.id === vehicle.id || !nearby.speed || nearby.speed <= SPEED_PREDICTION_CONFIG.SPEED_THRESHOLD) {
      continue;
    }

    const nearbyPosition = { lat: nearby.latitude, lon: nearby.longitude };
    
    // Validate nearby vehicle coordinates
    if (!isValidCoordinate(nearbyPosition)) continue;

    try {
      const distance = calculateDistance(vehiclePosition, nearbyPosition);

      if (distance <= SPEED_PREDICTION_CONFIG.NEARBY_VEHICLE_RADIUS) {
        validSpeeds.push(nearby.speed);
      }
    } catch (error) {
      // Skip this vehicle if distance calculation fails
      continue;
    }
  }

  if (validSpeeds.length === 0) {
    return { speed: 0, confidence: 'low', count: 0 };
  }

  const averageSpeed = validSpeeds.reduce((sum, speed) => sum + speed, 0) / validSpeeds.length;
  
  // Confidence based on sample size
  let confidence: 'high' | 'medium' | 'low';
  if (validSpeeds.length >= 5) confidence = 'high';
  else if (validSpeeds.length >= 2) confidence = 'medium';
  else confidence = 'low';

  return { speed: averageSpeed, confidence, count: validSpeeds.length };
}

/**
 * Calculate location-based speed estimation
 */
function calculateLocationBasedSpeed(
  vehicle: TranzyVehicleResponse,
  stationDensityCenter: Coordinates
): { speed: number; confidence: 'high' | 'medium' | 'low'; distanceToCenter: number } {
  const vehiclePosition = { lat: vehicle.latitude, lon: vehicle.longitude };
  
  // Validate coordinates
  if (!isValidCoordinate(vehiclePosition) || !isValidCoordinate(stationDensityCenter)) {
    return { speed: 0, confidence: 'low', distanceToCenter: 0 };
  }
  
  let distanceToCenter: number;
  try {
    distanceToCenter = calculateDistance(vehiclePosition, stationDensityCenter);
  } catch (error) {
    return { speed: 0, confidence: 'low', distanceToCenter: 0 };
  }

  // Speed decreases as distance from center increases
  const maxDistance = SPEED_PREDICTION_CONFIG.MAX_DISTANCE_FROM_CENTER;
  const minSpeed = SPEED_PREDICTION_CONFIG.MIN_LOCATION_SPEED;
  const maxSpeed = SPEED_PREDICTION_CONFIG.MAX_LOCATION_SPEED;

  if (distanceToCenter >= maxDistance) {
    return { speed: minSpeed, confidence: 'low', distanceToCenter };
  }

  // Linear interpolation between max and min speed
  const speedRatio = 1 - (distanceToCenter / maxDistance);
  const locationSpeed = minSpeed + (maxSpeed - minSpeed) * speedRatio;

  // Confidence based on distance from center
  let confidence: 'high' | 'medium' | 'low';
  if (distanceToCenter < maxDistance * 0.3) confidence = 'high';
  else if (distanceToCenter < maxDistance * 0.7) confidence = 'medium';
  else confidence = 'low';

  return { speed: locationSpeed, confidence, distanceToCenter };
}

/**
 * Validate speed value is reasonable
 */
export function validateSpeed(speed: number): boolean {
  return speed > 0 && 
         speed <= SPEED_PREDICTION_CONFIG.MAX_REASONABLE_SPEED &&
         speed >= SPEED_PREDICTION_CONFIG.MIN_REASONABLE_SPEED;
}