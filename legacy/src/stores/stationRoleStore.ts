/**
 * StationRoleStore - Manages station role calculations and caching
 * 
 * Calculates and caches station roles (Start, End, Turnaround, Standard) for each route
 * based on trip data and stop sequences. Uses Zustand persist middleware for localStorage caching.
 * 
 * @module stationRoleStore
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StationRole, TripStationRoles, RouteStationRoles } from '../utils/station/stationRoleUtils';
import { calculateRolesForTrip, aggregateRolesToRoute } from '../utils/station/stationRoleUtils';
import { useTripStore } from './tripStore';
import { useStopTimeStore } from './stopTimeStore';
import { API_CACHE_DURATION } from '../utils/core/constants';

/**
 * Station role store interface
 * Manages cached station role data with automatic persistence
 */
interface StationRoleStore {
  // Cached data: nested Map structure for O(1) lookups
  // Map<routeId, Map<stationId, StationRole>>
  stationRoles: Map<number, Map<number, StationRole>>;
  
  // Metadata
  lastCalculated: number | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  calculateStationRoles: () => Promise<void>;
  getStationRole: (routeId: number, stationId: number) => StationRole;
  invalidateCache: () => void;
  isDataFresh: (maxAgeMs?: number) => boolean;
}

/**
 * Default TTL for station role cache (24 hours, same as STATIC_DATA)
 */
const DEFAULT_CACHE_TTL = API_CACHE_DURATION.STATIC_DATA;

/**
 * Station role store with persistence
 * Caches station role calculations in localStorage with 24-hour TTL
 */
export const useStationRoleStore = create<StationRoleStore>()(
  persist(
    (set, get) => ({
      // Initial state
      stationRoles: new Map(),
      lastCalculated: null,
      loading: false,
      error: null,
      
      /**
       * Calculate station roles for all routes
       * 
       * Loads trip and stopTime data from respective stores, calculates roles
       * for each trip, aggregates to route level, and caches results.
       * Handles errors gracefully without crashing.
       * 
       * Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2, 8.3
       */
      calculateStationRoles: async () => {
        const currentState = get();
        
        // Avoid duplicate calculations if already loading
        if (currentState.loading) {
          return;
        }
        
        set({ loading: true, error: null });
        
        try {
          // Load trips and stopTimes from respective stores
          const trips = useTripStore.getState().trips;
          const stopTimes = useStopTimeStore.getState().stopTimes;
          
          // Validate data availability
          if (trips.length === 0) {
            console.warn('No trip data available for station role calculation');
            set({ 
              loading: false, 
              error: 'No trip data available',
              lastCalculated: Date.now() 
            });
            return;
          }
          
          if (stopTimes.length === 0) {
            console.warn('No stop_times data available for station role calculation');
            set({ 
              loading: false, 
              error: 'No stop_times data available',
              lastCalculated: Date.now() 
            });
            return;
          }
          
          // Calculate roles for each trip
          const tripRoles: TripStationRoles[] = [];
          
          for (const trip of trips) {
            try {
              const roles = calculateRolesForTrip(trip, stopTimes);
              tripRoles.push(roles);
            } catch (error) {
              // Log warning but continue with other trips (Requirement 8.2)
              console.warn(`Failed to calculate roles for trip ${trip.trip_id}:`, error);
            }
          }
          
          // Group trip roles by route
          const tripsByRoute = new Map<number, TripStationRoles[]>();
          for (const tripRole of tripRoles) {
            const existing = tripsByRoute.get(tripRole.routeId) || [];
            existing.push(tripRole);
            tripsByRoute.set(tripRole.routeId, existing);
          }
          
          // Aggregate to route level
          const newStationRoles = new Map<number, Map<number, StationRole>>();
          
          for (const [routeId, routeTripRoles] of tripsByRoute.entries()) {
            try {
              const routeRoles = aggregateRolesToRoute(routeTripRoles);
              newStationRoles.set(routeId, routeRoles.stations);
            } catch (error) {
              // Log warning but continue with other routes (Requirement 8.1)
              console.warn(`Failed to aggregate roles for route ${routeId}:`, error);
            }
          }
          
          set({
            stationRoles: newStationRoles,
            loading: false,
            error: null,
            lastCalculated: Date.now()
          });
        } catch (error) {
          // Handle calculation errors gracefully (Requirement 8.6)
          const errorMessage = error instanceof Error ? error.message : 'Failed to calculate station roles';
          console.error('Station role calculation failed:', error);
          
          set({
            loading: false,
            error: errorMessage
          });
        }
      },
      
      /**
       * Get station role for a specific route and station
       * 
       * O(1) lookup from cached data.
       * Defaults to 'standard' if not found.
       * 
       * Requirements: 1.4, 8.1
       * 
       * @param routeId - Route ID to lookup
       * @param stationId - Station ID to lookup
       * @returns Station role ('start', 'end', 'turnaround', or 'standard')
       */
      getStationRole: (routeId: number, stationId: number): StationRole => {
        const { stationRoles } = get();
        
        // Lookup role (O(1) with nested Map)
        const routeRoles = stationRoles.get(routeId);
        if (!routeRoles) {
          return 'standard'; // Default if route not found (Requirement 8.1)
        }
        
        const role = routeRoles.get(stationId);
        return role || 'standard'; // Default if station not found (Requirement 1.4)
      },
      
      /**
       * Invalidate cache and trigger recalculation
       * 
       * Clears all cached data and recalculates station roles from fresh API data.
       * Should be called when trips or stop_times are refreshed.
       * 
       * Requirements: 5.5
       */
      invalidateCache: () => {
        set({
          stationRoles: new Map(),
          lastCalculated: null,
          error: null
        });
        
        // Trigger recalculation
        get().calculateStationRoles();
      },
      
      /**
       * Check if cached data is fresh
       * 
       * Uses 24-hour TTL (same as STATIC_DATA constant).
       * Returns false if no data has been calculated yet.
       * 
       * Requirements: 5.3, 5.4
       * 
       * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
       * @returns true if data is fresh, false otherwise
       */
      isDataFresh: (maxAgeMs: number = DEFAULT_CACHE_TTL): boolean => {
        const { lastCalculated } = get();
        
        if (lastCalculated === null) {
          return false;
        }
        
        const age = Date.now() - lastCalculated;
        return age < maxAgeMs;
      },
    }),
    {
      name: 'station-role-store',
      // Serialize Maps for localStorage
      partialize: (state) => ({
        stationRoles: Array.from(state.stationRoles.entries()).map(([routeId, stationMap]) => [
          routeId,
          Array.from(stationMap.entries())
        ]),
        lastCalculated: state.lastCalculated,
        error: state.error
      }),
      // Deserialize Maps from localStorage
      merge: (persistedState: any, currentState) => {
        const stationRoles = new Map<number, Map<number, StationRole>>();
        if (persistedState?.stationRoles) {
          for (const [routeId, stationEntries] of persistedState.stationRoles) {
            stationRoles.set(routeId, new Map(stationEntries));
          }
        }
        
        return {
          ...currentState,
          stationRoles,
          lastCalculated: persistedState?.lastCalculated || null,
          error: persistedState?.error || null
        };
      }
    }
  )
);
