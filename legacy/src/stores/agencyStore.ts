// AgencyStore - Clean state management for agency list caching
// No auto-refresh logic - cache persists indefinitely until cleared
// Cache is cleared when API key changes

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TranzyAgencyResponse } from '../types/rawTranzyApi';

interface AgencyStore {
  // Raw API data - no transformations
  agencies: TranzyAgencyResponse[];
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  
  // Cache tracking (no freshness check - indefinite cache)
  lastUpdated: number | null;
  
  // Actions
  loadAgencies: () => Promise<void>;
  setAgencies: (agencies: TranzyAgencyResponse[]) => void;
  clearAgencies: () => void;
  clearError: () => void;
}

export const useAgencyStore = create<AgencyStore>()(
  persist(
    (set, get) => ({
      // Raw API data
      agencies: [],
      loading: false,
      error: null,
      lastUpdated: null,
      
      // Actions
      loadAgencies: async () => {
        // Performance optimization: avoid duplicate requests if already loading
        const currentState = get();
        if (currentState.loading) {
          return;
        }
        
        // Use cached data if available (no freshness check - indefinite cache)
        if (currentState.agencies.length > 0) {
          return; // Use cached data
        }
        
        set({ loading: true, error: null });
        
        try {
          // Import service dynamically to avoid circular dependencies
          const { agencyService } = await import('../services/agencyService');
          const agencies = await agencyService.getAgencies();
          
          set({ 
            agencies, 
            loading: false, 
            error: null, 
            lastUpdated: Date.now() 
          });
        } catch (error) {
          set({ 
            loading: false, 
            error: error instanceof Error ? error.message : 'Failed to load agencies'
          });
        }
      },
      
      setAgencies: (agencies: TranzyAgencyResponse[]) => {
        set({ 
          agencies, 
          error: null, 
          lastUpdated: Date.now() 
        });
      },
      
      clearAgencies: () => set({ 
        agencies: [], 
        error: null, 
        lastUpdated: null 
      }),
      
      clearError: () => set({ error: null }),
    }),
    {
      name: 'agency-store',
      // Persist agencies and metadata to localStorage
      partialize: (state) => ({
        agencies: state.agencies,
        lastUpdated: state.lastUpdated,
        error: state.error
      }),
    }
  )
);
