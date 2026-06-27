// Status toast message helpers - simplified, fast-to-read messages
import type { PermissionState, LocationAccuracyLevel } from '../../types/location';

interface ToastMessage {
  message: string;
  severity: 'success' | 'warning' | 'error' | 'info';
}

/**
 * Get GPS status toast message
 * Simplified for quick reading - no recommendations, just status
 */
export const getGpsToastMessage = (
  status: 'available' | 'unavailable' | 'disabled',
  accuracy: LocationAccuracyLevel | null,
  permissionState: PermissionState | null
): ToastMessage => {
  // Permission denied
  if (permissionState === 'denied') {
    return {
      message: 'Location blocked. Enable in browser settings.',
      severity: 'error'
    };
  }

  // No permission yet
  if (!permissionState || permissionState === 'prompt') {
    return {
      message: 'Location permission needed. Click to enable.',
      severity: 'warning'
    };
  }

  // Available - show accuracy level
  if (status === 'available') {
    const accuracyText = accuracy ? ` (${accuracy} accuracy)` : '';
    return {
      message: `Location active${accuracyText}`,
      severity: 'success'
    };
  }

  // Unavailable
  return {
    message: 'Location unavailable. Check device settings.',
    severity: 'error'
  };
};

/**
 * Get API status toast message
 * Simplified for quick reading - just the essential info
 */
export const getApiToastMessage = (
  status: 'online' | 'offline' | 'error',
  networkOnline: boolean,
  responseTime: number | null
): ToastMessage => {
  // No network
  if (!networkOnline) {
    return {
      message: 'No internet. Check your connection.',
      severity: 'error'
    };
  }

  // Network but no API
  if (status === 'offline') {
    return {
      message: 'Connected but no internet access.',
      severity: 'error'
    };
  }

  // API error
  if (status === 'error') {
    return {
      message: 'Transit service unavailable. Try again later.',
      severity: 'error'
    };
  }

  // Online - check response time
  if (status === 'online') {
    if (responseTime && responseTime > 2000) {
      return {
        message: `Connected (slow: ${responseTime}ms)`,
        severity: 'warning'
      };
    }
    return {
      message: responseTime ? `Connected (${responseTime}ms)` : 'Connected',
      severity: 'success'
    };
  }

  return {
    message: 'Connection status unknown',
    severity: 'info'
  };
};
