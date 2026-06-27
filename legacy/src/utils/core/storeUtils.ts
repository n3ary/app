// Store utilities for manual refresh functionality
// Shared utilities to eliminate code duplication across stores

// Import types
import type { RetryConfig } from '../../types/common';

export type { RetryConfig };

// Define retry config locally to avoid import issues
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

/**
 * Helper function for exponential backoff retry.
 * Shared across stores and services.
 * @param isRetryable - Optional callback to check if an error should be retried.
 *                      If omitted, all errors are retried.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  isRetryable?: (error: unknown) => boolean
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable (if callback provided)
      if (isRetryable && !isRetryable(error)) {
        throw error;
      }
      
      // Don't wait after the last attempt
      if (attempt === config.maxAttempts - 1) {
        break;
      }
      
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelay
      );
      
      console.log(`${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Helper function to check if error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('network') || 
           message.includes('connection') || 
           message.includes('timeout') ||
           message.includes('fetch');
  }
  return false;
}

/**
 * Creates a load method for stores (with loading state).
 * Handles: duplicate request guard, freshness check, empty-result preservation.
 * 
 * @param dataKey - The state key holding the data array (e.g. 'routes', 'stops')
 * @param fetchFn - Async function that returns the data (called via dynamic import)
 */
export function createLoadMethod(
  dataKey: string,
  fetchFn: () => Promise<any[]>
) {
  return async (get: () => any, set: (updates: any) => void) => {
    const currentState = get();
    if (currentState.loading) return;
    
    const currentData = currentState[dataKey];
    const hasData = Array.isArray(currentData) ? currentData.length > 0
      : currentData instanceof Map ? currentData.size > 0 : !!currentData;

    if (hasData && currentState.isDataFresh?.()) return;

    set({ loading: true, error: null });

    try {
      const data = await fetchFn();

      // Don't overwrite existing data with empty result (hash-match signal)
      if (Array.isArray(data) && data.length === 0 && hasData) {
        set({ loading: false, error: null, lastUpdated: Date.now(), lastApiFetch: Date.now() });
      } else {
        set({ [dataKey]: data, loading: false, error: null, lastUpdated: Date.now() });
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : `Failed to load ${dataKey}`
      });
    }
  };
}

/**
 * Creates a generic refresh method for stores with retry logic and error handling
 * This method does NOT set loading states - it refreshes data in the background
 * Loading states are only used for initial loads when no cached data exists
 * @param storeName - Name of the store (for error messages)
 * @param dataKey - Key name for the data property in the store state
 * @param serviceImport - Dynamic import function for the service
 * @param serviceMethod - Method name to call on the service
 * @param options - Optional configuration (retry enabled by default)
 */
export function createRefreshMethod<T>(
  storeName: string,
  dataKey: string,
  serviceImport: () => Promise<any>,
  serviceMethod: string,
  options?: {
    useRetry?: boolean; // Default: true
    retryConfig?: RetryConfig;
    allowCachedDataOnError?: boolean; // Default: true
    processData?: (data: any) => any;
    /** When true, empty results are treated as "no change" and existing data is preserved.
     *  Only enable for static data services that return [] on hash match.
     *  Default: false (empty result replaces store data). */
    preserveOnEmpty?: boolean;
  }
) {
  return async (getState: () => any, setState: (updates: any) => void) => {
    const currentState = getState();
    
    // Set sensible defaults
    const useRetry = options?.useRetry ?? true; // Default: true
    const allowCachedDataOnError = options?.allowCachedDataOnError ?? true; // Default: true
    
    console.log(`[Store] ${storeName}: Starting API fetch...`);
    
    try {
      const refreshOperation = async () => {
        // Import service dynamically to avoid circular dependencies
        const serviceModule = await serviceImport();
        
        // Get the service (pattern: export const tripService = { ... })
        const service = serviceModule[`${storeName}Service`];
        
        if (!service || typeof service[serviceMethod] !== 'function') {
          throw new Error(`Service method ${serviceMethod} not found in ${storeName}Service`);
        }
        
        const rawData = await service[serviceMethod]();
        
        // Process data if processor provided
        return options?.processData ? options.processData(rawData) : rawData;
      };
      
      // Use retry logic by default
      const data = useRetry 
        ? await retryWithBackoff(refreshOperation, `${storeName} refresh`, options?.retryConfig)
        : await refreshOperation();
      
      console.log(`[Store] ${storeName}: API fetch completed at ${new Date().toLocaleTimeString()}`);
      
      // Don't overwrite existing data with empty result (hash-match signal)
      // Only applies to static data stores that use hash-matching (preserveOnEmpty: true)
      const preserveOnEmpty = options?.preserveOnEmpty ?? false;
      if (preserveOnEmpty) {
        const currentData = getState()[dataKey];
        const hasExistingData = Array.isArray(currentData) ? currentData.length > 0 
          : currentData instanceof Map ? currentData.size > 0 : !!currentData;
        const isEmptyResult = Array.isArray(data) ? data.length === 0
          : data instanceof Map ? data.size === 0 : !data;

        if (isEmptyResult && hasExistingData) {
          setState({
            error: null,
            lastUpdated: Date.now(),
            lastApiFetch: Date.now()
          });
          return;
        }
      }

      // Fresh data — update store
      setState({ 
        [dataKey]: data,
        error: null, 
        lastUpdated: Date.now(),
        lastApiFetch: Date.now()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to refresh ${storeName}`;
      
      console.error(`[Store] ${storeName}: API fetch failed - ${errorMessage}`);
      
      // Handle errors gracefully if we have cached data (default behavior)
      if (allowCachedDataOnError && currentState[dataKey] && 
          (Array.isArray(currentState[dataKey]) ? currentState[dataKey].length > 0 : 
           currentState[dataKey] instanceof Map ? currentState[dataKey].size > 0 : true)) {
        
        const isNetworkErr = isNetworkError(error);
        const errorPrefix = isNetworkErr ? 'Network error during refresh' : 'Background refresh failed';
        
        // Don't update error state for background refresh - just log it
        console.warn(`${errorPrefix}: ${errorMessage}. Continuing with cached data.`);
      } else {
        // Only update error state if we have no cached data
        setState({ 
          error: errorMessage
        });
      }
    }
  };
}

  /**
   * Creates a data freshness checker
   * @param defaultMaxAge - Default maximum age in milliseconds
   */
  export function createFreshnessChecker(defaultMaxAge: number) {
    return (getState: () => any, maxAgeMs: number = defaultMaxAge): boolean => {
      const { lastApiFetch } = getState();
      if (!lastApiFetch) return false;
      return (Date.now() - lastApiFetch) < maxAgeMs;
    };
  }