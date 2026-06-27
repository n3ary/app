/**
 * Vehicle Enhancement Utilities (Simplified)
 * Consolidates 6 enhancement functions into 2 simple ones
 */

import { predictVehiclePosition } from './positionPredictionUtils';
import { predictVehicleSpeed } from './speedCalculationUtils';
import { calculateStationDensityCenter } from './stationDensityUtils';
import type { 
  TranzyVehicleResponse, 
  TranzyStopResponse, 
  TranzyStopTimeResponse,
  RouteShape 
} from '../../types/arrivalTime';
import type { Coordinates } from '../location/distanceUtils';

// ============================================================================
// Enhanced Vehicle Data Interface (Simplified)
// ============================================================================

export interface EnhancedVehicleData extends TranzyVehicleResponse {
  // Override coordinates with predicted values
  latitude: number;  // Predicted latitude (or original if no prediction)
  longitude: number; // Predicted longitude (or original if no prediction)

  // Schedule-only (synthetic) vehicle flags. Set when this entry represents a
  // SCHEDULED departure with no live GPS yet (Req 6, 12) — synthesized at the
  // route's start station so it renders through the normal vehicle card/map.
  // Absent/false for all real GPS vehicles, so existing behavior is unchanged.
  /** True when this is a synthesized scheduled departure (no live GPS). */
  isScheduled?: boolean;
  /** Minutes from now until the scheduled departure (only when isScheduled). */
  scheduledDepartureMinutes?: number;
  /**
   * For a scheduled vehicle, whether it has DEPARTED and is moving (a "ghost":
   * interpolated position, averaged speed) vs a FUTURE departure waiting at its
   * start station (speed 0). Only meaningful when `isScheduled` is true.
   */
  isGhost?: boolean;
  
  // Override speed with predicted value
  speed: number;     // Predicted speed (or original if no prediction)
  
  // Original API data preserved for debugging
  apiLatitude: number;
  apiLongitude: number;
  apiSpeed: number;
  
  // Prediction timestamp - when this prediction was calculated
  predictionTimestamp?: number;
  
  // Simplified prediction metadata
  predictionMetadata?: {
    // Position prediction
    predictedDistance: number;
    stationsEncountered: number;
    totalDwellTime: number;
    positionMethod: 'route_shape' | 'fallback';
    positionApplied: boolean;
    timestampAge: number;
    
    // Speed prediction (always applied)
    predictedSpeed: number;
    speedMethod: 'api_speed' | 'nearby_average' | 'location_based' | 'stopped_at_station' | 'static_fallback';
    speedConfidence: 'high' | 'medium' | 'low' | 'very_low';
    speedApplied: boolean;
    
    // Station detection
    isAtStation?: boolean;
    stationId?: number;
  };
}

// ============================================================================
// Enhancement Options Interface
// ============================================================================

export interface EnhancementOptions {
  // Position prediction options
  routeShape?: RouteShape;
  stopTimes?: TranzyStopTimeResponse[];
  stops?: TranzyStopResponse[];
  
  // Speed prediction options (always enabled)
  nearbyVehicles?: TranzyVehicleResponse[];
  stationDensityCenter?: Coordinates;

  // Start station prediction suppression (Requirements 9.1, 9.4).
  // When true, forward position prediction is suppressed and the vehicle is
  // shown at its current/API position. Defaults to off, so existing behavior is
  // unchanged when schedule data is unavailable. Callers compute this via
  // `isPredictionSuppressed` in `scheduleVehicleIntegration.ts`.
  suppressForwardPrediction?: boolean;
}

// ============================================================================
// Consolidated Enhancement Functions (2 instead of 6)
// ============================================================================

/**
 * Enhance a single vehicle with predictions
 * Always applies both position and speed predictions
 */
