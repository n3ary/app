/**
 * Map Performance Utilities
 * Performance optimizations specifically for map components
 * Includes clustering, throttling, and viewport-based filtering
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import type { TranzyVehicleResponse, TranzyStopResponse } from '../../types/rawTranzyApi';
import type { EnhancedVehicleData } from '../vehicle/vehicleEnhancementUtils';
import type { Coordinates } from '../../utils/location/distanceUtils';
import type { MapPerformanceConfig } from '../../types/map/mapState';
import { throttle } from '../core/performanceUtils';

// ============================================================================
// Clustering Utilities
// ============================================================================

export interface ClusterPoint {
  id: string;
  position: Coordinates;
  data: TranzyVehicleResponse | TranzyStopResponse | EnhancedVehicleData;
}

export interface Cluster {
  id: string;
  center: Coordinates;
  points: ClusterPoint[];
  size: number;
}

/**
 * Simple clustering algorithm for map markers
 * Groups nearby points to reduce visual clutter and improve performance
 */
export function clusterPoints(
  points: ClusterPoint[],
  threshold: number = 50, // pixels
  zoomLevel: number = 13
): Cluster[] {
  if (points.length === 0) return [];
  
  // Convert pixel threshold to coordinate threshold based on zoom level
  const coordThreshold = threshold / (111000 * Math.pow(2, zoomLevel - 10));
  
  const clusters: Cluster[] = [];
  const processed = new Set<string>();
  
  for (const point of points) {
    if (processed.has(point.id)) continue;
    
    const cluster: Cluster = {
      id: `cluster-${clusters.length}`,
      center: point.position,
      points: [point],
      size: 1,
    };
    
    processed.add(point.id);
    
    // Find nearby points to cluster
    for (const otherPoint of points) {
      if (processed.has(otherPoint.id)) continue;
      
      const distance = calculateDistance(point.position, otherPoint.position);
      if (distance <= coordThreshold) {
        cluster.points.push(otherPoint);
        cluster.size++;
        processed.add(otherPoint.id);
        
        // Update cluster center (simple average)
        cluster.center = {
          lat: cluster.points.reduce((sum, p) => sum + p.position.lat, 0) / cluster.points.length,
          lon: cluster.points.reduce((sum, p) => sum + p.position.lon, 0) / cluster.points.length,
        };
      }
    }
    
    clusters.push(cluster);
  }
  
  return clusters;
}

/**
 * Calculate distance between two coordinates (simple Euclidean)
 * For clustering purposes, we don't need precise geodesic distance
 */
function calculateDistance(pos1: Coordinates, pos2: Coordinates): number {
  const latDiff = pos1.lat - pos2.lat;
  const lonDiff = pos1.lon - pos2.lon;
  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
}

// ============================================================================
// Viewport Filtering
// ============================================================================

export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Filter points to only include those within viewport bounds plus buffer
 * Improves performance by not rendering off-screen markers
 */
export function filterPointsByViewport<T extends { latitude?: number; longitude?: number; stop_lat?: number; stop_lon?: number }>(
  points: T[],
  bounds: ViewportBounds,
  bufferKm: number = 5
): T[] {
  // Convert buffer from km to degrees (approximate)
  const bufferDegrees = bufferKm / 111; // 1 degree ≈ 111 km
  
  const expandedBounds = {
    north: bounds.north + bufferDegrees,
    south: bounds.south - bufferDegrees,
    east: bounds.east + bufferDegrees,
    west: bounds.west - bufferDegrees,
  };
  
  return points.filter(point => {
    const lat = point.latitude ?? point.stop_lat;
    const lon = point.longitude ?? point.stop_lon;
    
    if (lat == null || lon == null) return false;
    
    return (
      lat >= expandedBounds.south &&
      lat <= expandedBounds.north &&
      lon >= expandedBounds.west &&
      lon <= expandedBounds.east
    );
  });
}

// ============================================================================
// Performance Hooks
// ============================================================================

/**
 * Hook for throttled map updates
 * Prevents excessive re-renders during rapid data changes
 */
