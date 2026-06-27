// FavoritesStore - Clean state management for favorite routes per agency
// Stores favorites separately for each agency to maintain context when switching
// Graceful handling of localStorage failures with in-memory fallback

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createFreshnessChecker } from '../utils/core/storeUtils';
import { API_CACHE_DURATION } from '../utils/core/constants';

interface FavoritesStore {
  // Core state - Map of agency_id to favorite route IDs
  favoritesByAgency: Record<string, string[]>;
  
  // Current agency context (set externally when agency changes)
  currentAgencyId: string | null;
  
  // Performance optimization: track last update time
  lastUpdated: number | null;
  
  // Actions
  setCurrentAgency: (agencyId: number | null) => void;
  addFavorite: (routeId: string) => void;
  removeFavorite: (routeId: string) => void;
  toggleFavorite: (routeId: string) => void;
  isFavorite: (routeId: string) => boolean;
  clearFavorites: () => void;
  refreshData: () => Promise<void>;
  
  // Utilities
  getFavoriteCount: () => number;
  getFavoriteRouteIds: () => string[];
  
  // Performance helper: check if data is fresh
  isDataFresh: (maxAgeMs?: number) => boolean;
  
  // Local storage integration
}

// Create shared utilities for this store
const freshnessChecker = createFreshnessChecker(API_CACHE_DURATION.FAVORITES);

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      // Core state - per-agency favorites
      favoritesByAgency: {},
      currentAgencyId: null,
      lastUpdated: Date.now(), // Initialize with current time
      
      // Set current agency context
      setCurrentAgency: (agencyId: number | null) => {
        set({ currentAgencyId: agencyId ? String(agencyId) : null });
      },
      
      // Actions
      addFavorite: (routeId: string) => {
        const { currentAgencyId } = get();
        
        // Require agency ID to be set
        if (!currentAgencyId) {
          console.error('[FavoritesStore] Cannot add favorite: agency ID not set');
          return;
        }
        
        const agencyKey = currentAgencyId;
        
        set((state) => {
          const currentFavorites = state.favoritesByAgency[agencyKey] || [];
          
          // Avoid duplicates
          if (currentFavorites.includes(routeId)) {
            return state;
          }
          
          return { 
            favoritesByAgency: {
              ...state.favoritesByAgency,
              [agencyKey]: [...currentFavorites, routeId]
            },
            lastUpdated: Date.now()
          };
        });
      },
      
      removeFavorite: (routeId: string) => {
        const { currentAgencyId } = get();
        
        // Require agency ID to be set
        if (!currentAgencyId) {
          console.error('[FavoritesStore] Cannot remove favorite: agency ID not set');
          return;
        }
        
        const agencyKey = currentAgencyId;
        
        set((state) => {
          const currentFavorites = state.favoritesByAgency[agencyKey] || [];
          
          return {
            favoritesByAgency: {
              ...state.favoritesByAgency,
              [agencyKey]: currentFavorites.filter(id => id !== routeId)
            },
            lastUpdated: Date.now()
          };
        });
      },
      
      toggleFavorite: (routeId: string) => {
        const { isFavorite, addFavorite, removeFavorite } = get();
        if (isFavorite(routeId)) {
          removeFavorite(routeId);
        } else {
          addFavorite(routeId);
        }
      },
      
      isFavorite: (routeId: string) => {
        const { currentAgencyId, favoritesByAgency } = get();
        
        // Require agency ID to be set
        if (!currentAgencyId) {
          return false;
        }
        
        const agencyKey = currentAgencyId;
        const currentFavorites = favoritesByAgency[agencyKey] || [];
        return currentFavorites.includes(routeId);
      },
      
      clearFavorites: () => {
        const { currentAgencyId } = get();
        
        // Require agency ID to be set
        if (!currentAgencyId) {
          console.error('[FavoritesStore] Cannot clear favorites: agency ID not set');
          return;
        }
        
        const agencyKey = currentAgencyId;
        
        set((state) => ({
          favoritesByAgency: {
            ...state.favoritesByAgency,
            [agencyKey]: []
          },
          lastUpdated: Date.now()
        }));
      },
      
      refreshData: async () => {
        // Favorites don't need external refresh - they're user-managed
        // This method exists for API consistency but is a no-op
        set({ lastUpdated: Date.now() });
      },
      
      // Utilities
      getFavoriteCount: () => {
        const { currentAgencyId, favoritesByAgency } = get();
        
        // Require agency ID to be set
        if (!currentAgencyId) {
          return 0;
        }
        
        const agencyKey = currentAgencyId;
        const currentFavorites = favoritesByAgency[agencyKey] || [];
        return currentFavorites.length;
      },
      
      getFavoriteRouteIds: () => {
        const { currentAgencyId, favoritesByAgency } = get();
        
        // Require agency ID to be set
        if (!currentAgencyId) {
          return [];
        }
        
        const agencyKey = currentAgencyId;
        const currentFavorites = favoritesByAgency[agencyKey] || [];
        return [...currentFavorites]; // Return copy to prevent mutations
      },
      
      // Performance helper: check if data is fresh
      isDataFresh: (maxAgeMs = API_CACHE_DURATION.FAVORITES) => {
        return freshnessChecker(get, maxAgeMs);
      },
      
      // Local storage integration methods
      
    }),
    {
      name: 'favorites-store',
      // Simple storage - no custom serialization needed
      partialize: (state) => ({
        favoritesByAgency: state.favoritesByAgency,
        currentAgencyId: state.currentAgencyId,
        lastUpdated: state.lastUpdated,
      }),
    }
  )
);