export function enhanceVehicle(
  vehicle: TranzyVehicleResponse,
  options: EnhancementOptions = {}
): EnhancedVehicleData {
  // Preserve original API data
  const apiLatitude = vehicle.latitude;
  const apiLongitude = vehicle.longitude;
  const apiSpeed = vehicle.speed;
  
  // 1. Apply position prediction
  const positionResult = predictVehiclePosition(
    vehicle,
    options.routeShape,
    options.stopTimes,
    options.stops,
    undefined,
    options.suppressForwardPrediction
  );
  
  // 2. Check if vehicle is at station FIRST (before speed prediction)
  let stationDetection: { isAtStation: boolean; stationId?: number } = { isAtStation: false, stationId: undefined };
  
  // First check if vehicle is dwelling at a station (from movement simulation)
  if (positionResult.metadata.stationsEncountered > 0 && positionResult.metadata.totalDwellTime > 0) {
    // Vehicle encountered stations and has dwell time - check if still dwelling
    const timestampAge = positionResult.metadata.timestampAge;
    const totalDwellTimeMs = positionResult.metadata.totalDwellTime;
    
    // Calculate how much time was spent moving vs dwelling
    // If the vehicle has moved beyond the dwell time, it's no longer at a station
    const effectiveMovementTime = Math.max(0, timestampAge - totalDwellTimeMs);
    
    // Only consider "at station" if the vehicle hasn't had time to move away yet
    // This means the timestamp age is still within or close to the dwell period
    if (timestampAge <= totalDwellTimeMs + 5000) { // 5 second buffer for timing precision
      stationDetection.isAtStation = true;
    }
  }
  
  // If not dwelling, check final predicted position proximity to stations
  if (!stationDetection.isAtStation) {
    stationDetection = checkIfAtStation(
      { lat: positionResult.predictedPosition.lat, lon: positionResult.predictedPosition.lon },
      options.stops || []
    );
  }
  
  // 3. Apply speed prediction (skip if at station)
  let finalSpeed: number;
  let finalSpeedMethod: 'api_speed' | 'nearby_average' | 'location_based' | 'stopped_at_station' | 'static_fallback';
  let speedConfidence: 'high' | 'medium' | 'low' | 'very_low';
  
  if (stationDetection.isAtStation) {
    // Vehicle is at station - no need to predict speed
    finalSpeed = 0;
    finalSpeedMethod = 'stopped_at_station';
    speedConfidence = 'high';
  } else {
    // Vehicle is moving - predict speed
    const speedResult = predictVehicleSpeed(
      vehicle,
      options.nearbyVehicles || [],
      options.stationDensityCenter || { lat: 0, lon: 0 }
    );
    finalSpeed = speedResult.speed;
    finalSpeedMethod = speedResult.method;
    speedConfidence = speedResult.confidence;
  }
  
  // Create base enhanced vehicle with prediction timestamp
  const predictionTimestamp = Date.now(); // When this prediction was calculated
  const enhancedVehicle: EnhancedVehicleData = {
    ...vehicle,
    apiLatitude,
    apiLongitude,
    apiSpeed,
    latitude: positionResult.predictedPosition.lat,
    longitude: positionResult.predictedPosition.lon,
    speed: finalSpeed, // Override with predicted speed
    predictionTimestamp, // Components use this for subscription updates
    predictionMetadata: {
      // Position prediction
      predictedDistance: positionResult.metadata.predictedDistance,
      stationsEncountered: positionResult.metadata.stationsEncountered,
      totalDwellTime: positionResult.metadata.totalDwellTime,
      positionMethod: positionResult.metadata.method,
      positionApplied: positionResult.metadata.success,
      timestampAge: positionResult.metadata.timestampAge,
      
      // Speed prediction (always applied)
      predictedSpeed: finalSpeed,
      speedMethod: finalSpeedMethod,
      speedConfidence: speedConfidence,
      speedApplied: true,
      
      // Station detection
      isAtStation: stationDetection.isAtStation,
      stationId: stationDetection.stationId
    }
  };
  
  return enhancedVehicle;
}

/**
 * Enhance multiple vehicles with predictions
 * Always applies both position and speed predictions
 */
