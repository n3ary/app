/**
 * Map Color Schemes and Visual Configuration
 * Centralized color management for consistent map visualization
 */

/**
 * Vehicle coloring strategies for different visualization needs
 */
export enum VehicleColorStrategy {
  /** Vehicle color matches its route color */
  BY_ROUTE = 'by_route',
  /** Vehicle color indicates arrival time confidence level */
  BY_CONFIDENCE = 'by_confidence',
  /** All vehicles use the same color */
  UNIFORM = 'uniform'
}

/**
 * Station symbol types for different station categories
 */
export enum StationSymbolType {
  /** Standard station marker */
  DEFAULT = 'default',
  /** User's current location marker */
  USER_LOCATION = 'user_location',
  /** Route terminus/end station marker */
  TERMINUS = 'terminus',
  /** Nearby station marker (within walking distance) */
  NEARBY = 'nearby'
}

/**
 * Complete color scheme configuration for map visualization
 * Defines colors for all map elements to ensure visual consistency
 */
export interface MapColorScheme {
  /** Route colors mapped by route ID */
  routes: Map<number, string>;
  /** Vehicle color configuration */
  vehicles: {
    /** Default vehicle color */
    default: string;
    /** Color for selected/highlighted vehicle */
    selected: string;
    /** Color for vehicles with low arrival confidence */
    lowConfidence: string;
    /** Vehicle colors by route ID (when using BY_ROUTE strategy) */
    byRoute: Map<number, string>;
  };
  /** Station/stop marker colors */
  stations: {
    /** Default station color */
    default: string;
    /** User location marker color */
    userLocation: string;
    /** Terminus station color */
    terminus: string;
    /** Nearby station color */
    nearby: string;
  };
  /** Debug visualization colors */
  debug: {
    /** Color for distance calculation lines */
    distanceLine: string;
    /** Color for projection lines */
    projectionLine: string;
    /** Color for route shape debug overlay */
    routeShape: string;
  };
}

/**
 * Default color scheme with consistent branding
 * Uses station blue theme for vehicles and dark blue for routes
 */
export const DEFAULT_MAP_COLORS: MapColorScheme = {
  routes: new Map([
    [1, '#1E40AF'], // Dark blue - consistent for all routes
    [2, '#1E40AF'], // Dark blue - consistent for all routes
    [3, '#1E40AF'], // Dark blue - consistent for all routes
    [4, '#1E40AF'], // Dark blue - consistent for all routes
    [5, '#1E40AF'], // Dark blue - consistent for all routes
    [6, '#1E40AF'], // Dark blue - consistent for all routes
    [7, '#1E40AF'], // Dark blue - consistent for all routes
    [8, '#1E40AF'], // Dark blue - consistent for all routes
  ]),
  vehicles: {
    default: '#3182CE', // Station bubble blue
    selected: '#FF9800', // Orange for selection
    lowConfidence: '#F44336', // Red for low confidence
    byRoute: new Map(), // Will be populated from routes map
  },
  stations: {
    default: '#757575', // Gray for standard stations
    userLocation: '#4CAF50', // Green for user location
    terminus: '#9C27B0', // Purple for terminus stations
    nearby: '#FF5722', // Orange-red for nearby stations
  },
  debug: {
    distanceLine: '#E91E63', // Pink for distance lines
    projectionLine: '#9C27B0', // Purple for projection lines
    routeShape: '#607D8B', // Blue-gray for route shapes
  },
};

// Initialize vehicle byRoute colors to use station blue instead of route colors
DEFAULT_MAP_COLORS.routes.forEach((color, routeId) => {
  DEFAULT_MAP_COLORS.vehicles.byRoute.set(routeId, '#3182CE'); // Station blue for all vehicles
});

/**
 * Create a color scheme with vehicle colors matching station blue and consistent route colors
 * Useful when you have dynamic route data that needs color assignment
 * 
 * @param routes - Map of route IDs to route colors (colors will be overridden)
 * @returns Complete color scheme with consistent colors
 */
export const createColorScheme = (routes: Map<number, string>): MapColorScheme => {
  const colorScheme: MapColorScheme = {
    routes: new Map(),
    vehicles: {
      default: DEFAULT_MAP_COLORS.vehicles.default,
      selected: DEFAULT_MAP_COLORS.vehicles.selected,
      lowConfidence: DEFAULT_MAP_COLORS.vehicles.lowConfidence,
      byRoute: new Map(),
    },
    stations: { ...DEFAULT_MAP_COLORS.stations },
    debug: { ...DEFAULT_MAP_COLORS.debug },
  };

  // Set all routes to consistent dark blue and vehicles to station blue
  routes.forEach((_, routeId) => {
    colorScheme.routes.set(routeId, '#1E40AF'); // Dark blue for routes
    colorScheme.vehicles.byRoute.set(routeId, '#3182CE'); // Station blue for vehicles
  });

  return colorScheme;
};

/**
 * High contrast color scheme for accessibility
 * Provides better visibility for users with visual impairments
 */
export const HIGH_CONTRAST_COLORS: MapColorScheme = {
  routes: new Map([
    [1, '#000000'], // Black for high contrast
    [2, '#000000'],
    [3, '#000000'],
    [4, '#000000'],
    [5, '#000000'],
    [6, '#000000'],
    [7, '#000000'],
    [8, '#000000'],
  ]),
  vehicles: {
    default: '#FFFFFF', // White vehicles on dark background
    selected: '#FFFF00', // Yellow for high visibility selection
    lowConfidence: '#FF0000', // Pure red for errors
    byRoute: new Map(),
  },
  stations: {
    default: '#FFFFFF', // White for visibility
    userLocation: '#00FF00', // Pure green
    terminus: '#FF00FF', // Magenta
    nearby: '#FFA500', // Orange
  },
  debug: {
    distanceLine: '#FF0000', // Pure red
    projectionLine: '#00FF00', // Pure green
    routeShape: '#0000FF', // Pure blue
  },
};

// Initialize high contrast vehicle colors
HIGH_CONTRAST_COLORS.routes.forEach((_, routeId) => {
  HIGH_CONTRAST_COLORS.vehicles.byRoute.set(routeId, '#FFFFFF');
});