// StationList - Enhanced display component with card-based design matching vehicle cards
// Displays filtered stations with distance, trip information, and expandable vehicle lists
// Includes performance optimizations with memoization and optimized callbacks

import type { FC } from 'react';
import { useState, useCallback, useEffect, memo, useRef } from 'react';
import { 
  Stack, 
  Typography, 
  Chip, 
  IconButton,
  Collapse,
  Card,
  CardContent,
  Box,
  Avatar,
  Tooltip
} from '@mui/material';
import { 
  LocationOn as LocationIcon,
  ExpandMore as ExpandMoreIcon,
  DirectionsBus as BusStopIcon
} from '@mui/icons-material';
import type { FilteredStation, StationUtilities } from '../../../types/stationFilter';
import { StationVehicleList } from './StationVehicleList';
import { useRouteStore } from '../../../stores/routeStore';
import { useFavoritesStore } from '../../../stores/favoritesStore';
import { useStationRoleStore } from '../../../stores/stationRoleStore';
import { useStopTimeStore } from '../../../stores/stopTimeStore';
import { RouteBadge } from '../controls/RouteBadge';
import { shouldShowStationDropOffIndicator } from '../../../utils/station/stationRoleUtils';

interface StationListProps {
  stations: FilteredStation[];
  utilities: StationUtilities;
  vehicleRefreshTimestamp?: number | null;
  vehicleLoading?: boolean; // NEW: vehicle loading state
}

