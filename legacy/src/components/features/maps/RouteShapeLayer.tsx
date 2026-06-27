/**
 * RouteShapeLayer - Renders route shapes as colored lines with direction indicators
 * Supports multiple route shapes with distinct styling and direction arrows
 * Implements requirements 1.2, 2.1, 2.2, 2.4, 3.2, 3.4
 * Includes performance optimizations for large datasets
 */

import type { FC } from 'react';
import React, { useMemo, useCallback } from 'react';
import { Polyline, Popup, Marker } from 'react-leaflet';
import { CircularProgress, Box } from '@mui/material';
import type { RouteShapeLayerProps, MapColorScheme } from '../../../types/interactiveMap';
import type { Coordinates } from '../../../utils/location/distanceUtils';
import type { TranzyRouteResponse } from '../../../types/rawTranzyApi';
import { calculateBearing } from '../../../utils/arrival/geometryUtils';
import { createDirectionArrow } from '../../../utils/maps/iconUtils';
import { useDebouncedLoading } from '../../../utils/maps/performanceUtils';
import { PerformanceMonitor } from '../../../utils/core/performanceUtils';



// Find route associated with a shape ID
const findRouteForShape = (shapeId: string, routes: Map<number, TranzyRouteResponse>): TranzyRouteResponse | null => {
  // Look for routes that might use this shape
  // In a real implementation, this would use trip data to map shapes to routes
  // For now, we'll try to extract route info from shape ID if it follows a pattern
  const routeIdMatch = shapeId.match(/^(\d+)_/);
  if (routeIdMatch) {
    const routeId = parseInt(routeIdMatch[1], 10);
    return routes.get(routeId) || null;
  }
  
  // Fallback: return first route if no pattern match
  return routes.values().next().value || null;
};

// Get color for route shape - always use consistent purple
const getRouteShapeColor = (
  shapeId: string, 
  routes: Map<number, TranzyRouteResponse>, 
  colorScheme: MapColorScheme,
  isHighlighted: boolean
): string => {
  // Always use consistent lighter purple for all route shapes
  return '#8B5CF6'; // Lighter purple
};

// Calculate direction arrow positions along the route
const calculateArrowPositions = (points: Coordinates[], maxArrows: number = 5): Array<{
  position: Coordinates;
  bearing: number;
}> => {
  if (points.length < 2) return [];
  
  const arrows: Array<{ position: Coordinates; bearing: number }> = [];
  const totalPoints = points.length;
  const interval = Math.max(1, Math.floor(totalPoints / (maxArrows + 1)));
  
  for (let i = interval; i < totalPoints - 1; i += interval) {
    if (arrows.length >= maxArrows) break;
    
    const current = points[i];
    const next = points[i + 1];
    const bearing = calculateBearing(current, next);
    
    arrows.push({
      position: current,
      bearing,
    });
  }
  
  return arrows;
};

export const RouteShapeLayer: FC<RouteShapeLayerProps> = React.memo(({
  routeShapes,
  routes,
  highlightedRouteIds = [],
  showDirectionArrows = false,
  colorScheme,
  onRouteClick,
  performanceConfig,
  loading = false,
}) => {
  // Debounce loading state to prevent flicker
  const debouncedLoading = useDebouncedLoading(loading, 300);

  // Use all route shapes without limiting
  const optimizedRouteShapes = routeShapes;

  // Handle route click with performance monitoring
  const handleRouteClick = useCallback((route: TranzyRouteResponse) => {
    PerformanceMonitor.measure('RouteShapeLayer:click', () => {
      onRouteClick?.(route);
    });
  }, [onRouteClick]);

  // Show loading indicator if data is loading
  if (debouncedLoading && optimizedRouteShapes.size === 0) {
    return (
      <Box
        sx={{
          position: 'absolute',
          top: 10,
          left: 10,
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
        <span style={{ fontSize: '12px' }}>Loading routes...</span>
      </Box>
    );
  }

  return (
    <>
      {Array.from(optimizedRouteShapes.entries()).map(([shapeId, routeShape]) => {
        // Use original route points without simplification
        const positions = routeShape.points.map(point => [point.lat, point.lon] as [number, number]);
        
        if (positions.length < 2) {
          // Skip shapes with insufficient points
          return null;
        }
        
        // Find associated route for this shape
        const associatedRoute = findRouteForShape(shapeId, routes);
        const isHighlighted = associatedRoute && highlightedRouteIds.includes(associatedRoute.route_id);
        
        // Get color for this route shape
        const color = getRouteShapeColor(shapeId, routes, colorScheme, isHighlighted);
        
        // Calculate direction arrows if enabled (limit for performance)
        const arrows = showDirectionArrows ? calculateArrowPositions(routeShape.points, 3) : [];
        
        return (
          <React.Fragment key={shapeId}>
            {/* Route shape polyline */}
            <Polyline
              key={`${shapeId}-line`}
              positions={positions}
              pathOptions={{
                color,
                weight: isHighlighted ? 6 : 4,
                opacity: isHighlighted ? 1.0 : 0.8,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={{
                click: () => {
                  if (associatedRoute) {
                    handleRouteClick(associatedRoute);
                  }
                },
              }}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '16px', 
                    marginBottom: '8px',
                    color 
                  }}>
                    Route Shape
                  </div>
                  
                  {associatedRoute && (
                    <>
                      <div style={{ marginBottom: '6px' }}>
                        <strong>Route:</strong> {associatedRoute.route_short_name} - {associatedRoute.route_long_name}
                      </div>
                      <div style={{ marginBottom: '6px' }}>
                        <strong>Type:</strong> {associatedRoute.route_desc || 'Transit'}
                      </div>
                    </>
                  )}
                  
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Shape ID:</strong> {shapeId}
                  </div>
                  
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Points:</strong> {routeShape.points.length}
                  </div>
                  
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Segments:</strong> {routeShape.segments.length}
                  </div>
                  
                  {routeShape.segments.length > 0 && (
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#666', 
                      marginTop: '8px',
                      borderTop: '1px solid #eee',
                      paddingTop: '4px'
                    }}>
                      Total Distance: {routeShape.segments.reduce((sum, seg) => sum + seg.distance, 0).toFixed(0)}m
                    </div>
                  )}
                </div>
              </Popup>
            </Polyline>
            
            {/* Direction arrows */}
            {showDirectionArrows && arrows.map((arrow, index) => (
              <Marker
                key={`${shapeId}-arrow-${index}`}
                position={[arrow.position.lat, arrow.position.lon]}
                icon={createDirectionArrow({ color: '#000000', bearing: arrow.bearing })} // Black with white border
                interactive={false} // Arrows shouldn't be clickable
              />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
});