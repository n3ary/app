// LocationService - Domain-focused service for GPS operations and location management
// Follows established service patterns with clean error handling and graceful degradation

import type { LocationServiceOptions, PermissionState } from '../types/location';
import { DEFAULT_LOCATION_ACCURACY } from '../types/location';
import { handleLocationError, retryLocationWithBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from './error';

export const locationService = {
  /**
   * Get current GPS position with retry logic and graceful degradation
   */
  async getCurrentPosition(options?: LocationServiceOptions): Promise<GeolocationPosition> {
    if (!('geolocation' in navigator)) {
      const error = handleLocationError(new Error('Geolocation not supported'), 'get current position');
      throw new Error(error.message);
    }

    // Use centralized balanced accuracy as default
    const defaultOptions = DEFAULT_LOCATION_ACCURACY.balanced;
    const finalOptions = { ...defaultOptions, ...options };

    // Wrap the geolocation call for retry logic
    const getPositionOnce = (): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject, // Pass the raw GeolocationPositionError for proper error handling
          finalOptions
        );
      });
    };

    try {
      // Use retry logic with exponential backoff for timeout and position unavailable errors
      return await retryLocationWithBackoff(getPositionOnce, DEFAULT_RETRY_CONFIG, 'get current position');
    } catch (error) {
      // Handle and transform the error for consistent error reporting
      const locationError = handleLocationError(error, 'get current position');
      throw new Error(locationError.message);
    }
  },

  /**
   * Get current position with custom retry configuration
   */
  async getCurrentPositionWithRetry(
    options?: LocationServiceOptions, 
    retryConfig?: Partial<RetryConfig>
  ): Promise<GeolocationPosition> {
    const finalRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    
    if (!('geolocation' in navigator)) {
      const error = handleLocationError(new Error('Geolocation not supported'), 'get current position');
      throw new Error(error.message);
    }

    const defaultOptions = DEFAULT_LOCATION_ACCURACY.balanced;
    const finalOptions = { ...defaultOptions, ...options };

    const getPositionOnce = (): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, finalOptions);
      });
    };

    try {
      return await retryLocationWithBackoff(getPositionOnce, finalRetryConfig, 'get current position');
    } catch (error) {
      const locationError = handleLocationError(error, 'get current position');
      throw new Error(locationError.message);
    }
  },

  /**
   * Check current permission status for location access
   */
  async checkPermissionStatus(): Promise<PermissionState> {
    if (!('geolocation' in navigator)) {
      return 'disabled';
    }

    if (!('permissions' in navigator)) {
      return 'prompt'; // Can't check, assume prompt needed
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      return permission.state as PermissionState;
    } catch {
      return 'prompt';
    }
  },

  /**
   * Request location permission by attempting to get position with graceful degradation
   */
  async requestPermission(): Promise<PermissionState> {
    try {
      // Use high accuracy with no cache for permission request
      const permissionOptions = { 
        ...DEFAULT_LOCATION_ACCURACY.high, 
        maximumAge: 0 
      };
      await this.getCurrentPosition(permissionOptions);
      return 'granted';
    } catch (error) {
      const locationError = handleLocationError(error, 'request permission');
      
      // Return appropriate permission state based on error type
      switch (locationError.type) {
        case 'permission_denied':
          return 'denied';
        case 'not_supported':
          return 'disabled';
        default:
          return 'prompt';
      }
    }
  },

  /**
   * Watch position changes with error handling
   */
  watchPosition(
    callback: (position: GeolocationPosition) => void,
    errorCallback?: (error: string) => void,
    options?: LocationServiceOptions
  ): number {
    if (!('geolocation' in navigator)) {
      const error = handleLocationError(new Error('Geolocation not supported'), 'watch position');
      errorCallback?.(error.message);
      return -1;
    }

    // Use centralized high accuracy for watching (more frequent updates)
    const defaultOptions = DEFAULT_LOCATION_ACCURACY.high;
    const finalOptions = { ...defaultOptions, ...options };

    return navigator.geolocation.watchPosition(
      callback,
      (error) => {
        const locationError = handleLocationError(error, 'watch position');
        errorCallback?.(locationError.message);
      },
      finalOptions
    );
  },

  /**
   * Clear position watch
   */
  clearWatch(watchId: number): void {
    if (watchId >= 0) {
      navigator.geolocation.clearWatch(watchId);
    }
  },

  /**
   * Check if location services are available and functional
   */
  isLocationAvailable(): boolean {
    return 'geolocation' in navigator;
  },

  /**
   * Get fallback location options when GPS is unavailable
   */
  getFallbackOptions(): { 
    manualEntry: boolean; 
    lastKnownLocation: boolean; 
    message: string 
  } {
    return {
      manualEntry: true,
      lastKnownLocation: true,
      message: 'GPS unavailable. Please enter your location manually or use your last known location.'
    };
  }
};