/**
 * String Constants
 * Centralized string literals used throughout the application
 */

export const CONFIDENCE_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

export const CONNECTION_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  ERROR: 'error'
} as const;

export const PERMISSION_STATES = {
  GRANTED: 'granted',
  DENIED: 'denied',
  PROMPT: 'prompt',
  DISABLED: 'disabled'
} as const;

export const LOCATION_STATUS = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  DISABLED: 'disabled'
} as const;

export const ARRIVAL_METHODS = {
  ROUTE_SHAPE: 'route_shape',
  STOP_SEGMENTS: 'stop_segments',
  ROUTE_PROJECTION: 'route_projection',
  OFF_ROUTE: 'off_route',
  FALLBACK: 'fallback'
} as const;

export const LOCATION_ACCURACY = {
  HIGH: 'high',
  BALANCED: 'balanced',
  LOW: 'low'
} as const;

// Type exports for use in other files
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[keyof typeof CONFIDENCE_LEVELS];
export type ConnectionStatus = typeof CONNECTION_STATUS[keyof typeof CONNECTION_STATUS];
export type PermissionState = typeof PERMISSION_STATES[keyof typeof PERMISSION_STATES];
export type LocationStatus = typeof LOCATION_STATUS[keyof typeof LOCATION_STATUS];
export type ArrivalMethod = typeof ARRIVAL_METHODS[keyof typeof ARRIVAL_METHODS];
export type LocationAccuracyLevel = typeof LOCATION_ACCURACY[keyof typeof LOCATION_ACCURACY];