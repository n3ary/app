// TripStore - Clean state management with raw API data
// No cross-store dependencies, simple loading and error states
// Enhanced with refresh functionality and local storage persistence

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TranzyTripResponse } from '../types/rawTranzyApi';
import { API_CACHE_DURATION } from '../utils/core/constants';
import { createRefreshMethod, createFreshnessChecker, createLoadMethod } from '../utils/core/storeUtils';

interface TripStore {
  // Raw API data - no transformations
  trips: TranzyTripResponse[];
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  
  // Performance optimization: track last update time
  lastUpdated: number | null;
  
  // Separate API fetch timestamp for freshness checks
  lastApiFetch: number | null;
  
  // Actions
  loadTrips: () => Promise<void>;
  refreshData: () => Promise<void>;
  clearTrips: () => void;
  clearError: () => void;
  
  // Performance helper: check if data is fresh
  isDataFresh: (maxAgeMs?: number) => boolean;
  
  // Helper to get trip by trip_id
  getTripById: (tripId: string) => TranzyTripResponse | undefined;
  
}

// Create shared utilities for this store
const loadMethod = createLoadMethod('trips', async () => {
  const { tripService } = await import('../services/tripService');
  return tripService.getTrips();
});
const refreshMethod = createRefreshMethod(
  'trip',
  'trips', 
  () => import('../services/tripService'),
  'getTrips',
  { preserveOnEmpty: true }
);
const freshnessChecker = createFreshnessChecker(API_CACHE_DURATION.STATIC_DATA);

export const useTripStore = create<TripStore>()(
  persist(
    (set, get) => ({
      // Raw API data
      trips: [],
      loading: false,
      error: null,
      lastUpdated: null,
      lastApiFetch: null,
      
      // Actions
      loadTrips: async () => {
        await loadMethod(get, set);
      },
      
      refreshData: async () => {
        await refreshMethod(get, set);
      },
      
      clearTrips: () => set({ trips: [], error: null, lastUpdated: null, lastApiFetch: null }),
      clearError: () => set({ error: null }),
      
      // Performance helper: check if data is fresh (default 24 hours for general data)
      isDataFresh: (maxAgeMs = API_CACHE_DURATION.STATIC_DATA) => {
        return freshnessChecker(get, maxAgeMs);
      },

      // Helper to get trip by trip_id
      getTripById: (tripId: string) => {
        const { trips } = get();
        return trips.find(trip => trip.trip_id === tripId);
      },
      
      
    }),
    {
      name: 'trip-store',
      // Simple storage for trip data
      partialize: (state) => ({
        trips: state.trips,
        lastUpdated: state.lastUpdated,
        error: state.error
      }),
    }
  )
);