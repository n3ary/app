/**
 * Map Types - Centralized Exports
 * Re-exports all map-related types for convenient importing
 */

// Import required types for the main props interface
import type { Coordinates } from '../../utils/location/distanceUtils';
import type { 
  TranzyRouteResponse, 
  TranzyStopResponse, 
  TranzyTripResponse, 
  TranzyStopTimeResponse 
} from '../rawTranzyApi';
import type { RouteShape } from '../arrivalTime';
import type { EnhancedVehicleData } from '../../utils/vehicle/vehicleEnhancementUtils';
import type { 
  MapPerformanceConfig, 
  MapLoadingState 
} from './mapState';
import type { MapColorScheme } from './mapColors';
import type { DebugVisualizationData } from './mapLayers';
import { MapMode } from './mapState';
import { VehicleColorStrategy } from './mapColors';

// Map state and configuration
export type {
  MapState,
  MapPerformanceConfig,
  MapLoadingState,
  MapDataStatus
} from './mapState';

export {
  MapMode,
  DEFAULT_MAP_PERFORMANCE,
  DEFAULT_LOADING_STATE,
  MAP_DEFAULTS
} from './mapState';

// Color schemes and visual configuration
export type {
  MapColorScheme
} from './mapColors';

export {
  VehicleColorStrategy,
  StationSymbolType,
  DEFAULT_MAP_COLORS,
  HIGH_CONTRAST_COLORS,
  createColorScheme
} from './mapColors';

// Layer component props
export type {
  DebugVisualizationData,
  VehicleLayerProps,
  RouteShapeLayerProps,
  StationLayerProps,
  DebugLayerProps,
  UserLocationLayerProps,
  MapControlsProps
} from './mapLayers';

// Main map component props interface
export interface InteractiveTransitMapProps {
  // Display mode configuration
  mode: MapMode;
  
  // Data props based on mode
  vehicles?: EnhancedVehicleData[];
  routes?: TranzyRouteResponse[];
  stations?: TranzyStopResponse[];
  routeShapes?: Map<string, RouteShape>;
  trips?: TranzyTripResponse[];
  stopTimes?: TranzyStopTimeResponse[];
  
  // Target entities for specific modes
  targetVehicleId?: number;
  targetRouteId?: number;
  targetStationId?: number;
  
  // Debug configuration
  debugMode?: boolean;
  debugData?: DebugVisualizationData;
  
  // Visual configuration
  vehicleColorStrategy?: VehicleColorStrategy;
  colorScheme?: Partial<MapColorScheme>;
  
  // Map configuration
  initialCenter?: Coordinates;
  initialZoom?: number;
  showUserLocation?: boolean;
  performanceConfig?: Partial<MapPerformanceConfig>;
  
  // Loading states
  loadingState?: Partial<MapLoadingState>;
  onLoadingChange?: (loading: MapLoadingState) => void;
  
  // Event handlers
  onVehicleClick?: (vehicle: EnhancedVehicleData) => void;
  onStationClick?: (station: TranzyStopResponse) => void;
  onRouteClick?: (route: TranzyRouteResponse) => void;
}