// API status utility functions - icon, color, tooltip, and recommendations
import {
  CloudDone,
  WifiOff,
  SignalWifiConnectedNoInternet4,
} from '@mui/icons-material';

export const getApiIcon = (
  status: 'online' | 'offline' | 'error',
  networkOnline: boolean
) => {
  if (!networkOnline) return WifiOff;
  if (status === 'offline') return SignalWifiConnectedNoInternet4;
  return CloudDone;
};

export const getApiColor = (
  status: 'online' | 'offline' | 'error',
  networkOnline: boolean,
  responseTime: number | null
): 'success' | 'warning' | 'error' => {
  if (!networkOnline || status === 'error' || status === 'offline') {
    return 'error';
  }
  if (status === 'online' && responseTime && responseTime > 2000) {
    return 'warning';
  }
  return 'success';
};

export const getApiTooltip = (
  status: 'online' | 'offline' | 'error',
  networkOnline: boolean,
  responseTime: number | null
): string => {
  if (!networkOnline) {
    return 'No internet connection detected. Check your network settings and try again. Click for details.';
  }
  if (status === 'error') {
    return 'Transit data service is temporarily unavailable. This may affect real-time updates. Click for details.';
  }
  if (status === 'offline') {
    return 'Connected to network but no internet access. Check your connection or try a different network. Click for details.';
  }
  if (status === 'online') {
    if (responseTime && responseTime > 2000) {
      return 'Transit data service is responding slowly. Real-time updates may be delayed. Click for details.';
    }
    return 'Transit data service is working perfectly! Real-time updates are available. Click for details.';
  }
  return 'Connection status unknown. Click to check connectivity.';
};

export const getApiStatusText = (
  status: 'online' | 'offline' | 'error',
  networkOnline: boolean
): string => {
  if (!networkOnline) return 'No Internet';
  if (status === 'offline') return 'Network Limited';
  if (status === 'error') return 'Service Unavailable';
  if (status === 'online') return 'Connected';
  return 'Unknown';
};

export const getApiRecommendations = (
  status: 'online' | 'offline' | 'error',
  networkOnline: boolean,
  responseTime: number | null
): string[] => {
  if (!networkOnline) {
    return [
      'Check your internet connection',
      'Try connecting to a different network',
      'Restart your router or modem',
      'Contact your internet service provider'
    ];
  }
  if (status === 'offline') {
    return [
      'Check if other websites work',
      'Try using mobile data instead of WiFi',
      'Disable VPN if you\'re using one',
      'Clear your browser cache and cookies'
    ];
  }
  if (status === 'error') {
    return [
      'The transit data service is temporarily down',
      'Try refreshing the page in a few minutes',
      'Check if the issue persists',
      'Use cached data if available'
    ];
  }
  if (responseTime && responseTime > 2000) {
    return [
      'Service is slow but working',
      'Real-time updates may be delayed',
      'Consider using a faster internet connection',
      'The service should improve shortly'
    ];
  }
  return ['Your connection is working perfectly!'];
};