/**
 * StationLayer - Renders station markers with customizable symbols
 * Supports different symbol types (circle, user-location, terminus, nearby)
 * Implements station click handlers and comprehensive information display
 * Requirements: 1.3, 2.3, 3.1, 7.1, 7.2, 7.3, 7.4
 * Includes performance optimizations and clustering for high-density areas
 */

import type { FC } from 'react';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { CircularProgress, Box } from '@mui/material';
import type { StationLayerProps } from '../../../types/interactiveMap';
import { StationSymbolType, DEFAULT_MAP_PERFORMANCE } from '../../../types/interactiveMap';
import { createStationIcon } from '../../../utils/maps/iconUtils';
import { useOptimizedStations, useDebouncedLoading } from '../../../utils/maps/performanceUtils';

export const StationLayer: FC<StationLayerProps> = ({
  stations,
  stationTypes = new Map(),
  onStationClick,
  highlightedStationId,
  targetStationId, // Target station support
  nextStationId, // NEW: Next station for pulsing animation
  colorScheme,
  performanceConfig = DEFAULT_MAP_PERFORMANCE,
  loading = false,
}) => {
  const map = useMap();
  const [mapBounds, setMapBounds] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  // Update bounds and zoom when map changes
  const updateMapState = useCallback(() => {
    try {
      // Check if map is still valid before accessing bounds
      if (!map || !map.getContainer() || !map.getContainer().parentNode) {
        return;
      }
      
      const bounds = map.getBounds();
      setMapBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
      setZoomLevel(map.getZoom());
    } catch (error) {
      console.warn('Map state update failed:', error);
      // Reset to null on error to prevent further issues
      setMapBounds(null);
    }
  }, [map]);

  // Listen to map events for performance optimization
  useEffect(() => {
    try {
      // Check if map is valid before adding listeners
      if (!map || !map.getContainer()) {
        return;
      }
      
      map.on('moveend', updateMapState);
      map.on('zoomend', updateMapState);
      updateMapState(); // Initial call
      
      return () => {
        try {
          // Safely remove listeners even if map is being destroyed
          if (map && map.off) {
            map.off('moveend', updateMapState);
            map.off('zoomend', updateMapState);
          }
        } catch (error) {
          console.warn('Error removing map listeners:', error);
        }
      };
    } catch (error) {
      console.warn('Error setting up map listeners:', error);
    }
  }, [map, updateMapState]);

  // Filter out stations with invalid coordinates
  const validStations = useMemo(() => {
    return stations.filter(station => {
      const hasValidCoords = station.stop_lat != null && station.stop_lon != null && 
                           !isNaN(station.stop_lat) && !isNaN(station.stop_lon);
      
      if (!hasValidCoords) {
        console.warn(`Station ${station.stop_id} has invalid coordinates:`, station.stop_lat, station.stop_lon);
      }
      
      return hasValidCoords;
    });
  }, [stations]);

  // Apply performance optimizations
  const { optimizedStations } = useOptimizedStations(
    validStations,
    mapBounds,
    performanceConfig,
    zoomLevel
  );

  // Debounce loading state to prevent flicker
  const debouncedLoading = useDebouncedLoading(loading, 300);

  // Handle cluster click
  const handleClusterClick = useCallback((cluster) => {
    // Zoom to cluster bounds
    const bounds = cluster.points.map(point => [point.position.lat, point.position.lon]);
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map]);

  // Show loading indicator if data is loading
  if (debouncedLoading && optimizedStations.length === 0) {
    return (
      <Box
        sx={{
          position: 'absolute',
          top: 40,
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
        <span style={{ fontSize: '12px' }}>Loading stations...</span>
      </Box>
    );
  }

  // Render individual station markers
  return (
    <>
      {optimizedStations.map(station => {
        const isSelected = station.stop_id === highlightedStationId;
        const isTargetStation = station.stop_id === targetStationId;
        const isNextStation = station.stop_id === nextStationId;
        const stationType = stationTypes.get(station.stop_id) || StationSymbolType.DEFAULT;
        
        // Get color based on station type
        let color = colorScheme.stations.default;
        switch (stationType) {
          case StationSymbolType.USER_LOCATION:
            color = colorScheme.stations.userLocation;
            break;
          case StationSymbolType.TERMINUS:
            color = colorScheme.stations.terminus;
            break;
          case StationSymbolType.NEARBY:
            color = colorScheme.stations.nearby;
            break;
        }

        // Override with target station color (bright red) if this is the target
        if (isTargetStation) {
          color = '#E53E3E'; // Bright red for target station
        }
        // Override with next station color (bright blue) if this is the next station
        else if (isNextStation) {
          color = '#3182CE'; // Bright blue for next station
        }
        // Override with selection color if selected (but not target or next)
        else if (isSelected) {
          color = '#FF9800'; // Orange for selected
        }

        // Create icon with appropriate size based on type and selection
        let customSize = stationType === StationSymbolType.USER_LOCATION ? 20 : 
                        stationType === StationSymbolType.TERMINUS ? 18 : 16;
        
        // Make target station larger but smaller than vehicle icons
        if (isTargetStation) {
          customSize = 20; // Larger than normal stations, smaller than vehicles (24px)
        }
        
        let icon;
        try {
          icon = createStationIcon({
            color,
            isSelected: isSelected || isTargetStation || isNextStation,
            symbolType: stationType,
            customSize,
            isPulsing: isNextStation, // Pulse the next station
            pulseColor: '#3182CE' // Blue for pulsing (same as vehicle color)
          });
        } catch (error) {
          console.warn(`Failed to create icon for station ${station.stop_id}:`, error);
          // Return null to skip this marker if icon creation fails
          return null;
        }

        return (
          <Marker
            key={station.stop_id}
            position={[station.stop_lat, station.stop_lon]}
            icon={icon}
            eventHandlers={{
              click: () => onStationClick?.(station),
            }}
          >
            <Popup>
              <div style={{ minWidth: '220px' }}>
                {/* Station header with name and type */}
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '16px', 
                  marginBottom: '8px',
                  color: color,
                  borderBottom: '1px solid #eee',
                  paddingBottom: '6px'
                }}>
                  {station.stop_name}
                </div>
                
                {/* Station type and location type */}
                <div style={{ marginBottom: '6px' }}>
                  <strong>Type:</strong> {stationType === StationSymbolType.DEFAULT ? 'Bus Stop' : 
                                        stationType === StationSymbolType.USER_LOCATION ? 'Your Location' :
                                        stationType === StationSymbolType.TERMINUS ? 'Route Terminus' :
                                        stationType === StationSymbolType.NEARBY ? 'Nearby Stop' : 'Bus Stop'}
                </div>
                
                <div style={{ marginBottom: '6px' }}>
                  <strong>Location:</strong> {
                    station.location_type === 0 ? 'Stop/Platform' :
                    station.location_type === 1 ? 'Station' :
                    station.location_type === 2 ? 'Entrance/Exit' :
                    station.location_type === 3 ? 'Generic Node' :
                    station.location_type === 4 ? 'Boarding Area' :
                    `Type ${station.location_type}`
                  }
                </div>
                
                {/* Stop code if available */}
                {station.stop_code && (
                  <div style={{ marginBottom: '6px' }}>
                    <strong>Stop Code:</strong> {station.stop_code}
                  </div>
                )}
                
                {/* Coordinates */}
                <div style={{ marginBottom: '6px' }}>
                  <strong>Coordinates:</strong> {station.stop_lat?.toFixed(6) ?? 'N/A'}, {station.stop_lon?.toFixed(6) ?? 'N/A'}
                </div>
                
                {/* Station ID for debugging */}
                <div style={{ 
                  fontSize: '12px', 
                  color: '#666', 
                  marginTop: '8px',
                  borderTop: '1px solid #eee',
                  paddingTop: '4px'
                }}>
                  Station ID: {station.stop_id}
                </div>
                
                {/* Visual indicator for special station types */}
                {stationType !== StationSymbolType.DEFAULT && (
                  <div style={{ 
                    fontSize: '12px', 
                    marginTop: '4px',
                    padding: '2px 6px',
                    backgroundColor: color,
                    color: '#fff',
                    borderRadius: '3px',
                    display: 'inline-block'
                  }}>
                    {stationType === StationSymbolType.USER_LOCATION && '📍 Your Location'}
                    {stationType === StationSymbolType.TERMINUS && '🔚 Route End'}
                    {stationType === StationSymbolType.NEARBY && '📍 Nearby'}
                  </div>
                )}

                {/* Performance info for debugging */}
                {process.env.NODE_ENV === 'development' && (
                  <div style={{ 
                    fontSize: '10px', 
                    color: '#999', 
                    marginTop: '4px',
                    borderTop: '1px solid #eee',
                    paddingTop: '2px'
                  }}>
                    Showing {optimizedStations.length} of {stations.length} stations
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      }).filter(Boolean)}
    </>
  );
};