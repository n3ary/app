/**
 * Maps Utilities Index
 * Centralized exports for all map-related utilities
 * Provides clean import interface for map components
 */

// Icon utilities
export {
  createVehicleIcon,
  createStationIcon,
  createDebugIcon,
  createUserLocationIcon,
  createDirectionArrow,
  createClusterIcon,
  createDistanceLabelIcon,
} from './iconUtils';

export type {
  IconOptions,
  VehicleIconOptions,
  StationIconOptions,
  DebugIconOptions,
  DirectionArrowOptions,
} from './iconUtils';

// Performance utilities
export {
  clusterPoints,
  filterPointsByViewport,
  useThrottledMapUpdate,
  useOptimizedVehicles,
  useOptimizedStations,
  useDebouncedLoading,
} from './performanceUtils';

export type {
  ClusterPoint,
  Cluster,
} from './performanceUtils';

// Map constants and configuration
export {
  MAP_DEFAULTS,
  DEFAULT_PERFORMANCE_CONFIG,
  PERFORMANCE_PRESETS,
  LAYER_DEFAULTS,
  ANIMATION_CONFIG,
  INTERACTION_CONFIG,
  DEBUG_CONFIG,
  RESPONSIVE_CONFIG,
  ERROR_CONFIG,
  getOptimalPerformanceConfig,
  getResponsiveMarkerSize,
  getResponsiveStrokeWidth,
  validateCoordinates,
  calculateZoomForBounds,
} from './mapConstants';

// Viewport utilities
export {
  calculateBounds,
  addBoundsPadding,
  calculateRouteOverviewViewport,
  calculateVehicleTrackingViewport,
  calculateComprehensiveViewport,
  calculateVehicleComprehensiveViewport,
} from './viewportUtils';

export type {
  ViewportBounds,
} from './viewportUtils';