// useManualRefresh Hook - React hook for manual refresh functionality
// Provides reactive state management for refresh operations and network status

import { useState, useCallback, useEffect } from 'react';
import { type RefreshResult } from '../services/manualRefreshService';
import { useStatusStore } from '../stores/statusStore';
import { manualRefreshService } from '../services/manualRefreshService';

interface UseManualRefreshReturn {
  // State
  isRefreshing: boolean;
  isNetworkAvailable: boolean;
  lastRefreshResult: RefreshResult | null;
  
  // Actions - simplified to single refresh method
  refresh: () => Promise<RefreshResult>;
  
  // Status helpers
  canRefresh: boolean;
}

/**
 * Hook for managing manual refresh operations
 * Provides reactive state and actions for triggering data refresh
 */
export function useManualRefresh(): UseManualRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshResult, setLastRefreshResult] = useState<RefreshResult | null>(null);
  
  // Subscribe to network status from StatusStore
  const networkOnline = useStatusStore(state => state.networkOnline);
  const apiStatus = useStatusStore(state => state.apiStatus);
  
  const isNetworkAvailable = networkOnline && apiStatus !== 'offline';
  const canRefresh = isNetworkAvailable && !isRefreshing;

  // Single refresh method - stores handle their own freshness logic
  const refresh = useCallback(async (): Promise<RefreshResult> => {
    const result = await manualRefreshService.refreshData();
    setLastRefreshResult(result);
    return result;
  }, []);

  // Sync with service state
  useEffect(() => {
    const checkServiceState = () => {
      const serviceIsRefreshing = manualRefreshService.isRefreshInProgress();
      setIsRefreshing(serviceIsRefreshing);
    };

    // Check immediately
    checkServiceState();

    // Set up periodic check to stay in sync (reduced frequency)
    const interval = setInterval(checkServiceState, 500); // 500ms instead of 100ms

    return () => clearInterval(interval);
  }, []);

  return {
    // State
    isRefreshing,
    isNetworkAvailable,
    lastRefreshResult,
    
    // Actions
    refresh,
    
    // Status helpers
    canRefresh
  };
}