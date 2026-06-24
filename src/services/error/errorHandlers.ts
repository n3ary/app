// Core error processing and handling logic
// Processes different types of errors and converts them to user-friendly messages

import axios from 'axios';
import { LocationErrorTypes, type LocationError, type RetryConfig, DEFAULT_RETRY_CONFIG } from './errorTypes';

/**
 * Maps HTTP status codes to user-friendly error messages
 */
function getErrorMessageForStatus(status: number): string {
  switch (status) {
    case 401: return 'Invalid API key';
    case 403: return 'Access denied - check API key permissions';
    case 404: return 'Agency not found - check agency ID';
    default: return status >= 500 
      ? 'Server error - please try again later'
      : `API error: ${status}`;
  }
}

/**
 * Processes axios-like error objects with consistent logic
 */
function processAxiosError(errorObj: any): string {
  if (errorObj.response?.status) {
    return getErrorMessageForStatus(errorObj.response.status);
  }
  if (errorObj.code === 'NETWORK_ERROR' || !errorObj.response) {
    return 'Network error - check your connection';
  }
  return `API error: ${errorObj.response?.status || 'Unknown'}`;
}

/**
 * Handles API errors with consistent error messages and status tracking
 * Detects 401 errors and triggers navigation to settings for credential recovery
 */
export function handleApiError(error: unknown, operation: string): never {
  console.error(`Failed to ${operation}:`, error);
  
  // Record failure for status tracking (imported dynamically to avoid circular deps)
  import('./errorReporting').then(({ apiStatusTracker }) => {
    apiStatusTracker.recordFailure(operation);
  }).catch(() => {
    // Ignore import errors - status tracker may not be available
  });
  
  // Update status store if available
  if (typeof window !== 'undefined') {
    // Use dynamic import to avoid circular dependencies
    import('../../stores/statusStore').then(({ useStatusStore }) => {
      useStatusStore.getState().updateFromApiCall(false, undefined, operation);
    }).catch(() => {
      // Ignore import errors - status store may not be available
    });
  }
  
  // Detect 401 errors and trigger credential recovery
  let is401Error = false;
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    is401Error = true;
  } else if (error && typeof error === 'object' && 'response' in error) {
    const errorObj = error as any;
    if (errorObj.response?.status === 401) {
      is401Error = true;
    }
  }
  
  if (is401Error && typeof window !== 'undefined') {
    // Set error message in configStore and trigger navigation to settings
    import('../../stores/configStore').then(({ useConfigStore }) => {
      const store = useConfigStore.getState();
      store.clearSuccess();
      // Set error message explaining the issue
      useConfigStore.setState({ 
        error: 'Your API key is invalid or has expired. Please update your credentials in settings.' 
      });
    }).catch(() => {
      // Ignore import errors
    });
    
    // Trigger navigation to settings view by dispatching a custom event
    window.dispatchEvent(new CustomEvent('navigate-to-settings', { 
      detail: { reason: 'invalid-credentials' } 
    }));
  }
  
  // Handle axios errors (primary method)
  if (axios.isAxiosError(error)) {
    throw new Error(processAxiosError(error));
  }
  
  // Handle non-axios errors with axios-like structure (fallback)
  if (error && typeof error === 'object' && 'isAxiosError' in error && error.isAxiosError) {
    throw new Error(processAxiosError(error));
  }
  
  throw new Error(`Failed to ${operation}`);
}

/**
 * Validates API key input
 */
export function validateApiKey(apiKey: string): void {
  if (!apiKey?.trim()) {
    throw new Error('API key is required');
  }
}

/**
 * Validates agency ID input
 */
export function validateAgencyId(agency_id: number): void {
  if (!agency_id || agency_id <= 0) {
    throw new Error('Valid agency ID is required');
  }
}

/**
 * Handles location service errors with specific error types and messages
 */
export function handleLocationError(error: GeolocationPositionError | Error | unknown, operation: string): LocationError {
  console.error(`Location service failed to ${operation}:`, error);

  // Handle GeolocationPositionError
  if (error && typeof error === 'object' && 'code' in error) {
    const geoError = error as GeolocationPositionError;
    const errorMap = {
      1: { message: 'Location access denied by user. Please enable location permissions in your browser settings.', type: LocationErrorTypes.PERMISSION_DENIED, retryable: false },
      2: { message: 'Location position unavailable. GPS signal may be weak or blocked.', type: LocationErrorTypes.POSITION_UNAVAILABLE, retryable: true },
      3: { message: 'Location request timed out. Please try again.', type: LocationErrorTypes.TIMEOUT, retryable: true }
    };
    
    const errorInfo = errorMap[geoError.code as keyof typeof errorMap] || {
      message: 'Unknown location error occurred.',
      type: LocationErrorTypes.NETWORK_ERROR,
      retryable: true
    };
    
    return { code: geoError.code, ...errorInfo };
  }

  // Handle generic errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('not supported') || message.includes('geolocation')) {
      return { code: 0, message: 'Location services not supported by this browser. Please use manual location entry.', type: LocationErrorTypes.NOT_SUPPORTED, retryable: false };
    }
    if (message.includes('network') || message.includes('connection')) {
      return { code: 0, message: 'Network error during location request. Check your internet connection.', type: LocationErrorTypes.NETWORK_ERROR, retryable: true };
    }
    if (message.includes('retry') || message.includes('exhausted')) {
      return { code: 0, message: 'Location request failed after multiple attempts. Please try manual location entry.', type: LocationErrorTypes.RETRY_EXHAUSTED, retryable: false };
    }
  }

  // Fallback for unknown errors
  return { code: 0, message: `Failed to ${operation}. Please try again or use manual location entry.`, type: LocationErrorTypes.NETWORK_ERROR, retryable: true };
}

/**
 * Exponential backoff retry for location requests.
 * Delegates to the shared retryWithBackoff with a location-specific retryable check.
 */
export { retryWithBackoff as retryWithBackoffShared } from '../../utils/core/storeUtils';

export async function retryLocationWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  operationName: string = 'location request'
): Promise<T> {
  const { retryWithBackoff: sharedRetry } = await import('../../utils/core/storeUtils');
  return sharedRetry(
    operation,
    `Location ${operationName}`,
    config,
    (error) => handleLocationError(error, operationName).retryable
  );
}