import { useMemo } from 'react';
import type { TranzyRouteResponse } from '../types/rawTranzyApi';
import type { EnhancedRoute, RouteFilterState } from '../types/routeFilter';
import { enhanceRoutes } from '../utils/route/routeEnhancementUtils';
import { filterRoutes } from '../utils/route/routeFilterUtils';
import { useFavoritesStore } from '../stores/favoritesStore';

/**
 * Return type for useRouteFilter hook
 */
export interface UseRouteFilterReturn {
  /** Routes enhanced with computed attributes (isFavorite) */
  enhancedRoutes: EnhancedRoute[];
  /** Routes filtered based on current filter state */
  filteredRoutes: EnhancedRoute[];
}

/**
 * Custom hook for route enhancement and filtering with memoization
 * 
 * Enhances raw route data with computed attributes and applies filtering logic
 * based on the provided filter state. Uses memoization to optimize performance
 * by only recomputing when dependencies change.
 * 
 * @param routes - Raw route data from API
 * @param filterState - Current filter state (transport type and meta filters)
 * @returns Object containing enhanced and filtered routes
 * 
 * @example
 * ```tsx
 * const { filteredRoutes } = useRouteFilter(routes, filterState);
 * ```
 */
export function useRouteFilter(
  routes: TranzyRouteResponse[],
  filterState: RouteFilterState
): UseRouteFilterReturn {
  // Subscribe to favorites store changes via lastUpdated
  const lastUpdated = useFavoritesStore((state) => state.lastUpdated);
  const getFavoriteRouteIds = useFavoritesStore((state) => state.getFavoriteRouteIds);
  
  // Memoize route enhancement - recompute when routes or favorites change
  const enhancedRoutes = useMemo(() => {
    const favoriteRouteIds = getFavoriteRouteIds();
    return enhanceRoutes(routes, favoriteRouteIds);
  }, [routes, getFavoriteRouteIds, lastUpdated]); // Include lastUpdated to trigger updates

  // Memoize filtering - only recompute when enhanced routes or filter state changes
  const filteredRoutes = useMemo(() => {
    return filterRoutes(enhancedRoutes, filterState);
  }, [enhancedRoutes, filterState]);

  return {
    enhancedRoutes,
    filteredRoutes
  };
}