export const StationList: FC<StationListProps> = memo(({ stations, utilities, vehicleRefreshTimestamp, vehicleLoading }) => {
  const { formatDistance, getStationTypeColor, getStationTypeLabel } = utilities;
  const { routes } = useRouteStore();
  const { isFavorite } = useFavoritesStore();
  const { getStationRole } = useStationRoleStore();
  const { stopTimes } = useStopTimeStore();
  
  // Expansion state management per station - collapse all when multiple stations
  const [expandedStations, setExpandedStations] = useState<Set<number>>(() => {
    // If there's only 1 station, expand it by default. If multiple stations, collapse all
    return stations.length === 1 ? new Set(stations.map(fs => fs.station.stop_id)) : new Set();
  });

  // Route filter state management per station - Map<stationId, selectedRouteId | null>
  const [routeFilters, setRouteFilters] = useState<Map<number, number | null>>(new Map());

  // Update expansion state when stations change - preserve user choices during data refreshes
  const prevStationIdsRef = useRef<Set<number>>(new Set());
  
  useEffect(() => {
    // Get current station IDs
    const currentStationIds = new Set(stations.map(fs => fs.station.stop_id));
    const prevStationIds = prevStationIdsRef.current;
    
    // Check if the actual stations changed (not just data refresh)
    const stationsChanged = currentStationIds.size !== prevStationIds.size || 
      [...currentStationIds].some(id => !prevStationIds.has(id)) ||
      [...prevStationIds].some(id => !currentStationIds.has(id));
    
    // Only reset expansion state if stations actually changed, not during data refresh
    if (stationsChanged) {
      // If there's only 1 station, expand it by default. If multiple stations, collapse all
      setExpandedStations(stations.length === 1 ? new Set(stations.map(fs => fs.station.stop_id)) : new Set());
    }
    
    // Update the ref for next comparison
    prevStationIdsRef.current = currentStationIds;
  }, [stations]);

  // Toggle expansion for individual station - memoized to prevent unnecessary re-renders
  const toggleStationExpansion = useCallback((stationId: number) => {
    setExpandedStations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stationId)) {
        newSet.delete(stationId);
      } else {
        newSet.add(stationId);
      }
      return newSet;
    });
  }, []);

  // Route filter handler - memoized to prevent unnecessary re-renders
  const handleRouteFilter = useCallback((stationId: number, routeId: number) => {
    setRouteFilters(prev => {
      const newFilters = new Map(prev);
      const currentFilter = newFilters.get(stationId);
      
      // Toggle logic: if same route clicked, clear filter; otherwise set new filter
      if (currentFilter === routeId) {
        newFilters.set(stationId, null);
      } else {
        newFilters.set(stationId, routeId);
        
        // Expand the station if it's currently collapsed when applying a route filter
        setExpandedStations(prevExpanded => {
          if (!prevExpanded.has(stationId)) {
            const newExpanded = new Set(prevExpanded);
            newExpanded.add(stationId);
            return newExpanded;
          }
          return prevExpanded;
        });
      }
      
      return newFilters;
    });
  }, []);

  if (stations.length === 0) {
    return null; // Empty state handled by parent component
  }

  return (
    <Stack spacing={1.5} sx={{ p: { xs: 1, sm: 2 } }}>
      {stations.map((filteredStation) => {
        const { station, distance, stationType, vehicles, routeIds } = filteredStation;
        const isExpanded = expandedStations.has(station.stop_id);
        const selectedRouteId = routeFilters.get(station.stop_id);
        
        // Get route data for the bubbles
        const stationRoutes = routes.filter(route => routeIds.includes(route.route_id));
        
        // Check if station-level "Drop off only" indicator should be shown
        const showStationDropOffIndicator = shouldShowStationDropOffIndicator(
          vehicles,
          station.stop_id,
          stopTimes
        );
        
        return (
          <Card key={station.stop_id} sx={{ 
            backgroundColor: 'background.paper',
            borderRadius: 2,
            boxShadow: 1
          }}>
            <CardContent sx={{ 
              p: { xs: 1.5, sm: 2 }, 
              '&:last-child': { pb: { xs: 1.5, sm: 2 } } 
            }}>
              {/* Header with station avatar, name, and station ID */}
              <Stack direction="row" alignItems="center" spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 1.5, sm: 2 } }}>
                {/* Station avatar - smaller on mobile */}
                <Avatar sx={{ 
                  bgcolor: 'primary.main', 
                  width: { xs: 40, sm: 48 }, 
                  height: { xs: 40, sm: 48 },
                  fontSize: { xs: '1rem', sm: '1.2rem' },
                  flexShrink: 0,
                  borderRadius: 1
                }} variant="square">
                  <BusStopIcon />
                </Avatar>
                
                {/* Station name and details */}
                <Box sx={{ flex: 1, minWidth: 0 }}> {/* minWidth: 0 allows text truncation */}
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 600, 
                      mb: 0.5,
                      fontSize: { xs: '1rem', sm: '1.25rem' },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {station.stop_name}
                  </Typography>
                  
                  {/* Distance and station type chips */}
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Tooltip 
                      title={`Station ID: ${station.stop_id} | GPS: ${station.stop_lat}, ${station.stop_lon}`}
                      placement="top"
                    >
                      <Chip
                        icon={<LocationIcon />}
                        label={`${formatDistance(distance)}`}
                        color="default"
                        variant="filled"
                        size="small"
                        sx={{ 
                          bgcolor: 'grey.200',
                          color: 'grey.800',
                          '& .MuiChip-icon': { color: 'grey.800' },
                          cursor: 'help'
                        }}
                      />
                    </Tooltip>
                    
                    {/* Station-level "Drop off only" indicator */}
                    {showStationDropOffIndicator && (
                      <Chip
                        label="Drop off only"
                        size="small"
                        variant="outlined"
                        sx={{
                          borderColor: 'error.main',
                          color: 'error.main',
                          bgcolor: 'transparent',
                          fontSize: { xs: '0.7rem', sm: '0.75rem' }
                        }}
                      />
                    )}
                    
                    {/* Station type indicator - blue circle for closest */}
                    {stationType === 'primary' && (
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          flexShrink: 0
                        }}
                      />
                    )}
                  </Stack>
                  
                  {/* Route bubbles - mobile optimized */}
                  {stationRoutes.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Stack 
                        direction="row" 
                        spacing={0.5} 
                        alignItems="center" 
                        flexWrap="wrap"
                        sx={{ 
                          gap: 0.5,
                          maxWidth: '100%'
                        }}
                      >
                        {stationRoutes.map((route) => {
                          const isRouteSelected = selectedRouteId === route.route_id;
                          const isRouteFavorite = isFavorite(String(route.route_id));
                          
                          // Get station role for this route and station
                          const stationRole = getStationRole(route.route_id, station.stop_id);
                          const isStart = stationRole === 'start' || stationRole === 'turnaround';
                          const isEnd = stationRole === 'end' || stationRole === 'turnaround';
                          
                          return (
                            <RouteBadge
                              key={route.route_id}
                              routeNumber={route.route_short_name}
                              routeColor={route.route_color}
                              isStart={isStart}
                              isEnd={isEnd}
                              size="medium"
                              onClick={() => handleRouteFilter(station.stop_id, route.route_id)}
                              selected={isRouteSelected}
                              isFavorite={isRouteFavorite}
                            />
                          );
                        })}
                      </Stack>
                    </Box>
                  )}
                </Box>
                
                {/* Expand button only */}
                <Box display="flex" alignItems="center">
                  <IconButton 
                    size="small"
                    onClick={() => toggleStationExpansion(station.stop_id)}
                    sx={{ 
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }}
                  >
                    <ExpandMoreIcon />
                  </IconButton>
                </Box>
              </Stack>
              {/* Expandable vehicle list section */}
              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <StationVehicleList 
                  vehicles={vehicles}
                  expanded={isExpanded}
                  station={station}
                  stationRouteCount={routeIds.length}
                  selectedRouteId={selectedRouteId}
                  vehicleRefreshTimestamp={vehicleRefreshTimestamp}
                  vehicleLoading={vehicleLoading}
                  routeIds={routeIds}
                />
              </Collapse>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
});

// Display name for debugging
StationList.displayName = 'StationList';