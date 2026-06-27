// StationStore - Clean state management with raw API data
// No cross-store dependencies, simple loading and error states
// Enhanced with refresh functionality and local storage persistence

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TranzyStopResponse } from '../types/rawTranzyApi';
import { API_CACHE_DURATION } from '../utils/core/constants';
import { createRefreshMethod, createFreshnessChecker, createLoadMethod } from '../utils/core/storeUtils';

interface StationStore {
  // Raw API data - no transformations
  stops: TranzyStopResponse[];
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  
  // Performance optimization: track last update time
  lastUpdated: number | null;
  
  // Separate API fetch timestamp for freshness checks
  lastApiFetch: number | null;
  
  // Actions
  loadStops: () => Promise<void>;
  refreshData: () => Promise<void>;
  clearStops: () => void;
  clearError: () => void;
  
  // Performance helper: check if data is fresh
  isDataFresh: (maxAgeMs?: number) => boolean;
}

// Create shared utilities for this store
const loadMethod = createLoadMethod('stops', async () => {
  const { stationService } = await import('../services/stationService');
  return stationService.getStops();
});
const refreshMethod = createRefreshMethod(
  'station',
  'stops', 
  () => import('../services/stationService'),
  'getStops',
  { preserveOnEmpty: true }
);
const freshnessChecker = createFreshnessChecker(API_CACHE_DURATION.STATIC_DATA);

export const useStationStore = create<StationStore>()(
  persist(
    (set, get) => ({
      // Raw API data
      stops: [],
      
      // Simple states
      loading: false,
      error: null,
      lastUpdated: null,
      lastApiFetch: null,
      
      // Actions
      loadStops: async () => {
        await loadMethod(get, set);
      },
      
      refreshData: async () => {
        await refreshMethod(get, set);
      },
      
      clearStops: () => set({ stops: [], error: null, lastUpdated: null, lastApiFetch: null }),
      clearError: () => set({ error: null }),
      
      // Performance helper: check if data is fresh (default 24 hours for general data)
      isDataFresh: (maxAgeMs = API_CACHE_DURATION.STATIC_DATA) => {
        return freshnessChecker(get, maxAgeMs);
      },
    }),
    {
      name: 'station-store',
      // Simple storage for station data
      partialize: (state) => ({
        stops: state.stops,
        lastUpdated: state.lastUpdated,
        error: state.error
      }),
    }
  )
);