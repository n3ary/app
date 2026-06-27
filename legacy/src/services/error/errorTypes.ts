// Error type definitions and constants
// Centralized error types for consistent error handling across the application

// Re-export common retry configuration
export type { RetryConfig } from '../../types/common';
export { DEFAULT_RETRY_CONFIG } from '../../types/common';

/**
 * Location-specific error types and messages
 */
export const LocationErrorTypes = {
  PERMISSION_DENIED: 'permission_denied',
  POSITION_UNAVAILABLE: 'position_unavailable', 
  TIMEOUT: 'timeout',
  NOT_SUPPORTED: 'not_supported',
  NETWORK_ERROR: 'network_error',
  RETRY_EXHAUSTED: 'retry_exhausted'
} as const;

export type LocationErrorType = typeof LocationErrorTypes[keyof typeof LocationErrorTypes];

/**
 * Location-specific error information
 * Extends base error with location-specific context and retry capability
 */
export interface LocationError {
  /** Geolocation API error code */
  code: number;
  /** Human-readable error message */
  message: string;
  /** Categorized error type for handling logic */
  type: LocationErrorType;
  /** Whether this error can be retried */
  retryable: boolean;
}

/**
 * API call result tracking for status aggregation
 * Used to monitor API performance and reliability
 */
export interface ApiCallResult {
  /** Whether the API call completed successfully */
  success: boolean;
  /** Response time in milliseconds */
  responseTime: number;
  /** Timestamp when the call was made */
  timestamp: number;
  /** Name/type of the API operation */
  operation: string;
}