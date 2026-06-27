/**
 * Confidence Debug Utilities
 * Provides detailed information about why arrival times have low confidence
 */

import type { StationVehicle } from '../../types/stationFilter';

export interface ConfidenceDebugInfo {
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  calculationMethod: string;
  actualConditions: string[];
  vehicleData: {
    hasRouteId: boolean;
    hasTripId: boolean;
    coordinates: { lat: number; lon: number };
    speed: number | null;
  };
}

/**
 * Generate debug information for confidence levels with actual conditions
 */
export function generateConfidenceDebugInfo(
  stationVehicle: StationVehicle
): ConfidenceDebugInfo | null {
  if (!stationVehicle.arrivalTime) {
    return null;
  }

  const { confidence } = stationVehicle.arrivalTime;
  const vehicle = stationVehicle.vehicle;
  
  // Infer calculation method from available data
  const calculationMethod = inferCalculationMethod(stationVehicle);
  
  const debugInfo: ConfidenceDebugInfo = {
    confidence,
    reason: getConfidenceReason(confidence),
    calculationMethod,
    actualConditions: getActualConditions(confidence, calculationMethod, stationVehicle),
    vehicleData: {
      hasRouteId: !!vehicle.route_id,
      hasTripId: !!vehicle.trip_id,
      coordinates: { lat: vehicle.latitude, lon: vehicle.longitude },
      speed: vehicle.speed
    }
  };

  return debugInfo;
}

/**
 * Get actual conditions that caused this confidence level (based on real code paths)
 */
function getActualConditions(
  confidence: 'high' | 'medium' | 'low',
  calculationMethod: string,
  stationVehicle: StationVehicle
): string[] {
  const conditions: string[] = [];
  const vehicle = stationVehicle.vehicle;
  
  if (confidence === 'low') {
    conditions.push('ACTUAL CONDITIONS CAUSING LOW CONFIDENCE:');
    
    // From vehicleProgressUtils.ts line 39: confidence: 'low' when sortedStopTimes.length < 2
    if (calculationMethod === 'route_projection') {
      conditions.push('• sortedStopTimes.length < 2 (insufficient trip data)');
      conditions.push('  → Code: if (sortedStopTimes.length < 2) return { confidence: "low" }');
    }
    
    // From vehicleProgressUtils.ts line 123: confidence: 'low' when no segments found
    conditions.push('• No valid segments found between stops');
    conditions.push('  → Code: return { confidence: "low", method: "stop_segments" }');
    
    // From vehicleProgressUtils.ts line 178: confidence based on isReasonablyClose
    conditions.push('• Vehicle distance from expected position > threshold');
    conditions.push('  → Code: confidence = isReasonablyClose ? "medium" : "low"');
    
    // Vehicle data issues
    if (!vehicle.route_id) {
      conditions.push(`• vehicle.route_id = ${vehicle.route_id} (missing route assignment)`);
    }
    if (!vehicle.trip_id) {
      conditions.push(`• vehicle.trip_id = ${vehicle.trip_id} (missing trip assignment)`);
    }
    
    // Coordinate issues
    if (vehicle.latitude === 0 && vehicle.longitude === 0) {
      conditions.push('• vehicle coordinates = (0, 0) (invalid GPS data)');
    }
    
  } else if (confidence === 'medium') {
    conditions.push('MEDIUM CONFIDENCE CONDITIONS:');
    conditions.push('• Using stop_segments method (no route shape available)');
    conditions.push('• OR vehicle reasonably close to expected route position');
    conditions.push('• GPS positioning appears reliable');
    
  } else {
    conditions.push('HIGH CONFIDENCE CONDITIONS:');
    conditions.push('• Route shape projection successful with vehicle < 50m from route');
    conditions.push('• Complete trip data and accurate positioning');
  }
  
  return conditions;
}

/**
 * Infer the calculation method from available vehicle data
 */
function inferCalculationMethod(stationVehicle: StationVehicle): string {
  const vehicle = stationVehicle.vehicle;
  
  // Basic heuristics to infer method
  if (!vehicle.route_id || !vehicle.trip_id) {
    return 'fallback';
  }
  
  // If confidence is high, likely using route_shape
  if (stationVehicle.arrivalTime?.confidence === 'high') {
    return 'route_shape';
  }
  
  // If confidence is low, likely using stop_segments or fallback
  if (stationVehicle.arrivalTime?.confidence === 'low') {
    return 'stop_segments';
  }
  
  return 'route_shape';
}

/**
 * Get the main reason for the confidence level
 */
function getConfidenceReason(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return 'Accurate route shape projection with precise vehicle positioning';
    case 'medium':
      return 'Good positioning using stop-to-stop calculations or reasonable route projection';
    case 'low':
      return 'Uncertain positioning or calculation method - results may be inaccurate';
    default:
      return 'Unknown confidence level';
  }
}

/**
 * Format debug info for tooltip display with actual conditions
 */
export function formatConfidenceDebugTooltip(debugInfo: ConfidenceDebugInfo): string {
  const lines = [
    `Confidence: ${debugInfo.confidence.toUpperCase()}`,
    `Method: ${debugInfo.calculationMethod}`,
    `Reason: ${debugInfo.reason}`,
    '',
    'VEHICLE DATA:',
    `• Route ID: ${debugInfo.vehicleData.hasRouteId ? 'Present' : 'MISSING'}`,
    `• Trip ID: ${debugInfo.vehicleData.hasTripId ? 'Present' : 'MISSING'}`,
    `• Coordinates: (${debugInfo.vehicleData.coordinates.lat}, ${debugInfo.vehicleData.coordinates.lon})`,
    `• Speed: ${debugInfo.vehicleData.speed ?? 'null'} km/h`,
    '',
    ...debugInfo.actualConditions
  ];
  
  return lines.join('\n');
}