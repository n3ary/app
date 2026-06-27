/**
 * Unified Timestamp Formatting Utilities
 * Provides consistent timestamp formatting across the application
 */

/**
 * Format timestamp as relative time (e.g., "2 minutes ago", "30 seconds ago")
 * Use for timestamps that auto-update to stay current with "now"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 30) {
    return 'just now';
  } else if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
}

/**
 * Format time as compact relative time (e.g., "4m ago", "2h ago")
 * Use for space-constrained displays like tooltips
 */
export function formatCompactRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 30) {
    return 'now';
  } else if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

/**
 * Format time as arrival time (e.g., "in 5 minutes", "in 1 hour")
 * Use for arrival predictions and future events
 */
export function formatArrivalTime(minutes: number): string {
  if (minutes < 1) {
    return 'arriving now';
  } else if (minutes < 60) {
    return minutes === 1 ? 'in 1 minute' : `in ${Math.round(minutes)} minutes`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    
    if (remainingMinutes === 0) {
      return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
    } else {
      return `in ${hours}h ${remainingMinutes}m`;
    }
  }
}

/**
 * Format timestamp as absolute time (e.g., "at 14:32", "at 09:05")
 * Use for last update/fetch times and fixed timestamps
 */
export function formatAbsoluteTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `at ${hours}:${minutes}`;
}

/**
 * Format time difference as detailed relative time (e.g., "2m 30s ago", "1h 15m ago")
 * Use for detailed data age displays in tooltips and popups
 * 
 * @param ageMs - Age in milliseconds
 * @returns Formatted string with appropriate units
 */
export function formatDetailedRelativeTime(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  // Less than 60 seconds: show only seconds
  if (minutes === 0) {
    return `${seconds}s ago`;
  }
  
  // Less than 60 minutes: show minutes and seconds
  if (hours === 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s ago`;
  }
  
  // 60 minutes or more: show hours and minutes
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ago`;
}

/**
 * Format timestamp for debugging purposes with full context
 * Use in debug panels and development tools
 */
export function formatDebugTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const relative = formatRelativeTime(timestamp);
  const absolute = formatAbsoluteTime(timestamp);
  return `${absolute} (${relative})`;
}