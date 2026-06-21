// ManualRefreshButton - Color-coded refresh button
// Integrates with Data Freshness Monitor and Manual Refresh System

import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { IconButton, Box, CircularProgress } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { getDataFreshnessMonitor, type ApiFreshnessStatus } from '../../../utils/core/apiFreshnessMonitor';
import { automaticRefreshService } from '../../../services/automaticRefreshService';
import { manualRefreshService } from '../../../services/manualRefreshService';
import { useConfigStore } from '../../../stores/configStore';
import { useStatusStore } from '../../../stores/statusStore';
import { useVehicleStore } from '../../../stores/vehicleStore';
import { API_FETCH_FRESHNESS_THRESHOLDS, MANUAL_REFRESH_DEBOUNCE_MS } from '../../../utils/core/constants';

interface ManualRefreshButtonProps {
  className?: string;
  disabled?: boolean;
}

/**
 * Manual Refresh Button Component
 * 
 * Features:
 * - Color-coded status indicator (green for fresh, red for stale)
 * - Loading state during refresh operations
 * - Integrates with Material-UI design system
 * - Prevents concurrent refresh operations
 */
export const ManualRefreshButton: FC<ManualRefreshButtonProps> = ({
  className,
  disabled = false
}) => {
  const [freshnessStatus, setFreshnessStatus] = useState<ApiFreshnessStatus>({
    status: 'stale',
    vehicleApiAge: Infinity,
    staticApiAge: Infinity,
    isRefreshing: false,
    nextAutoRefreshIn: 0,
    lastApiFetchTime: null
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  // Local busy state for the in-debounce "predict only" tap (no API call, so it
  // does not show up in manualRefreshService.isRefreshInProgress()).
  const [isPredicting, setIsPredicting] = useState(false);

  // Subscribe to freshness monitor for fresh/stale status
  useEffect(() => {
    const monitor = getDataFreshnessMonitor();
    
    // Get initial status
    const initialStatus = monitor.calculateApiFreshness();
    setFreshnessStatus(initialStatus);
    
    // Subscribe to changes
    const unsubscribe = monitor.subscribeToChanges((status) => {
      setFreshnessStatus(status);
    });

    return unsubscribe;
  }, []);

  // Poll refresh status from manualRefreshService
  useEffect(() => {
    const checkRefreshStatus = () => {
      const refreshing = manualRefreshService.isRefreshInProgress();
      setIsRefreshing(refreshing);
    };

    // Check immediately
    checkRefreshStatus();

    // Poll every 100ms
    const interval = setInterval(checkRefreshStatus, 100);

    return () => clearInterval(interval);
  }, []);

  /**
   * Manual refresh: an explicit tap should always do something useful.
   *   - OUTSIDE the debounce window (vehicle data is older) -> force a real
   *     fetch and reset the auto-refresh cadence.
   *   - INSIDE the window (a fetch would just be skipped) -> recompute
   *     predictions so the tap still moves vehicles, without spending an API
   *     call (quota-friendly).
   */
  const handleManualRefresh = async () => {
    // Prevent concurrent operations
    if (isRefreshing || isPredicting || disabled) {
      return;
    }

    const lastApiFetch = useVehicleStore.getState().lastApiFetch;
    const vehicleAge = lastApiFetch ? Date.now() - lastApiFetch : Infinity;
    const outsideDebounce = vehicleAge >= MANUAL_REFRESH_DEBOUNCE_MS;

    if (outsideDebounce) {
      console.log('[Manual Refresh] User tap -> force fetch');
      try {
        await automaticRefreshService.triggerManualRefresh(true);
      } catch (error) {
        console.warn('Manual refresh encountered errors:', error);
      }
    } else {
      console.log('[Manual Refresh] User tap within debounce -> prediction update');
      setIsPredicting(true);
      try {
        await automaticRefreshService.triggerPredictionUpdate();
      } catch (error) {
        console.warn('Manual prediction update failed:', error);
      } finally {
        setIsPredicting(false);
      }
    }
  };

  // Determine button color based on API fetch time and disabled conditions
  const getButtonColor = (): 'success' | 'warning' | 'error' | 'default' => {
    // Get store states for disabled state checks
    const configState = useConfigStore.getState();
    const statusState = useStatusStore.getState();
    
    // Check disabled conditions first
    const isDisabled = 
      !configState.apiKey || 
      !configState.agency_id || 
      !statusState.networkOnline || 
      statusState.apiStatus !== 'online';
    
    if (isDisabled) {
      return 'default'; // Grey for disabled states
    }
    
    // If no API fetch has occurred yet
    if (freshnessStatus.lastApiFetchTime === null) {
      return 'default'; // Grey for initial state
    }
    
    // Calculate API fetch age in milliseconds
    const apiFetchAge = Date.now() - freshnessStatus.lastApiFetchTime;
    
    // Apply three-color thresholds
    if (apiFetchAge < API_FETCH_FRESHNESS_THRESHOLDS.FRESH) {
      return 'success'; // Green: < 1 minute
    } else if (apiFetchAge < API_FETCH_FRESHNESS_THRESHOLDS.WARNING) {
      return 'warning'; // Yellow: 1-3 minutes
    } else {
      return 'error'; // Red: > 3 minutes
    }
  };

  const buttonColor = getButtonColor();
  const busy = isRefreshing || isPredicting;

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <IconButton
        className={className}
        color={buttonColor}
        onClick={handleManualRefresh}
        disabled={disabled || busy}
        aria-label="Manual refresh data"
        size="small"
        sx={{
          transition: 'color 0.2s ease-in-out',
        }}
      >
        {busy ? (
          <CircularProgress
            size={24}
            color={buttonColor === 'default' ? 'inherit' : buttonColor}
            sx={{
              width: '24px !important',
              height: '24px !important',
            }}
          />
        ) : (
          <RefreshIcon />
        )}
      </IconButton>
    </Box>
  );
};
