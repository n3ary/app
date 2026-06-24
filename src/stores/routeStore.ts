// RouteStore - Clean state management with raw API data
// Standardized with Zustand persist middleware for consistency

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TranzyRouteResponse } from '../types/rawTranzyApi';
import { API_CACHE_DURATION } from '../utils/core/constants';
import { createRefreshMethod, createFreshnessChecker, createLoadMethod } from '../utils/core/storeUtils';

interface RouteStore {
  // Raw API data - no transformations
  routes: TranzyRouteResponse[];
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  
  // Performance optimization: track last update time
  lastUpdated: number | null;
  
  // Separate API fetch timestamp for freshness checks
  lastApiFetch: number | null;
  
  // Actions
  loadRoutes: () => Promise<void>;
  refreshData: () => Promise<void>;
  clearRoutes: () => void;
  clearError: () => void;
  
  // Performance helper: check if data is fresh
  isDataFresh: (maxAgeMs?: number) => boolean;
}

// Create shared utilities for this store
const loadMethod = createLoadMethod('routes', async () => {
  const { routeService } = await import('../services/routeService');
  return routeService.getRoutes();
});
const refreshMethod = createRefreshMethod(
  'route',
  'routes', 
  () => import('../services/routeService'),
  'getRoutes',
  { preserveOnEmpty: true }
);
const freshnessChecker = createFreshnessChecker(API_CACHE_DURATION.STATIC_DATA);

export const useRouteStore = create<RouteStore>()(
  persist(
    (set, get) => ({
      // Raw API data
      routes: [],
      loading: false,
      error: null,
      lastUpdated: null,
      lastApiFetch: null,
      
      // Actions
      loadRoutes: async () => {
        await loadMethod(get, set);
      },
      
      refreshData: async () => {
        await refreshMethod(get, set);
      },
      
      clearRoutes: () => set({ routes: [], error: null, lastUpdated: null, lastApiFetch: null }),
      clearError: () => set({ error: null }),
      
      // Performance helper: check if data is fresh (default from constants)
      isDataFresh: (maxAgeMs = API_CACHE_DURATION.STATIC_DATA) => {
        return freshnessChecker(get, maxAgeMs);
      },
    }),
    {
      name: 'route-store',
      partialize: (state) => ({
        routes: state.routes,
        lastUpdated: state.lastUpdated,
        error: state.error
      }),
    }
  )
);