/**
 * Map Configuration Constants
 * Centralized configuration for map components
 * Includes default settings, tile providers, and performance limits
 */

import type { Coordinates } from '../../utils/location/distanceUtils';
import type { MapPerformanceConfig } from '../../types/map/mapState';
import { APP_COLORS } from '../core/colorConstants';

// ============================================================================
// Map Defaults
// ============================================================================

export const MAP_DEFAULTS = {
  CENTER: { lat: 46.7712, lon: 23.6236 } as Coordinates,
  ZOOM: 13,
  MIN_ZOOM: 10,
  MAX_ZOOM: 18,
  
  // Tile layer configuration
  TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  
  // Map container styling
  CONTAINER_STYLE: {
    height: '100%',
    width: '100%',
    zIndex: 1,
  },
} as const;

// ============================================================================
// Performance Configuration
// ============================================================================

export const DEFAULT_PERFORMANCE_CONFIG: MapPerformanceConfig = {
  maxVehicleMarkers: 100,
  maxRouteShapes: 20,
  clusteringThreshold: 50,
  updateThrottleMs: 1000,
  renderDistance: 5000, // 5km buffer around viewport
};

// Performance presets for different use cases
export const PERFORMANCE_PRESETS = {
  HIGH_PERFORMANCE: {
    maxVehicleMarkers: 50,
    maxRouteShapes: 10,
    clusteringThreshold: 25,
    updateThrottleMs: 2000,
    renderDistance: 3000,
  },
  BALANCED: DEFAULT_PERFORMANCE_CONFIG,
  HIGH_DETAIL: {
    maxVehicleMarkers: 200,
    maxRouteShapes: 50,
    clusteringThreshold: 100,
    updateThrottleMs: 500,
    renderDistance: 10000,
  },
} as const;

// ============================================================================
// Layer Configuration
// ============================================================================

export const LAYER_DEFAULTS = {
  // Vehicle layer
  VEHICLE_MARKER_SIZE: 24,
  VEHICLE_SELECTED_SIZE: 28,
  VEHICLE_CLUSTER_SIZE: 40,
  
  // Station layer
  STATION_MARKER_SIZE: 16,
  STATION_SELECTED_SIZE: 22,
  STATION_CLUSTER_SIZE: 32,
  
  // Route shape layer
  ROUTE_STROKE_WIDTH: 4,
  ROUTE_SELECTED_STROKE_WIDTH: 6,
  ROUTE_OPACITY: 0.7,
  ROUTE_SELECTED_OPACITY: 0.9,
  
  // Debug layer
  DEBUG_LINE_WIDTH: 2,
  DEBUG_LINE_OPACITY: 0.8,
  DEBUG_MARKER_SIZE: 12,
  
  // User location
  USER_LOCATION_SIZE: 20,
  USER_LOCATION_ACCURACY_OPACITY: 0.2,
} as const;

// ============================================================================
// Animation Configuration
// ============================================================================

export const ANIMATION_CONFIG = {
  // Map transitions
  PAN_DURATION: 1000,
  ZOOM_DURATION: 500,
  
  // Marker animations
  MARKER_FADE_DURATION: 300,
  MARKER_BOUNCE_DURATION: 600,
  
  // Loading animations
  LOADING_FADE_DURATION: 200,
  LOADING_SPINNER_SPEED: 1000,
  
  // Update intervals
  VEHICLE_UPDATE_INTERVAL: 30000, // 30 seconds
  LOCATION_UPDATE_INTERVAL: 10000, // 10 seconds
} as const;

// ============================================================================
// Interaction Configuration
// ============================================================================

export const INTERACTION_CONFIG = {
  // Click/tap tolerances
  CLICK_TOLERANCE: 5, // pixels
  DOUBLE_CLICK_DELAY: 300, // milliseconds
  
  // Popup configuration
  POPUP_MAX_WIDTH: 300,
  POPUP_OFFSET: [0, -10] as [number, number],
  POPUP_AUTO_CLOSE: true,
  POPUP_CLOSE_ON_ESCAPE: true,
  
  // Tooltip configuration
  TOOLTIP_OFFSET: [0, -20] as [number, number],
  TOOLTIP_DIRECTION: 'top' as const,
  TOOLTIP_OPACITY: 0.9,
} as const;

// ============================================================================
// Debug Configuration
// ============================================================================

