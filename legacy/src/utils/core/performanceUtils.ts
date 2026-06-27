// Performance Utilities
// Helper functions for optimizing React component performance and data sharing

/**
 * Throttle function for performance optimization
 * Ensures function is called at most once per specified interval
 * 
 * @param func - Function to throttle
 * @param interval - Interval in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  func: T, 
  interval: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * Simple object comparison for memoization
 * Compares objects by their JSON representation (shallow comparison)
 * 
 * @param obj1 - First object
 * @param obj2 - Second object
 * @returns True if objects are equal, false otherwise
 */
export function shallowEqual(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true;
  
  if (obj1 == null || obj2 == null) return obj1 === obj2;
  
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }
  
  const keys1 = Object.keys(obj1 as object);
  const keys2 = Object.keys(obj2 as object);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!(key in (obj2 as object))) return false;
    if ((obj1 as Record<string, unknown>)[key] !== (obj2 as Record<string, unknown>)[key]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Performance monitoring utility
 * Helps track expensive operations and their timing
 */
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();
  
  static start(label: string): void {
    this.timers.set(label, performance.now());
  }
  
  static end(label: string): number {
    const startTime = this.timers.get(label);
    if (!startTime) {
      console.warn(`Performance timer '${label}' was not started`);
      return 0;
    }
    
    const duration = performance.now() - startTime;
    this.timers.delete(label);
    
    // Log slow operations (over 100ms)
    if (duration > 100) {
      console.warn(`Slow operation detected: ${label} took ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }
  
  static measure<T>(label: string, operation: () => T): T {
    this.start(label);
    try {
      return operation();
    } finally {
      this.end(label);
    }
  }
}