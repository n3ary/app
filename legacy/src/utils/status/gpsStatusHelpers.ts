// GPS status utility functions - icon, color, tooltip, and recommendations
import {
  GpsFixed,
  GpsNotFixed,
  GpsOff,
  LocationDisabled,
} from '@mui/icons-material';
import type { PermissionState, LocationAccuracyLevel } from '../../types/location';

export const getGpsIcon = (
  status: 'available' | 'unavailable' | 'disabled',
  accuracy: LocationAccuracyLevel | null,
  permissionState: PermissionState | null
) => {
  if (permissionState === 'denied') return LocationDisabled;
  if (status === 'disabled') return LocationDisabled;
  if (status === 'unavailable') return GpsOff;
  if (status === 'available') {
    if (accuracy === 'low') return GpsNotFixed;
    return GpsFixed;
  }
  return GpsOff;
};

export const getGpsColor = (
  status: 'available' | 'unavailable' | 'disabled',
  accuracy: LocationAccuracyLevel | null,
  permissionState: PermissionState | null
): 'success' | 'warning' | 'error' => {
  if (permissionState === 'denied' || status === 'disabled' || status === 'unavailable') {
    return 'error';
  }
  if (status === 'available' && (accuracy === 'high' || accuracy === 'balanced')) {
    return 'success';
  }
  return 'warning';
};

export const getGpsTooltip = (
  status: 'available' | 'unavailable' | 'disabled',
  accuracy: LocationAccuracyLevel | null,
  permissionState: PermissionState | null
): string => {
  if (permissionState === 'denied') {
    return 'Location access denied. Click to learn how to enable location services in your browser settings.';
  }
  if (status === 'disabled') {
    return 'Location services are turned off. Click to request location access.';
  }
  if (status === 'unavailable') {
    return 'GPS signal not found. Try moving to an area with better sky visibility. Click for details.';
  }
  if (status === 'available') {
    if (accuracy === 'high') return 'GPS working great! Accurate location detected. Click for details.';
    if (accuracy === 'balanced') return 'GPS working with moderate accuracy. Location may be approximate. Click for details.';
    if (accuracy === 'low') return 'GPS signal is weak. Location accuracy is limited. Try moving outdoors. Click for details.';
  }
  return 'GPS signal unavailable. Click to retry.';
};

export const getGpsStatusText = (
  status: 'available' | 'unavailable' | 'disabled',
  permissionState: PermissionState | null
): string => {
  if (permissionState === 'denied') return 'Permission Denied';
  if (status === 'disabled') return 'Disabled';
  if (status === 'unavailable') return 'Signal Unavailable';
  if (status === 'available') return 'Working';
  return 'Unknown';
};

export const getGpsRecommendations = (
  status: 'available' | 'unavailable' | 'disabled',
  accuracy: LocationAccuracyLevel | null,
  permissionState: PermissionState | null
): string[] => {
  if (permissionState === 'denied') {
    return [
      'Go to your browser settings',
      'Find "Location" or "Site permissions"',
      'Allow location access for this site',
      'Refresh the page'
    ];
  }
  if (status === 'disabled') {
    return [
      'Click "Allow" when prompted for location access',
      'Check your device location settings',
      'Ensure location services are enabled'
    ];
  }
  if (status === 'unavailable') {
    return [
      'Move to an area with better sky visibility',
      'Step away from tall buildings or indoor areas',
      'Wait a moment for GPS to acquire signal',
      'Try refreshing your location'
    ];
  }
  if (accuracy === 'low') {
    return [
      'Move outdoors for better GPS reception',
      'Wait for signal to improve',
      'Check if location services are set to high accuracy'
    ];
  }
  return ['Your GPS is working well!'];
};