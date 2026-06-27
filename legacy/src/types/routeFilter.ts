import type { TranzyRouteResponse, TRANSPORT_TYPE_MAP, TransportTypeKey } from './rawTranzyApi';

// Re-export for convenience
export { TRANSPORT_TYPE_MAP, type TransportTypeKey, getTransportTypeOptions } from './rawTranzyApi';

/**
 * Enhanced route interface with computed attributes for filtering
 * Extends the raw API response with isFavorite flag
 */
export interface EnhancedRoute extends TranzyRouteResponse {
  /** True if route is marked as favorite by the user */
  isFavorite: boolean;
}

/**
 * Transport type filter state - toggleable selection
 * When no types are selected, shows all transport types
 */
export interface TransportTypeFilters {
  /** Filter for Bus routes (route_type=3) */
  bus: boolean;
  /** Filter for Tram routes (route_type=0) */
  tram: boolean;
  /** Filter for Trolleybus routes (route_type=11) */
  trolleybus: boolean;
}

/**
 * Meta filter options for special route categories
 */
export interface MetaFilters {
  /** Filter for favorite routes */
  favorites: boolean;
}

/**
 * Complete filter state for route filtering system
 * Combines transport type toggles with meta filter toggles
 */
export interface RouteFilterState {
  /** Transport type filters (toggleable selection) */
  transportTypes: TransportTypeFilters;
  /** Secondary meta filters (toggle selection) */
  metaFilters: MetaFilters;
}

/**
 * Default filter state - shows all routes
 * All transport types inactive (shows all transport types), meta filters inactive
 */
export const DEFAULT_FILTER_STATE: RouteFilterState = {
  transportTypes: {
    bus: false,
    tram: false,
    trolleybus: false
  },
  metaFilters: {
    favorites: false
  }
} as const;