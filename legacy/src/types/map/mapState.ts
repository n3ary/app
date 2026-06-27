/**
 * Map State Management Types
 * Core interfaces for map viewport, display modes, and performance configuration
 */

import type { Coordinates } from '../../utils/location/distanceUtils';

/**
 * Map display modes for different use cases
 */
export enum MapMode {
  /** Focus on individual vehicle tracking with detailed info */
  VEHICLE_TRACKING = 'vehicle_tracking',
  /** Overview of entire route with all vehicles and stops */
  ROUTE_OVERVIEW = 'route_overview'
}

/**
 * Map viewport and layer visibility state
 * Manages what the user sees and how the map is positioned
 */
export interface MapState {
  /** Current display mode */
  mode: MapMode;
  /** Map center coordinates */
  center: Coordinates;
  /** Current zoom level */
  zoom: number;
  /** Optional bounding box [south, west, north, east] */
  bounds?: [number, number, number, number];
  
  // Layer visibility controls
  /** Whether to show vehicle markers */
  showVehicles: boolean;
  /** Whether to show route shape lines */
  showRouteShapes: boolean;
  /** Whether to show station/stop markers */
  showStations: boolean;
  /** Whether to show user's current location */
  showUserLocation: boolean;
  /** Whether to show debug visualization overlays */
  showDebugInfo: boolean;
  
  // Selection state for highlighting
  /** ID of currently selected vehicle (for highlighting) */
  selectedVehicleId?: number;
  /** ID of currently selected route (for highlighting) */
  selectedRouteId?: number;
  /** ID of currently selected station (for highlighting) */
  selectedStationId?: number;
}

/**
 * Performance optimization configuration
 * Controls rendering limits and update frequencies to maintain smooth performance
 */
export interface MapPerformanceConfig {
  /** Maximum number of vehicle markers to render simultaneously */
  maxVehicleMarkers: number;
  /** Maximum number of route shapes to render simultaneously */
  maxRouteShapes: number;
  /** Minimum number of items before clustering is applied */
  clusteringThreshold: number;
  /** Throttle interval for map updates in milliseconds */
  updateThrottleMs: number;
  /** Distance buffer around viewport for rendering items (meters) */
  renderDistance: number;
}

/**
 * Default performance configuration
 * Conservative settings that work well on most devices
 */
export const DEFAULT_MAP_PERFORMANCE: MapPerformanceConfig = {
  maxVehicleMarkers: 100,
  maxRouteShapes: 20,
  clusteringThreshold: 50,
  updateThrottleMs: 1000,
  renderDistance: 5000 // 5km buffer around viewport
};

/**
 * Loading states for different map data types
 * Tracks loading status for each type of map data independently
 */
export interface MapLoadingState {
  /** Loading state for vehicle data */
  vehicles: boolean;
  /** Loading state for route data */
  routes: boolean;
  /** Loading state for station/stop data */
  stations: boolean;
  /** Loading state for route shape geometry */
  routeShapes: boolean;
  /** Loading state for user location */
  userLocation: boolean;
  /** Overall loading state (true if any individual state is loading) */
  overall: boolean;
}

/**
 * Default loading state - all data types not loading
 */
export const DEFAULT_LOADING_STATE: MapLoadingState = {
  vehicles: false,
  routes: false,
  stations: false,
  routeShapes: false,
  userLocation: false,
  overall: false,
};

/**
 * Combined data status tracking
 * Includes loading states, error messages, and last update timestamps
 */
export interface MapDataStatus {
  /** Loading states for each data type */
  loading: MapLoadingState;
  /** Error messages for each data type (if any) */
  errors: Partial<Record<keyof MapLoadingState, string>>;
  /** Last successful update timestamp for each data type */
  lastUpdated: Partial<Record<keyof MapLoadingState, number>>;
}

/**
 * Map configuration constants
 * Default values for map initialization and tile sources
 */
export const MAP_DEFAULTS = {
  /** Default map center (Cluj-Napoca, Romania) */
  CENTER: { lat: 46.7712, lon: 23.6236 } as Coordinates,
  /** Default zoom level */
  ZOOM: 13,
  /** Minimum allowed zoom level */
  MIN_ZOOM: 10,
  /** Maximum allowed zoom level */
  MAX_ZOOM: 18,
  /** OpenStreetMap tile URL template */
  TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  /** Attribution text for map tiles */
  ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;