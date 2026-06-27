// Route Enhancement Utilities
// Computes additional attributes for routes to support filtering functionality

import type { TranzyRouteResponse } from '../../types/rawTranzyApi';
import type { EnhancedRoute } from '../../types/routeFilter';

/**
 * Enhance a single route with computed attributes
 * Computes isFavorite flag based on favorites array
 * 
 * @param route - Raw route data from Tranzy API
 * @param favoriteRouteIds - Array of favorite route IDs
 * @returns Enhanced route with computed attributes
 */
export function enhanceRoute(route: TranzyRouteResponse, favoriteRouteIds: string[] = []): EnhancedRoute {
  // Compute isFavorite: route ID exists in favorites array
  const isFavorite = favoriteRouteIds.includes(String(route.route_id));
  
  return {
    ...route,
    isFavorite
  };
}

/**
 * Enhance an array of routes with computed attributes
 * Applies enhancement logic to each route in the array
 * 
 * @param routes - Array of raw route data from Tranzy API
 * @param favoriteRouteIds - Array of favorite route IDs
 * @returns Array of enhanced routes with computed attributes
 */
export function enhanceRoutes(routes: TranzyRouteResponse[], favoriteRouteIds: string[] = []): EnhancedRoute[] {
  // Handle edge case: empty or invalid routes array
  if (!Array.isArray(routes)) {
    return [];
  }
  
  return routes.map(route => enhanceRoute(route, favoriteRouteIds));
}