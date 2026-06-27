import { LOCATION_ACCURACY, type LocationAccuracyLevel, type PermissionState } from '../utils/core/stringConstants';

/**
 * Location-related TypeScript interfaces and types
 * Following the established patterns from rawTranzyApi.ts
 */

export interface LocationPreferences {
  enableAutoLocation: boolean;
  locationAccuracy: LocationAccuracyLevel;
  maxCacheAge: number; // milliseconds
  distanceThreshold: number; // meters for proximity filtering
}

export interface LocationError {
  code: number;
  message: string;
  type: 'permission_denied' | 'position_unavailable' | 'timeout' | 'not_supported' | 'network_error' | 'retry_exhausted';
  retryable: boolean;
}

export interface LocationState {
  // Raw GPS data - no transformations
  currentPosition: GeolocationPosition | null;
  previousPosition: GeolocationPosition | null;
  permissionState: PermissionState | null;
  lastUpdated: number | null;
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  disabled: boolean;
  
  // Configuration
  enableAutoLocation: boolean;
  locationAccuracy: LocationAccuracyLevel;
  cacheTimeout: number;
  distanceThreshold: number;
}

export interface LocationServiceOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

// Type aliases for common coordinate patterns
export type { PermissionState, LocationAccuracyLevel };
export type LocationErrorType = 'permission_denied' | 'position_unavailable' | 'timeout' | 'not_supported' | 'network_error' | 'retry_exhausted';

// Utility type for objects that have coordinates (extends the interface from distanceUtils)
export interface HasCoordinates {
  lat: number;
  lon: number;
}

// Type for location-aware filtering results
export interface LocationFilterResult<T> {
  items: T[];
  center: HasCoordinates;
  radius: number;
  totalFiltered: number;
}

// Configuration for location accuracy settings
export interface LocationAccuracyConfig {
  high: LocationServiceOptions;
  balanced: LocationServiceOptions;
  low: LocationServiceOptions;
}

// Default accuracy configurations - always fresh GPS (maximumAge: 0 is default)
export const DEFAULT_LOCATION_ACCURACY: LocationAccuracyConfig = {
  [LOCATION_ACCURACY.HIGH]: {
    enableHighAccuracy: true,
    timeout: 15000
  },
  [LOCATION_ACCURACY.BALANCED]: {
    enableHighAccuracy: true,
    timeout: 10000
  },
  [LOCATION_ACCURACY.LOW]: {
    enableHighAccuracy: false,
    timeout: 5000
  }
};

// Default preferences
export const DEFAULT_LOCATION_PREFERENCES: LocationPreferences = {
  enableAutoLocation: false, // Require explicit user consent
  locationAccuracy: LOCATION_ACCURACY.BALANCED,
  maxCacheAge: 300000, // 5 minutes
  distanceThreshold: 1000 // 1km default radius
};