// Error tracking, status monitoring, and reporting
// Tracks API call success/failure and provides status aggregation

import type { ApiCallResult } from './errorTypes';

/**
 * Lightweight API status tracker - aggregates status from actual API calls
 */
export const apiStatusTracker = {
  lastCall: null as ApiCallResult | null,
  consecutiveFailures: 0,
  
  recordSuccess(operation: string, responseTime: number) {
    this.lastCall = { success: true, responseTime, timestamp: Date.now(), operation };
    this.consecutiveFailures = 0;
  },
  
  recordFailure(operation: string) {
    this.lastCall = { success: false, responseTime: 0, timestamp: Date.now(), operation };
    this.consecutiveFailures++;
  },
  
  getStatus(): 'online' | 'offline' | 'error' {
    // Check current network status first (hierarchical)
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
    
    // If no API calls have been made yet, start optimistic
    if (!this.lastCall) return 'online';
    
    // Determine status based on call results
    if (this.consecutiveFailures >= 3) return 'error';
    return this.lastCall.success ? 'online' : 'error';
  },
  
  getLastResponseTime(): number | null {
    return this.lastCall?.success ? this.lastCall.responseTime : null;
  },
  
  getLastCheckTime(): number | null {
    return this.lastCall?.timestamp || null;
  }
};