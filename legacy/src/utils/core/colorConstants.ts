/**
 * Color Constants
 * Centralized color definitions used throughout the application
 */

export const APP_COLORS = {
  TRANSPORT_TYPES: {
    TRAM: '#FF6B35',      // Orange (distinctive for rail-based transport)
    BUS: '#1976D2',       // Blue (Material-UI primary)
    TROLLEYBUS: '#4CAF50', // Green (electric/eco-friendly)
    DEFAULT: '#757575'     // Gray fallback
  },
  
  MAP_DEBUG: {
    DISTANCE_LINE: '#E91E63',
    PROJECTION_LINE: '#9C27B0',
    ROUTE_SHAPE: '#607D8B',
    VEHICLE_DEBUG: '#FF5722',
    STATION_DEBUG: '#3F51B5',
    PROJECTION_DEBUG: '#795548'
  },
  
  MAP_INTERFACE: {
    LABEL_BACKGROUND: 'rgba(0, 0, 0, 0.8)',
    LABEL_TEXT: '#FFFFFF',
    ROUTE_CONSISTENT: '#1E40AF',  // Dark blue for all routes
    VEHICLE_STATION: '#3182CE',   // Station bubble blue for all vehicles
    VEHICLE_SELECTED: '#FF9800',
    VEHICLE_LOW_CONFIDENCE: '#F44336',
    STATION_DEFAULT: '#757575',
    STATION_USER_LOCATION: '#4CAF50',
    STATION_TERMINUS: '#9C27B0',
    STATION_NEARBY: '#FF5722'
  },
  
  STATUS: {
    SUCCESS: '#4CAF50',
    WARNING: '#FF9800',
    ERROR: '#F44336'
  },
  
  TEXT_COLORS: {
    WHITE: '#ffffff',
    BLACK: '#000000'
  }
} as const;

/**
 * Get transport type color by route type
 */
export const getTransportTypeColor = (routeType: number): string => {
  switch (routeType) {
    case 0: return APP_COLORS.TRANSPORT_TYPES.TRAM;
    case 3: return APP_COLORS.TRANSPORT_TYPES.BUS;
    case 11: return APP_COLORS.TRANSPORT_TYPES.TROLLEYBUS;
    default: return APP_COLORS.TRANSPORT_TYPES.DEFAULT;
  }
};

/**
 * Get Material-UI color variant for transportation type
 */
export const getTransportTypeMuiColor = (routeType: number): 'primary' | 'secondary' | 'success' | 'default' => {
  switch (routeType) {
    case 0: return 'secondary'; // Tram - Orange-ish
    case 3: return 'primary';   // Bus - Blue
    case 11: return 'success';  // Trolleybus - Green
    default: return 'default';
  }
};