/**
 * GPS Data Age Calculation Utilities
 * Calculates and categorizes the age of vehicle GPS data for user-facing indicators
 */

import { GPS_DATA_AGE_THRESHOLDS, AUTO_REFRESH_CYCLE } from '../core/constants';

export type DataAgeStatus = 'healthy' | 'stale' | 'very-stale';

export interface DataAgeResult {
  status: DataAgeStatus;
  gpsAge: number; // milliseconds
  fetchAge: number; // milliseconds
  tip: string;
}

/**
 * Calculate the age and status of vehicle GPS data
 * 
 * Logic (simplified to only consider GPS timestamp age):
 * 1. Calculate GPS age: currentTime - vehicleTimestamp
 * 2. Calculate fetch age: currentTime - fetchTimestamp (for toast display)
 * 3. Check if GPS < 3 min → Green (healthy)
 * 4. Check if GPS < 5 min → Yellow (stale)
 * 5. Otherwise → Red (very stale)
 * 
 * @param vehicleTimestamp - ISO timestamp string from vehicle GPS
 * @param fetchTimestamp - Unix timestamp (ms) when API data was fetched
 * @param currentTime - Current time in ms (defaults to Date.now())
 * @returns DataAgeResult with status, ages, and contextual tip
 */
export function calculateDataAge(
  vehicleTimestamp: string,
  fetchTimestamp: number,
  currentTime: number = Date.now()
): DataAgeResult {
  // Handle invalid vehicle timestamp
  let vehicleTime: number;
  try {
    vehicleTime = new Date(vehicleTimestamp).getTime();
    
    // Check if timestamp is invalid (NaN) or in the future
    if (isNaN(vehicleTime) || vehicleTime > currentTime) {
      return {
        status: 'very-stale',
        gpsAge: 0,
        fetchAge: currentTime - fetchTimestamp,
        tip: 'Invalid GPS timestamp detected. Vehicle data may be unreliable.',
      };
    }
  } catch (error) {
    return {
      status: 'very-stale',
      gpsAge: 0,
      fetchAge: currentTime - fetchTimestamp,
      tip: 'Unable to parse GPS timestamp. Vehicle data may be unreliable.',
    };
  }

  // Calculate ages
  const gpsAge = currentTime - vehicleTime;
  const fetchAge = currentTime - fetchTimestamp;

  // Determine status based solely on GPS age
  if (gpsAge < GPS_DATA_AGE_THRESHOLDS.HEALTHY) {
    return {
      status: 'healthy',
      gpsAge,
      fetchAge,
      tip: 'Vehicle GPS data is fresh and reliable.',
    };
  }

  if (gpsAge < GPS_DATA_AGE_THRESHOLDS.STALE) {
    return {
      status: 'stale',
      gpsAge,
      fetchAge,
      tip: 'Vehicle GPS data is aging. Position may be slightly outdated.',
    };
  }

  // GPS age > 5 minutes
  return {
    status: 'very-stale',
    gpsAge,
    fetchAge,
    tip: 'Vehicle GPS data is very old. Position may be significantly outdated.',
  };
}
