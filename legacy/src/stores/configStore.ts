// ConfigStore - Clean state management with raw configuration data
// No cross-store dependencies, simple loading and error states

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ConfigStore {
  // Raw config data - using raw API field names
  apiKey: string | null;
  agency_id: number | null;
  home_location: { lat: number; lon: number } | null;
  work_location: { lat: number; lon: number } | null;
  theme: 'light' | 'dark' | 'auto' | null;
  /**
   * Whether to surface drop-off-only rows (vehicles that terminate at the
   * current station, so the user can't board) in station vehicle lists.
   *
   * Off by default: those rows are low value to a rider waiting at the
   * station. The Settings panel exposes a toggle for power users / debugging.
   */
  showDropOffOnly: boolean;
  
  // Simple loading and error states
  loading: boolean;
  error: string | null;
  success: string | null;
  
  // Actions
  setApiKey: (key: string) => void;
  setAgency: (agency_id: number) => void;
  setHomeLocation: (lat: number, lon: number) => void;
  setWorkLocation: (lat: number, lon: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  toggleTheme: () => void;
  setShowDropOffOnly: (show: boolean) => void;
  clearError: () => void;
  clearSuccess: () => void;
  validateApiKey: (apiKey: string) => Promise<void>;
  validateAndSave: (apiKey: string, agencyId: number) => Promise<void>;
  clearAgencyData: () => Promise<void>;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set, get) => ({
      // Raw config data
      apiKey: null,
      agency_id: null,
      home_location: null,
      work_location: null,
      theme: null,
      showDropOffOnly: false,
      
      // Simple states
      loading: false,
      error: null,
      success: null,
      
      // Actions
      setApiKey: (key: string) => {
        set({ apiKey: key, error: null, success: null });
      },
      
      setAgency: (agency_id: number) => {
        set({ agency_id, error: null, success: null });
        
        // Update favorites store with new agency context
        import('./favoritesStore').then(({ useFavoritesStore }) => {
          useFavoritesStore.getState().setCurrentAgency(agency_id);
        });
      },
      
      validateApiKey: async (apiKey: string) => {
        set({ loading: true, error: null, success: null });
        
        try {
          // Validate API key using standalone service function
          const { agencyService } = await import('../services/agencyService');
          const agencies = await agencyService.validateApiKey(apiKey);
          
          // Clear all agency-specific cached data before changing API key
          await get().clearAgencyData();
          
          // On success: save API key, clear agency_id, load agencies into agency store
          set({ 
            apiKey,
            agency_id: null, // Clear agency when API key changes
            loading: false,
            success: 'API key validated successfully'
          });
          
          // Update favorites store to clear agency context
          import('./favoritesStore').then(({ useFavoritesStore }) => {
            useFavoritesStore.getState().setCurrentAgency(null);
          });
          
          // Load agencies into agency store
          const { useAgencyStore } = await import('./agencyStore');
          useAgencyStore.getState().setAgencies(agencies);
          
        } catch (error) {
          // On error: set error state, throw to prevent navigation
          let errorMessage = 'Failed to validate API key';
          
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          
          set({ 
            loading: false, 
            error: errorMessage,
            success: null
          });
          
          throw error; // Re-throw to prevent navigation
        }
      },
      
      validateAndSave: async (apiKey: string, agencyId: number) => {
        set({ loading: true, error: null, success: null });
        
        try {
          // Validate using standalone service function
          const { routeService } = await import('../services/routeService');
          const isValid = await routeService.validateAgency(apiKey, agencyId);
          
          if (!isValid) {
            throw new Error('Invalid API key and agency combination');
          }
          
          // Check if agency is changing
          const currentState = get();
          const isAgencyChanging = currentState.agency_id !== agencyId;
          
          // Clear all agency-specific cached data if agency is changing
          if (isAgencyChanging) {
            await get().clearAgencyData();
          }
          
          // Save to store (triggers app context update)
          set({ 
            apiKey, 
            agency_id: agencyId,
            loading: false, 
            success: 'Configuration validated and saved successfully'
          });
          
          // Update favorites store with new agency context
          import('./favoritesStore').then(({ useFavoritesStore }) => {
            useFavoritesStore.getState().setCurrentAgency(agencyId);
          });
        } catch (error) {
          let errorMessage = 'Failed to validate configuration';
          
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          
          set({ 
            loading: false, 
            error: errorMessage,
            success: null
          });
          
          throw error; // Re-throw to prevent navigation
        }
      },
      
      clearAgencyData: async () => {
        // Clear all agency-specific data from all stores
        try {
          const { useRouteStore } = await import('./routeStore');
          const { useStationStore } = await import('./stationStore');
          const { useVehicleStore } = await import('./vehicleStore');
          const { useTripStore } = await import('./tripStore');
          const { useStopTimeStore } = await import('./stopTimeStore');
          const { useShapeStore } = await import('./shapeStore');
          
          // Clear all stores
          useRouteStore.getState().clearRoutes();
          useStationStore.getState().clearStops();
          useVehicleStore.getState().clearVehicles();
          useTripStore.getState().clearTrips();
          useStopTimeStore.getState().clearStopTimes();
          useShapeStore.getState().clearShapes();
          
          console.log('[ConfigStore] Cleared all agency-specific cached data');
        } catch (error) {
          console.error('[ConfigStore] Failed to clear agency data:', error);
        }
      },
      
      setHomeLocation: (lat: number, lon: number) => 
        set({ home_location: { lat, lon }, error: null, success: null }),
      setWorkLocation: (lat: number, lon: number) => 
        set({ work_location: { lat, lon }, error: null, success: null }),
      setTheme: (theme: 'light' | 'dark' | 'auto') => 
        set({ theme, error: null, success: null }),
      toggleTheme: () => 
        set((state) => ({ 
          theme: state.theme === 'dark' ? 'light' : 'dark', 
          error: null,
          success: null
        })),
      setShowDropOffOnly: (show: boolean) => set({ showDropOffOnly: show }),
      clearError: () => set({ error: null }),
      clearSuccess: () => set({ success: null }),
    }),
    {
      name: 'config-store',
    }
  )
);