export const DEBUG_CONFIG = {
  // Debug line styles
  DISTANCE_LINE_COLOR: APP_COLORS.MAP_DEBUG.DISTANCE_LINE,
  PROJECTION_LINE_COLOR: APP_COLORS.MAP_DEBUG.PROJECTION_LINE,
  ROUTE_SHAPE_COLOR: APP_COLORS.MAP_DEBUG.ROUTE_SHAPE,
  
  // Debug marker styles
  VEHICLE_DEBUG_COLOR: APP_COLORS.MAP_DEBUG.VEHICLE_DEBUG,
  STATION_DEBUG_COLOR: APP_COLORS.MAP_DEBUG.STATION_DEBUG,
  PROJECTION_DEBUG_COLOR: APP_COLORS.MAP_DEBUG.PROJECTION_DEBUG,
  
  // Debug label styles
  LABEL_BACKGROUND: APP_COLORS.MAP_INTERFACE.LABEL_BACKGROUND,
  LABEL_TEXT_COLOR: APP_COLORS.MAP_INTERFACE.LABEL_TEXT,
  LABEL_FONT_SIZE: '11px',
  LABEL_PADDING: '4px 8px',
  LABEL_BORDER_RADIUS: '6px',
} as const;

// ============================================================================
// Responsive Configuration
// ============================================================================

export const RESPONSIVE_CONFIG = {
  // Breakpoints (pixels)
  MOBILE_MAX_WIDTH: 768,
  TABLET_MAX_WIDTH: 1024,
  
  // Mobile adjustments
  MOBILE_MARKER_SIZE_MULTIPLIER: 1.2,
  MOBILE_STROKE_WIDTH_MULTIPLIER: 1.5,
  MOBILE_FONT_SIZE_MULTIPLIER: 1.1,
  
  // Touch interaction
  TOUCH_ZOOM_SENSITIVITY: 1.2,
  TOUCH_PAN_SENSITIVITY: 1.0,
} as const;

// ============================================================================
// Error Handling Configuration
// ============================================================================

export const ERROR_CONFIG = {
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // milliseconds
  RETRY_BACKOFF_MULTIPLIER: 2,
  
  // Timeout configuration
  TILE_LOAD_TIMEOUT: 10000, // 10 seconds
  DATA_FETCH_TIMEOUT: 5000, // 5 seconds
  
  // Fallback configuration
  FALLBACK_TILE_URL: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
  FALLBACK_CENTER: { lat: 46.7712, lon: 23.6236 } as Coordinates,
  FALLBACK_ZOOM: 13,
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get performance config based on device capabilities
 */
export function getOptimalPerformanceConfig(): MapPerformanceConfig {
  // Simple device detection
  const isMobile = window.innerWidth <= RESPONSIVE_CONFIG.MOBILE_MAX_WIDTH;
  const isLowEnd = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
  
  if (isMobile || isLowEnd) {
    return PERFORMANCE_PRESETS.HIGH_PERFORMANCE;
  } else if (window.innerWidth <= RESPONSIVE_CONFIG.TABLET_MAX_WIDTH) {
    return PERFORMANCE_PRESETS.BALANCED;
  } else {
    return PERFORMANCE_PRESETS.HIGH_DETAIL;
  }
}

/**
 * Get responsive marker size based on screen size
 */
export function getResponsiveMarkerSize(baseSize: number): number {
  const isMobile = window.innerWidth <= RESPONSIVE_CONFIG.MOBILE_MAX_WIDTH;
  return isMobile ? baseSize * RESPONSIVE_CONFIG.MOBILE_MARKER_SIZE_MULTIPLIER : baseSize;
}

/**
 * Get responsive stroke width based on screen size
 */
export function getResponsiveStrokeWidth(baseWidth: number): number {
  const isMobile = window.innerWidth <= RESPONSIVE_CONFIG.MOBILE_MAX_WIDTH;
  return isMobile ? baseWidth * RESPONSIVE_CONFIG.MOBILE_STROKE_WIDTH_MULTIPLIER : baseWidth;
}

/**
 * Validate coordinates are within reasonable bounds
 */
export function validateCoordinates(coords: Coordinates): boolean {
  return (
    coords.lat >= -90 && coords.lat <= 90 &&
    coords.lon >= -180 && coords.lon <= 180 &&
    !isNaN(coords.lat) && !isNaN(coords.lon)
  );
}

/**
 * Calculate appropriate zoom level for given bounds
 */
export function calculateZoomForBounds(
  bounds: { north: number; south: number; east: number; west: number },
  containerWidth: number,
  containerHeight: number
): number {
  const latDiff = bounds.north - bounds.south;
  const lonDiff = bounds.east - bounds.west;
  
  // Simple zoom calculation based on coordinate differences
  const latZoom = Math.log2(360 / latDiff);
  const lonZoom = Math.log2(360 / lonDiff);
  
  // Take the more restrictive zoom and adjust for container size
  const zoom = Math.min(latZoom, lonZoom) - 1;
  
  // Clamp to valid zoom range
  return Math.max(MAP_DEFAULTS.MIN_ZOOM, Math.min(MAP_DEFAULTS.MAX_ZOOM, Math.floor(zoom)));
}