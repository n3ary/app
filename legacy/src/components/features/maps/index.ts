/**
 * Interactive Transit Map Components
 * Export essential map components copied from feature branch
 */

export { VehicleMapDialog } from './VehicleMapDialog';
export { VehicleLayer } from './VehicleLayer';
export { RouteShapeLayer } from './RouteShapeLayer';
export { StationLayer } from './StationLayer';
export { UserLocationLayer } from './UserLocationLayer';
export { DebugLayer } from './DebugLayer';
export { MapControls } from './MapControls';

// Re-export types for convenience
export type {
  MapColorScheme,
  MapPerformanceConfig,
  VehicleLayerProps,
  RouteShapeLayerProps,
  StationLayerProps,
  UserLocationLayerProps,
  DebugLayerProps,
  MapControlsProps,
  DebugVisualizationData,
} from '../../../types/interactiveMap';

export {
  MapMode,
  VehicleColorStrategy,
  StationSymbolType,
  DEFAULT_MAP_COLORS,
  DEFAULT_MAP_PERFORMANCE,
  MAP_DEFAULTS,
} from '../../../types/interactiveMap';