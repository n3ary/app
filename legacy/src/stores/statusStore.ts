// StatusStore - Lightweight aggregated API status from actual service calls
// Enhanced with network event handling for real-time updates

import { create } from 'zustand';
import { apiStatusTracker } from '../services/error';

type ApiStatus = 'online' | 'offline' | 'error';

interface StatusStore {
  // Minimal state
  apiStatus: ApiStatus;
  networkOnline: boolean;
  lastApiCheck: number | null;
  responseTime: number | null;
  consecutiveFailures: number;
  
  // Actions
  updateFromApiCall: (success: boolean, responseTime?: number, operation?: string) => void;
  refreshStatus: () => void;
  setNetworkStatus: (online: boolean) => void;
}

export const useStatusStore = create<StatusStore>()((set, get) => ({
  // Initial state - start optimistic until proven otherwise
  apiStatus: 'online',
  networkOnline: navigator.onLine,
  lastApiCheck: null,
  responseTime: null,
  consecutiveFailures: 0,
  
  // Update status from actual API calls
  updateFromApiCall: (success: boolean, responseTime?: number, operation?: string) => {
    const timestamp = Date.now();
    const currentNetworkStatus = navigator.onLine;
    
    if (success && responseTime) {
      set({ 
        apiStatus: 'online',
        networkOnline: currentNetworkStatus,
        lastApiCheck: timestamp,
        responseTime,
        consecutiveFailures: 0
      });
    } else {
      const state = get();
      const newFailures = state.consecutiveFailures + 1;
      
      // Hierarchical logic: no network = offline, otherwise determine by failure count
      let newStatus: ApiStatus = 'error';
      if (!currentNetworkStatus) {
        newStatus = 'offline';
      } else if (newFailures < 3) {
        newStatus = 'error'; // Show error immediately on API failure when network is available
      }
      
      set({ 
        apiStatus: newStatus,
        networkOnline: currentNetworkStatus,
        lastApiCheck: timestamp,
        responseTime: null,
        consecutiveFailures: newFailures
      });
    }
  },
  
  // Refresh status from tracker
  refreshStatus: () => {
    const status = apiStatusTracker.getStatus();
    const responseTime = apiStatusTracker.getLastResponseTime();
    const lastCheck = apiStatusTracker.getLastCheckTime();
    const currentNetworkStatus = navigator.onLine;
    
    // Hierarchical logic: network status overrides API status
    let finalApiStatus = status;
    if (!currentNetworkStatus) {
      finalApiStatus = 'offline';
    }
    
    set({ 
      apiStatus: finalApiStatus,
      networkOnline: currentNetworkStatus,
      responseTime,
      lastApiCheck: lastCheck,
      consecutiveFailures: apiStatusTracker.consecutiveFailures
    });
  },

  // Set network status (for immediate network event updates)
  setNetworkStatus: (online: boolean) => {
    const state = get();
    
    // Hierarchical logic: if network goes offline, API must be offline too
    let newApiStatus = state.apiStatus;
    if (!online) {
      newApiStatus = 'offline';
    } else if (online && state.apiStatus === 'offline' && state.consecutiveFailures === 0) {
      // Network came back online and we haven't had API failures - return to optimistic online
      newApiStatus = 'online';
    }
    
    set({ 
      networkOnline: online,
      apiStatus: newApiStatus,
      lastApiCheck: Date.now()
    });
  }
}));