/**
 * Map Layer Component Props and Interfaces
 * Type definitions for individual map layers and their configuration
 */

import type { Coordinates } from '../../utils/location/distanceUtils';
import type { 
  TranzyVehicleResponse, 
  TranzyRouteResponse, 
  TranzyStopResponse, 
  TranzyTripResponse, 
  TranzyStopTimeResponse 
} from '../rawTranzyApi';
import type { RouteShape, ProjectionResult, DistanceResult } from '../arrivalTime';
import type { EnhancedVehicleData } from '../../utils/vehicle/vehicleEnhancementUtils';
import type { MapColorScheme, VehicleColorStrategy, StationSymbolType } from './mapColors';
import type { MapPerformanceConfig, MapLoadingState, MapMode } from './mapState';

/**
 * Debug visualization data for development and troubleshooting
 * Shows internal calculations and projections on the map
 */
export interface DebugVisualizationData {
  /** Current vehicle position */
  vehiclePosition: Coordinates;
  /** Target station position */
  targetStationPosition: Coordinates;
  /** Position of the vehicle's next scheduled stop */
  nextStationPosition?: Coordinates;
  /** Vehicle projection onto route shape */
  vehicleProjection: ProjectionResult;
  /** Station projection onto route shape */
  stationProjection: ProjectionResult;
  /** Next station projection onto route shape */
  nextStationProjection?: ProjectionResult;
  /** Route shape geometry */
  routeShape: RouteShape;
  /** Distance calculation result */
  distanceCalculation: DistanceResult;
  /** Information about the next station in sequence */
  nextStationInfo?: {
    /** Stop ID of next station */
    stop_id: number;
    /** Display name of next station */
    stop_name: string;
    /** Whether next station is the same as target station */
    isTargetStation: boolean;
  };
}

/**
 * Vehicle layer component props
 * Renders vehicle markers with real-time positions and status
 */
export interface VehicleLayerProps {
  /** Array of enhanced vehicle data with predictions */
  vehicles: EnhancedVehicleData[];
  /** Route information mapped by route ID */
  routes: Map<number, TranzyRouteResponse>;
  /** Trip information mapped by trip ID */
  trips?: Map<string, TranzyTripResponse>;
  /** Callback when user clicks on a vehicle marker */
  onVehicleClick?: (vehicle: EnhancedVehicleData) => void;
  /** Vehicle ID to highlight with special styling */
  highlightedVehicleId?: number;
  /** Strategy for coloring vehicle markers */
  colorStrategy?: VehicleColorStrategy;
  /** Color scheme configuration */
  colorScheme: MapColorScheme;
  /** Performance optimization settings */
  performanceConfig?: MapPerformanceConfig;
  /** Whether vehicle data is currently loading */
  loading?: boolean;
}

/**
 * Route shape layer component props
 * Renders route paths as lines on the map
 */
export interface RouteShapeLayerProps {
  /** Route shapes mapped by shape ID */
  routeShapes: Map<string, RouteShape>;
  /** Route information mapped by route ID */
  routes: Map<number, TranzyRouteResponse>;
  /** Route IDs to highlight with special styling */
  highlightedRouteIds?: number[];
  /** Whether to show direction arrows along route paths */
  showDirectionArrows?: boolean;
  /** Color scheme configuration */
  colorScheme: MapColorScheme;
  /** Callback when user clicks on a route shape */
  onRouteClick?: (route: TranzyRouteResponse) => void;
  /** Performance optimization settings */
  performanceConfig?: MapPerformanceConfig;
  /** Whether route shape data is currently loading */
  loading?: boolean;
}

/**
 * Station layer component props
 * Renders station/stop markers with different symbols and states
 */
export interface StationLayerProps {
  /** Array of station/stop data */
  stations: TranzyStopResponse[];
  /** Station symbol types mapped by station ID */
  stationTypes?: Map<number, StationSymbolType>;
  /** Callback when user clicks on a station marker */
  onStationClick?: (station: TranzyStopResponse) => void;
  /** Station ID to highlight with special styling */
  highlightedStationId?: number;
  /** Target station ID to highlight (for arrival predictions) */
  targetStationId?: number;
  /** Next station ID to animate with pulsing effect */
  nextStationId?: number;
  /** Color scheme configuration */
  colorScheme: MapColorScheme;
  /** Performance optimization settings */
  performanceConfig?: MapPerformanceConfig;
  /** Whether station data is currently loading */
  loading?: boolean;
}

/**
 * Debug layer component props
 * Renders debug visualization overlays for development
 */
export interface DebugLayerProps {
  /** Debug visualization data to render */
  debugData: DebugVisualizationData;
  /** Whether debug layer should be visible */
  visible: boolean;
  /** Color scheme for debug elements */
  colorScheme: MapColorScheme;
  /** Vehicle prediction debug data (optional) */
  vehicles?: EnhancedVehicleData[];
}

/**
 * User location layer component props
 * Renders user's current location with accuracy indicator
 */
export interface UserLocationLayerProps {
  /** User's current position from geolocation API */
  position?: GeolocationPosition;
  /** Whether to show accuracy circle around location */
  showAccuracyCircle?: boolean;
  /** Color scheme configuration */
  colorScheme: MapColorScheme;
}

/**
 * Map controls component props
 * Renders UI controls for map mode and layer toggles
 */
export interface MapControlsProps {
  /** Current map display mode */
  mode: MapMode;
  /** Callback when user changes map mode */
  onModeChange: (mode: MapMode) => void;
  /** Whether debug mode is currently enabled */
  debugMode: boolean;
  /** Callback when user toggles debug mode */
  onDebugToggle: (enabled: boolean) => void;
  /** Whether user location is currently shown */
  showUserLocation: boolean;
  /** Callback when user toggles location display */
  onUserLocationToggle: (enabled: boolean) => void;
  
  // Layer visibility controls
  /** Whether vehicle layer is currently visible */
  showVehicles: boolean;
  /** Callback when user toggles vehicle layer */
  onVehiclesToggle: (enabled: boolean) => void;
  /** Whether route shapes layer is currently visible */
  showRouteShapes: boolean;
  /** Callback when user toggles route shapes layer */
  onRouteShapesToggle: (enabled: boolean) => void;
  /** Whether stations layer is currently visible */
  showStations: boolean;
  /** Callback when user toggles stations layer */
  onStationsToggle: (enabled: boolean) => void;
}

// Re-export MapMode for convenience
export { MapMode } from './mapState';