export function enhanceVehicles(
  vehicles: TranzyVehicleResponse[],
  options: {
    routeShapes?: Map<string, RouteShape>;
    stopTimesByTrip?: Map<string, TranzyStopTimeResponse[]>;
    stops?: TranzyStopResponse[];
  } = {}
): EnhancedVehicleData[] {
  // Calculate station density center once for all vehicles
  let stationDensityCenter: Coordinates | undefined;
  if (options.stops) {
    stationDensityCenter = calculateStationDensityCenter(options.stops);
  }
  
  return vehicles.map(vehicle => {
    // Get route shape for this vehicle
    let routeShape: RouteShape | undefined;
    if (options.routeShapes && vehicle.trip_id) {
      routeShape = options.routeShapes.get(vehicle.trip_id) || 
                   (vehicle.route_id ? options.routeShapes.get(vehicle.route_id.toString()) : undefined);
    }
    
    // Get stop times for this vehicle
    let stopTimes: TranzyStopTimeResponse[] | undefined;
    if (options.stopTimesByTrip && vehicle.trip_id) {
      stopTimes = options.stopTimesByTrip.get(vehicle.trip_id);
    }
    
    // Build enhancement options
    const enhancementOptions: EnhancementOptions = {
      routeShape,
      stopTimes,
      stops: options.stops,
      nearbyVehicles: vehicles, // All vehicles for nearby analysis
      stationDensityCenter
    };
    
    return enhanceVehicle(vehicle, enhancementOptions);
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a vehicle is at a station based on predicted position
 */
function checkIfAtStation(
  position: { lat: number; lon: number },
  stops: TranzyStopResponse[]
): { isAtStation: boolean; stationId?: number } {
  const STATION_PROXIMITY_THRESHOLD = 50; // meters
  
  for (const stop of stops) {
    const distance = calculateDistance(
      position.lat,
      position.lon,
      stop.stop_lat,
      stop.stop_lon
    );
    
    if (distance <= STATION_PROXIMITY_THRESHOLD) {
      return { isAtStation: true, stationId: stop.stop_id };
    }
  }
  
  return { isAtStation: false };
}

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

/**
 * Check if a vehicle has prediction applied
 */
export function hasPredictionApplied(vehicle: EnhancedVehicleData): boolean {
  return vehicle.predictionMetadata?.positionApplied === true;
}

/**
 * Get original API coordinates from enhanced vehicle
 */
export function getOriginalCoordinates(vehicle: EnhancedVehicleData): { lat: number; lon: number } {
  return {
    lat: vehicle.apiLatitude,
    lon: vehicle.apiLongitude
  };
}

/**
 * Get original API speed from enhanced vehicle
 */
export function getOriginalSpeed(vehicle: EnhancedVehicleData): number {
  return vehicle.apiSpeed;
}
/**
 * Get prediction summary for debugging
 */
export function getPredictionSummary(vehicles: EnhancedVehicleData[]): {
  totalVehicles: number;
  positionPredictionsApplied: number;
  speedPredictionsApplied: number;
  averageTimestampAge: number;
  averagePredictedDistance: number;
} {
  const totalVehicles = vehicles.length;
  let positionPredictionsApplied = 0;
  let speedPredictionsApplied = 0;
  let totalTimestampAge = 0;
  let totalPredictedDistance = 0;
  
  for (const vehicle of vehicles) {
    if (vehicle.predictionMetadata) {
      const { positionApplied, speedApplied, timestampAge, predictedDistance } = vehicle.predictionMetadata;
      
      if (positionApplied) {
        positionPredictionsApplied++;
        totalPredictedDistance += predictedDistance;
      }
      
      if (speedApplied) {
        speedPredictionsApplied++;
      }
      
      totalTimestampAge += timestampAge;
    }
  }
  
  return {
    totalVehicles,
    positionPredictionsApplied,
    speedPredictionsApplied,
    averageTimestampAge: totalVehicles > 0 ? totalTimestampAge / totalVehicles : 0,
    averagePredictedDistance: positionPredictionsApplied > 0 ? totalPredictedDistance / positionPredictionsApplied : 0
  };
}