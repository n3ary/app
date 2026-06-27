// Route Filtering Utilities
// Implements filtering logic for transport type and favorites filter

import type { EnhancedRoute, RouteFilterState } from '../../types/routeFilter';
import { TRANSPORT_TYPE_MAP } from '../../types/routeFilter';

/**
 * Filter enhanced routes based on the provided filter state
 * Implements combined filter logic with transport type and favorites filter
 * Favorites are always included regardless of other active filters
 * 
 * @param routes - Array of enhanced routes to filter
 * @param filterState - Current filter state with transport types and meta filters
 * @returns Array of routes matching the filter criteria, sorted with favorites first
 */
export function filterRoutes(
  routes: EnhancedRoute[], 
  filterState: RouteFilterState
): EnhancedRoute[] {
  // Handle edge case: empty or invalid routes array
  if (!Array.isArray(routes)) {
    return [];
  }

  const filteredRoutes = routes.filter(route => {
    // Step 1: Always include favorites (they bypass all other filters)
    if (route.isFavorite) {
      return true;
    }
    
    // Step 2: Apply favorites filter (if active, only show favorites)
    if (filterState.metaFilters.favorites) {
      return false; // Non-favorites are excluded when favorites filter is active
    }
    
    // Step 3: Apply transport type filter to non-favorites
    // If no transport types are selected, show all transport types
    const { bus, tram, trolleybus } = filterState.transportTypes;
    const hasActiveTransportFilters = bus || tram || trolleybus;
    
    if (hasActiveTransportFilters) {
      // Check if route matches any of the selected transport types
      const routeTypeMatches = (
        (bus && route.route_type === TRANSPORT_TYPE_MAP.bus) ||
        (tram && route.route_type === TRANSPORT_TYPE_MAP.tram) ||
        (trolleybus && route.route_type === TRANSPORT_TYPE_MAP.trolleybus)
      );
      
      if (!routeTypeMatches) {
        return false;
      }
    }
    
    // Route passes all filter constraints
    return true;
  });

  // Sort filtered routes with favorites first
  return sortRoutesWithFavoritesFirst(filteredRoutes);
}

/**
 * Filter routes by transport types only
 * Utility function for transport type filtering without meta filters
 * Favorites are always included regardless of transport type filters
 * 
 * @param routes - Array of enhanced routes to filter
 * @param transportTypes - Transport type filters object
 * @returns Array of routes matching the selected transport types, sorted with favorites first
 */
export function filterRoutesByTransportType(
  routes: EnhancedRoute[], 
  transportTypes: { bus: boolean; tram: boolean; trolleybus: boolean }
): EnhancedRoute[] {
  if (!Array.isArray(routes)) {
    return [];
  }

  // If no transport types are selected, return all routes
  const { bus, tram, trolleybus } = transportTypes;
  const hasActiveTransportFilters = bus || tram || trolleybus;
  
  let filteredRoutes = routes;
  
  if (hasActiveTransportFilters) {
    filteredRoutes = routes.filter(route => {
      // Always include favorites regardless of transport type filters
      if (route.isFavorite) {
        return true;
      }
      
      // Apply transport type filter to non-favorites
      return (
        (bus && route.route_type === TRANSPORT_TYPE_MAP.bus) ||
        (tram && route.route_type === TRANSPORT_TYPE_MAP.tram) ||
        (trolleybus && route.route_type === TRANSPORT_TYPE_MAP.trolleybus)
      );
    });
  }

  // Sort filtered routes with favorites first
  return sortRoutesWithFavoritesFirst(filteredRoutes);
}

/**
 * Check if any transport type filters are active in the filter state
 * Utility function to determine if transport type filtering should be applied
 * 
 * @param filterState - Current filter state
 * @returns True if any transport type filter is active, false otherwise
 */
export function hasActiveTransportFilters(filterState: RouteFilterState): boolean {
  const { bus, tram, trolleybus } = filterState.transportTypes;
  return bus || tram || trolleybus;
}

/**
 * Check if any meta filters are active in the filter state
 * Utility function to determine if meta filter logic should be applied
 * 
 * @param filterState - Current filter state
 * @returns True if any meta filter is active, false otherwise
 */
export function hasActiveMetaFilters(filterState: RouteFilterState): boolean {
  return filterState.metaFilters.favorites;
}

/**
 * Get the count of routes that would be returned by the filter
 * Utility function for displaying filter result counts without computing the full result
 * 
 * @param routes - Array of enhanced routes to count
 * @param filterState - Current filter state
 * @returns Number of routes that match the filter criteria
 */
export function getFilteredRouteCount(
  routes: EnhancedRoute[], 
  filterState: RouteFilterState
): number {
  return filterRoutes(routes, filterState).length;
}

/**
 * Validate filter state structure
 * Ensures the filter state has the expected structure and valid values
 * 
 * @param filterState - Filter state to validate
 * @returns True if filter state is valid, false otherwise
 */
export function isValidFilterState(filterState: any): filterState is RouteFilterState {
  if (!filterState || typeof filterState !== 'object') {
    return false;
  }
  
  // Check transport types structure
  if (!filterState.transportTypes || typeof filterState.transportTypes !== 'object') {
    return false;
  }
  
  const { bus, tram, trolleybus } = filterState.transportTypes;
  if (typeof bus !== 'boolean' || typeof tram !== 'boolean' || typeof trolleybus !== 'boolean') {
    return false;
  }
  
  // Check meta filters structure
  if (!filterState.metaFilters || typeof filterState.metaFilters !== 'object') {
    return false;
  }
  
  if (typeof filterState.metaFilters.favorites !== 'boolean') {
    return false;
  }
  
  return true;
}

/**
 * Sort routes with favorites appearing first in the list
 * Maintains original order within favorite and non-favorite groups
 * 
 * @param routes - Array of enhanced routes to sort
 * @returns Array of routes sorted with favorites first
 */
export function sortRoutesWithFavoritesFirst(routes: EnhancedRoute[]): EnhancedRoute[] {
  if (!Array.isArray(routes)) {
    return [];
  }

  return routes.sort((a, b) => {
    // Favorites first: if one is favorite and other is not, favorite comes first
    if (a.isFavorite && !b.isFavorite) {
      return -1;
    }
    if (!a.isFavorite && b.isFavorite) {
      return 1;
    }
    
    // Both are favorites or both are not favorites - maintain original order
    return 0;
  });
}