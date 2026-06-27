import { useEffect } from 'react';
import { useLocationStore } from '../stores/locationStore';

/**
 * Custom hook to automatically request location on app start and when returning from background
 */
export const useAutoLocation = () => {
  const { requestLocation } = useLocationStore();

  useEffect(() => {
    // Request location immediately when hook mounts (app start)
    requestLocation();

    // Handle visibility changes - request location when coming back to foreground
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Browser came back to foreground - request location once
        requestLocation();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestLocation]);
};