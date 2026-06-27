/**
 * Station Display Utilities
 * Formatting and display helpers for station UI components
 */

/**
 * Format distance for display
 */
export const formatDistance = (distance: number): string => {
  if (distance < 1000) {
    return `${Math.round(distance)}m`;
  }
  return `${(distance / 1000).toFixed(1)}km`;
};

/**
 * Get Material-UI color for station type
 */
export const getStationTypeColor = (stationType: 'primary' | 'all'): 'primary' | 'default' => {
  if (stationType === 'primary') return 'primary';
  return 'default';
};

/**
 * Get display label for station type
 */
export const getStationTypeLabel = (stationType: 'primary' | 'all'): string => {
  if (stationType === 'primary') return 'Closest';
  return ''; // No label for other stations
};