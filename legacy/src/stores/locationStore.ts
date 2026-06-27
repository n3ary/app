// LocationStore - Clean state management with raw GPS data
// No cross-store dependencies, simple loading and error states

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LocationPreferences, PermissionState, LocationAccuracyLevel } from '../types/location';
import { DEFAULT_LOCATION_PREFERENCES, DEFAULT_LOCATION_ACCURACY } from '../types/location';
import { handleLocationError } from '../services/error';

interface LocationStore {
  // Raw GPS data - no transformations
  currentPosition: GeolocationPosition | null;
  previousPosition: GeolocationPosition | null;
  permissionState: PermissionState | null;
  lastUpdated: number | null;
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  disabled: boolean;
  
  // Configuration - persisted preferences
  enableAutoLocation: boolean;
  locationAccuracy: LocationAccuracyLevel;
  cacheTimeout: number;
  distanceThreshold: number;
  
  // Actions
  requestLocation: () => Promise<void>;
  requestLocationWithRetry: (maxAttempts?: number) => Promise<void>;
  handleLocationFailure: () => { manualEntry: boolean; lastKnownLocation: boolean; message: string };
  handleLocationError: (error: unknown, permissionState?: PermissionState) => void;
  performLocationRequest: (useRetry?: boolean, maxAttempts?: number) => Promise<void>;
  setCurrentPosition: (position: GeolocationPosition) => void;
  setPermissionState: (state: PermissionState) => void;
  setLocationPreferences: (preferences: Partial<LocationPreferences>) => void;
  clearLocation: () => void;
  resetPermissions: () => void;
  clearError: () => void;
  setDisabled: (disabled: boolean) => void;
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set, get) => ({
      // Raw GPS data
      currentPosition: null,
      previousPosition: null,
      permissionState: null,
      lastUpdated: null,
      
      // Simple states
      loading: false,
      error: null,
      disabled: false,
      
      // Configuration with defaults from centralized config
      enableAutoLocation: DEFAULT_LOCATION_PREFERENCES.enableAutoLocation,
      locationAccuracy: DEFAULT_LOCATION_PREFERENCES.locationAccuracy,
      cacheTimeout: DEFAULT_LOCATION_PREFERENCES.maxCacheAge,
      distanceThreshold: DEFAULT_LOCATION_PREFERENCES.distanceThreshold,
      
      // Shared error handling logic
      handleLocationError: (error: unknown, permissionState?: PermissionState) => {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get location';
        
        // Update permission state based on error type
        const updates: Partial<LocationStore> = { loading: false, error: errorMessage };
        
        if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
          updates.permissionState = 'denied';
        } else if (errorMessage.includes('not supported')) {
          updates.permissionState = 'disabled';
          updates.disabled = true;
        } else if (permissionState) {
          updates.permissionState = permissionState;
        }
        
        set(updates);
      },

      // Shared location request logic
      performLocationRequest: async (useRetry: boolean = false, maxAttempts?: number) => {
        set({ loading: true, error: null });
        
        try {
          const { locationService } = await import('../services/locationService');
          
          if (!locationService.isLocationAvailable()) {
            const locationError = handleLocationError(new Error('Geolocation not supported'), 'check location availability');
            set({ disabled: true, permissionState: 'disabled', loading: false, error: locationError.message });
            return;
          }
          
          // Check permission status first (only for regular requests)
          if (!useRetry) {
            const permissionState = await locationService.checkPermissionStatus();
            set({ permissionState });
            if (permissionState === 'denied') {
              // Use centralized error handling for consistency
              const locationError = handleLocationError(new Error('Permission denied'), 'request location');
              throw new Error(locationError.message);
            }
          }
          
          const state = get();
          const accuracyConfig = DEFAULT_LOCATION_ACCURACY[state.locationAccuracy];
          
          // Get position with or without retry
          const position = useRetry 
            ? await locationService.getCurrentPositionWithRetry(accuracyConfig, maxAttempts ? { maxAttempts } : undefined)
            : await locationService.getCurrentPosition(accuracyConfig);
          
          // Only update if position actually changed (avoid unnecessary re-renders)
          const previousPosition = state.currentPosition;
          const hasPositionChanged = !previousPosition || 
            previousPosition.coords.latitude !== position.coords.latitude ||
            previousPosition.coords.longitude !== position.coords.longitude;
          
          if (hasPositionChanged) {
            set({ currentPosition: position, previousPosition, lastUpdated: Date.now(), permissionState: 'granted', loading: false, error: null, disabled: false });
          } else {
            // Position unchanged - just update timestamp and loading state
            set({ lastUpdated: Date.now(), permissionState: 'granted', loading: false, error: null, disabled: false });
          }
        } catch (error) {
          get().handleLocationError(error);
        }
      },

      // Actions
      requestLocation: async () => get().performLocationRequest(false),
      requestLocationWithRetry: async (maxAttempts?: number) => get().performLocationRequest(true, maxAttempts),

      // New action to handle graceful degradation
      handleLocationFailure: () => {
        const { locationService } = require('../services/locationService');
        const fallbackOptions = locationService.getFallbackOptions();
        
        set({ 
          loading: false,
          error: fallbackOptions.message,
          disabled: !locationService.isLocationAvailable()
        });
        
        return fallbackOptions;
      },
      
      setCurrentPosition: (position: GeolocationPosition) => {
        const state = get();
        set({ 
          currentPosition: position,
          previousPosition: state.currentPosition,
          lastUpdated: Date.now(),
          error: null 
        });
      },
      
      setPermissionState: (permissionState: PermissionState) => 
        set({ permissionState, error: null }),
      
      setLocationPreferences: (preferences: Partial<LocationPreferences>) => 
        set({ 
          ...preferences,
          error: null 
        }),
      
      clearLocation: () => set({ 
        currentPosition: null,
        previousPosition: null,
        lastUpdated: null,
        error: null 
      }),
      
      resetPermissions: () => set({ 
        permissionState: null,
        error: null 
      }),
      
      clearError: () => set({ error: null }),
      
      setDisabled: (disabled: boolean) => set({ disabled, error: null }),
    }),
    {
      name: 'location-store',
      // Only persist preferences, not GPS data or permission state
      partialize: (state) => ({
        enableAutoLocation: state.enableAutoLocation,
        locationAccuracy: state.locationAccuracy,
        cacheTimeout: state.cacheTimeout,
        distanceThreshold: state.distanceThreshold,
      }),
    }
  )
);