/**
 * VehicleLayer - Renders vehicle markers on the map with route-based coloring
 * Handles vehicle click events and popup functionality
 * Supports multiple coloring strategies: by route, by confidence, uniform
 * Includes performance optimizations, loading states, and smooth animation
 */

import type { FC } from 'react';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { CircularProgress, Box } from '@mui/material';
import type { VehicleLayerProps } from '../../../types/interactiveMap';
import { VehicleColorStrategy, DEFAULT_MAP_PERFORMANCE } from '../../../types/interactiveMap';
import { useOptimizedVehicles, useDebouncedLoading } from '../../../utils/maps/performanceUtils';
import { AnimatedVehicleMarker } from './AnimatedVehicleMarker';

// Extend window object for tracking logged vehicles
declare global {
  interface Window {
    loggedInvalidVehicles?: Set<number>;
  }
}

export const VehicleLayer: FC<VehicleLayerProps> = ({
  vehicles,
  routes,
  trips,
  onVehicleClick,
  highlightedVehicleId,
  colorStrategy = VehicleColorStrategy.BY_ROUTE,
  colorScheme,
  performanceConfig = DEFAULT_MAP_PERFORMANCE,
  loading = false,
}) => {
  const map = useMap();
  const [mapBounds, setMapBounds] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  // Update bounds and zoom when map changes
  const updateMapState = useCallback(() => {
    const bounds = map.getBounds();
    setMapBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
    setZoomLevel(map.getZoom());
  }, [map]);

  // Listen to map events for performance optimization
  useEffect(() => {
    map.on('moveend', updateMapState);
    map.on('zoomend', updateMapState);
    updateMapState(); // Initial call
    
    return () => {
      map.off('moveend', updateMapState);
      map.off('zoomend', updateMapState);
    };
  }, [map, updateMapState]);

  // Filter out vehicles with invalid coordinates upfront to prevent spam
  const validVehicles = useMemo(() => {
    const valid = vehicles.filter(vehicle => {
      const hasValidCoords = vehicle.latitude != null && vehicle.longitude != null && 
                           !isNaN(vehicle.latitude) && !isNaN(vehicle.longitude);
      
      // Only log once per vehicle ID to prevent spam
      if (!hasValidCoords && !window.loggedInvalidVehicles?.has(vehicle.id)) {
        if (!window.loggedInvalidVehicles) {
          window.loggedInvalidVehicles = new Set();
        }
        window.loggedInvalidVehicles.add(vehicle.id);
        console.warn(`Vehicle ${vehicle.id} has invalid coordinates:`, vehicle.latitude, vehicle.longitude);
      }
      
      return hasValidCoords;
    });
    
    return valid;
  }, [vehicles]);

  // Apply performance optimizations
  const { optimizedVehicles } = useOptimizedVehicles(
    validVehicles,
    mapBounds,
    performanceConfig,
    zoomLevel
  );

  // Debounce loading state to prevent flicker
  const debouncedLoading = useDebouncedLoading(loading, 300);

  // Get color for vehicle based on strategy - always use station blue
  const getVehicleColor = useCallback((vehicle: typeof vehicles[0]): string => {
    switch (colorStrategy) {
      case VehicleColorStrategy.BY_ROUTE:
        // Always use station blue instead of route-based colors
        return '#3182CE'; // Station blue
      
      case VehicleColorStrategy.BY_CONFIDENCE:
        // Use speed as a proxy for confidence - stationary vehicles might have lower confidence
        // In a real implementation, this would use actual arrival confidence data
        if (vehicle.speed === 0) {
          return colorScheme.vehicles.lowConfidence;
        } else if (vehicle.speed < 10) {
          // Medium confidence for slow-moving vehicles
          return '#FFA726'; // Orange for medium confidence
        } else {
          // High confidence for normal-speed vehicles
          return '#4CAF50'; // Green for high confidence
        }
      
      case VehicleColorStrategy.UNIFORM:
      default:
        return '#3182CE'; // Station blue
    }
  }, [colorStrategy, colorScheme]);

  // Handle cluster click
  const handleClusterClick = useCallback((cluster) => {
    // Zoom to cluster bounds
    const bounds = cluster.points.map(point => [point.position.lat, point.position.lon]);
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map]);

  // Show loading indicator if data is loading
  if (debouncedLoading && optimizedVehicles.length === 0) {
    return (
      <Box
        sx={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: 1,
          p: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <CircularProgress size={16} />
        <span style={{ fontSize: '12px' }}>Loading vehicles...</span>
      </Box>
    );
  }

  // Render individual vehicle markers with smooth animation
  return (
    <>
      {optimizedVehicles.map(vehicle => {
        const isSelected = vehicle.id === highlightedVehicleId;
        const color = getVehicleColor(vehicle);
        const route = vehicle.route_id ? routes.get(vehicle.route_id) : null;
        const trip = vehicle.trip_id && trips ? trips.get(vehicle.trip_id) : null;

        return (
          <AnimatedVehicleMarker
            key={vehicle.id}
            vehicle={vehicle}
            route={route}
            trip={trip}
            onVehicleClick={onVehicleClick}
            isSelected={isSelected}
            color={color}
          />
        );
      })}
      
      {/* Performance info for debugging */}
      {process.env.NODE_ENV === 'development' && optimizedVehicles.length > 0 && (
        <div style={{ 
          position: 'absolute',
          bottom: 10,
          left: 10,
          zIndex: 1000,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: 4,
          padding: 8,
          fontSize: '10px',
          color: '#999'
        }}>
          Showing {optimizedVehicles.length} of {vehicles.length} vehicles
        </div>
      )}
    </>
  );
};