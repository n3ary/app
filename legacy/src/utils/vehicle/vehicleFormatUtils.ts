// Vehicle Format Utilities
// Helper functions for formatting vehicle data display

import { TIME_THRESHOLDS } from '../core/constants';
import { CONFIDENCE_LEVELS } from '../core/stringConstants';
import { 
  formatRelativeTime, 
  formatArrivalTime as formatArrivalTimeUtil, 
  formatAbsoluteTime 
} from '../time/timestampFormatUtils';

/**
 * Format vehicle timestamp for display
 * 
 * @param timestamp - ISO timestamp string
 * @returns Formatted time string (HH:MM) in 24-hour format or 'Unknown' if invalid
 * @deprecated Use formatAbsoluteTime from timestampFormatUtils instead
 */
export function formatTimestamp(timestamp: string): string {
  try {
    const timestampMs = new Date(timestamp).getTime();
    return formatAbsoluteTime(timestampMs).replace('at ', '');
  } catch {
    return 'Unknown';
  }
}

/**
 * Format time ago from timestamp
 * 
 * @param timestamp - Timestamp in milliseconds
 * @returns Human-readable "time ago" string
 * @deprecated Use formatRelativeTime from timestampFormatUtils instead
 */
export function formatTimeAgo(timestamp: number): string {
  return formatRelativeTime(timestamp);
}

/**
 * Format exact timestamp with seconds for tooltips
 * 
 * @param timestamp - Timestamp in milliseconds
 * @returns Formatted time string with seconds (HH:MM:SS)
 */
export function formatExactTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    return 'Unknown';
  }
}

/**
 * Format vehicle speed for display
 * 
 * @param speed - Speed in km/h
 * @returns Formatted speed string or 'Stopped' if speed is 0
 */
export function formatSpeed(speed: number): string {
  return speed > 0 ? `${Math.round(speed)} km/h` : 'Stopped';
}

/**
 * Format vehicle accessibility information
 * 
 * @param wheelchairAccessible - Wheelchair accessibility status
 * @param bikeAccessible - Bike accessibility status
 * @returns Array of accessibility features
 */
export function getAccessibilityFeatures(
  wheelchairAccessible?: string,
  bikeAccessible?: string
): Array<{ type: 'wheelchair' | 'bike'; label: string }> {
  const features: Array<{ type: 'wheelchair' | 'bike'; label: string }> = [];
  
  if (wheelchairAccessible === 'WHEELCHAIR_ACCESSIBLE') {
    features.push({ type: 'wheelchair', label: 'Wheelchair' });
  }
  
  if (bikeAccessible === 'BIKE_ACCESSIBLE') {
    features.push({ type: 'bike', label: 'Bike' });
  }
  
  return features;
}

/**
 * Format arrival time result for display
 * 
 * @param arrivalResult - Arrival time calculation result
 * @returns Formatted arrival time string
 */
export function formatArrivalTime(arrivalResult?: { statusMessage: string; confidence: string }): string {
  if (!arrivalResult) return '';
  
  const confidenceIndicator = arrivalResult.confidence === CONFIDENCE_LEVELS.LOW ? ' (est.)' : '';
  return `${arrivalResult.statusMessage}${confidenceIndicator}`;
}

/**
 * Format arrival time in minutes for display
 * 
 * @param minutes - Minutes until arrival
 * @returns Formatted arrival time string
 */
export function formatArrivalMinutes(minutes: number): string {
  return formatArrivalTimeUtil(minutes);
}