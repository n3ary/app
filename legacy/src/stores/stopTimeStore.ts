// StopTimeStore - Clean state management with raw API data
// No cross-store dependencies, simple loading and error states
// Enhanced with refresh functionality and local storage persistence

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TranzyStopTimeResponse } from '../types/rawTranzyApi';
import { API_CACHE_DURATION } from '../utils/core/constants';
import { createRefreshMethod, createFreshnessChecker, createLoadMethod } from '../utils/core/storeUtils';
import { createCompressedStorage } from '../utils/core/compressedStorage';

interface StopTimeStore {
  // Raw API data - no transformations
  stopTimes: TranzyStopTimeResponse[];
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  
  // Performance optimization: track last update time
  lastUpdated: number | null;
  
  // Separate API fetch timestamp for freshness checks
  lastApiFetch: number | null;
  
  // Actions
  loadStopTimes: () => Promise<void>;
  refreshData: () => Promise<void>;
  clearStopTimes: () => void;
  clearError: () => void;
  
  // Performance helper: check if data is fresh
  isDataFresh: (maxAgeMs?: number) => boolean;
  
  // O(1) lookup by trip_id (lazy-built index)
  getStopTimesForTrip: (tripId: string) => TranzyStopTimeResponse[];
  
}

// Lazy-built trip_id → stopTimes index for O(1) lookups
let stopTimeIndex: Map<string, TranzyStopTimeResponse[]> | null = null;
let indexBuiltFrom: TranzyStopTimeResponse[] | null = null;

function getOrBuildIndex(stopTimes: TranzyStopTimeResponse[]): Map<string, TranzyStopTimeResponse[]> {
  // Rebuild index only when the underlying data changes
  if (stopTimeIndex && indexBuiltFrom === stopTimes) return stopTimeIndex;
  
  const idx = new Map<string, TranzyStopTimeResponse[]>();
  for (const st of stopTimes) {
    let arr = idx.get(st.trip_id);
    if (!arr) {
      arr = [];
      idx.set(st.trip_id, arr);
    }
    arr.push(st);
  }
  // Pre-sort each trip's stops by sequence
  for (const arr of idx.values()) {
    arr.sort((a, b) => a.stop_sequence - b.stop_sequence);
  }
  stopTimeIndex = idx;
  indexBuiltFrom = stopTimes;
  return idx;
}

// Create shared utilities for this store
const loadMethod = createLoadMethod('stopTimes', async () => {
  const { tripService } = await import('../services/tripService');
  return tripService.getStopTimes();
});
const refreshMethod = createRefreshMethod(
  'trip',
  'stopTimes', 
  () => import('../services/tripService'),
  'getStopTimes',
  { preserveOnEmpty: true }
);
const freshnessChecker = createFreshnessChecker(API_CACHE_DURATION.STATIC_DATA);

export const useStopTimeStore = create<StopTimeStore>()(
  persist(
    (set, get) => ({
      // Raw API data
      stopTimes: [],
      loading: false,
      error: null,
      lastUpdated: null,
      lastApiFetch: null,
      
      // Actions
      loadStopTimes: async () => {
        await loadMethod(get, set);
      },
      
      refreshData: async () => {
        await refreshMethod(get, set);
      },
      
      clearStopTimes: () => {
        stopTimeIndex = null;
        indexBuiltFrom = null;
        set({ stopTimes: [], error: null, lastUpdated: null, lastApiFetch: null });
      },
      clearError: () => set({ error: null }),
      
      // Performance helper: check if data is fresh (default 24 hours for general data)
      isDataFresh: (maxAgeMs = API_CACHE_DURATION.STATIC_DATA) => {
        return freshnessChecker(get, maxAgeMs);
      },

      // O(1) lookup by trip_id using lazy-built index
      getStopTimesForTrip: (tripId: string) => {
        const { stopTimes } = get();
        if (stopTimes.length === 0) return [];
        const idx = getOrBuildIndex(stopTimes);
        return idx.get(tripId) || [];
      },
      
      
    }),
    {
      name: 'stop-time-store',
      storage: createJSONStorage(() => createCompressedStorage('[StopTimeStore]')),
      partialize: (state) => ({
        stopTimes: state.stopTimes,
        lastUpdated: state.lastUpdated,
        error: state.error
      }),
    }
  )
);