export function useThrottledMapUpdate<T>(
  data: T,
  throttleMs: number = 1000
): T {
  const [throttledData, setThrottledData] = useState<T>(data);
  const throttledUpdate = useRef(
    throttle((newData: T) => setThrottledData(newData), throttleMs)
  );
  
  useEffect(() => {
    throttledUpdate.current(data);
  }, [data]);
  
  return throttledData;
}

/**
 * Hook for performance-optimized vehicle filtering
 * Combines viewport filtering, clustering, and throttling
 */
export function useOptimizedVehicles(
  vehicles: EnhancedVehicleData[],
  bounds: ViewportBounds | null,
  performanceConfig: MapPerformanceConfig,
  zoomLevel: number = 13
): {
  optimizedVehicles: EnhancedVehicleData[];
  clusters: Cluster[];
  shouldCluster: boolean;
} {
  return useMemo(() => {
    // Step 1: Filter by viewport if bounds available
    let filteredVehicles = bounds 
      ? filterPointsByViewport(vehicles, bounds, performanceConfig.renderDistance / 1000)
      : vehicles;
    
    // Step 2: Limit total markers for performance
    if (filteredVehicles.length > performanceConfig.maxVehicleMarkers) {
      // Sort by some criteria (e.g., most recent updates) and take top N
      filteredVehicles = filteredVehicles
        .sort((a, b) => {
          const aTime = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : (a.timestamp || 0);
          const bTime = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : (b.timestamp || 0);
          return bTime - aTime;
        })
        .slice(0, performanceConfig.maxVehicleMarkers);
    }
    
    // Step 3: Determine if clustering is needed
    const shouldCluster = filteredVehicles.length > performanceConfig.clusteringThreshold;
    
    let clusters: Cluster[] = [];
    if (shouldCluster) {
      const clusterPointsArray: ClusterPoint[] = filteredVehicles.map(vehicle => ({
        id: vehicle.id.toString(),
        position: { lat: vehicle.latitude, lon: vehicle.longitude },
        data: vehicle,
      }));
      
      clusters = clusterPoints(clusterPointsArray, 50, zoomLevel);
    }
    
    return {
      optimizedVehicles: filteredVehicles,
      clusters,
      shouldCluster,
    };
  }, [vehicles, bounds, performanceConfig, zoomLevel]);
}

/**
 * Hook for performance-optimized station filtering
 * Similar to vehicle optimization but for stations
 */
export function useOptimizedStations(
  stations: TranzyStopResponse[],
  bounds: ViewportBounds | null,
  performanceConfig: MapPerformanceConfig,
  zoomLevel: number = 13
): {
  optimizedStations: TranzyStopResponse[];
  clusters: Cluster[];
  shouldCluster: boolean;
} {
  return useMemo(() => {
    // Step 1: Filter by viewport if bounds available
    let filteredStations = bounds 
      ? filterPointsByViewport(stations, bounds, performanceConfig.renderDistance / 1000)
      : stations;
    
    // Step 2: Determine if clustering is needed
    const shouldCluster = filteredStations.length > performanceConfig.clusteringThreshold;
    
    let clusters: Cluster[] = [];
    if (shouldCluster) {
      const clusterPointsArray: ClusterPoint[] = filteredStations.map(station => ({
        id: station.stop_id.toString(),
        position: { lat: station.stop_lat, lon: station.stop_lon },
        data: station,
      }));
      
      clusters = clusterPoints(clusterPointsArray, 50, zoomLevel);
    }
    
    return {
      optimizedStations: filteredStations,
      clusters,
      shouldCluster,
    };
  }, [stations, bounds, performanceConfig, zoomLevel]);
}

/**
 * Hook for debounced loading state updates
 * Prevents flickering loading indicators for quick operations
 */
export function useDebouncedLoading(loading: boolean, delay: number = 300): boolean {
  const [debouncedLoading, setDebouncedLoading] = useState(loading);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  useEffect(() => {
    if (loading) {
      // Show loading immediately
      setDebouncedLoading(true);
    } else {
      // Delay hiding loading to prevent flicker
      timeoutRef.current = setTimeout(() => {
        setDebouncedLoading(false);
      }, delay);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [loading, delay]);
  
  return debouncedLoading;
}