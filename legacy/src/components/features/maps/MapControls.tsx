/**
 * MapControls - UI controls overlay for map interaction
 * Provides mode switching, debug toggle, and layer visibility controls
 * Positioned as overlay on top of the map
 */

import type { FC } from 'react';
import { 
  Box, 
  Paper, 
  ToggleButtonGroup, 
  ToggleButton, 
  IconButton, 
  Tooltip,
  Divider
} from '@mui/material';
import {
  DirectionsBus as VehicleIcon,
  Route as RouteIcon,
  LocationOn as StationIcon,
  BugReport as DebugIcon,
  MyLocation as LocationIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import type { MapControlsProps } from '../../../types/interactiveMap';
import { MapMode } from '../../../types/interactiveMap';

export const MapControls: FC<MapControlsProps> = ({
  mode,
  onModeChange,
  debugMode,
  onDebugToggle,
  showUserLocation,
  onUserLocationToggle,
  showVehicles,
  onVehiclesToggle,
  showRouteShapes,
  onRouteShapesToggle,
  showStations,
  onStationsToggle,
}) => {
  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 1,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {/* Map mode selector */}
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, newMode) => {
            if (newMode) onModeChange(newMode);
          }}
          orientation="horizontal"
          size="small"
        >
          <ToggleButton value={MapMode.VEHICLE_TRACKING}>
            <Tooltip title="Vehicle Tracking" placement="top">
              <VehicleIcon />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value={MapMode.ROUTE_OVERVIEW}>
            <Tooltip title="Route Overview" placement="top">
              <RouteIcon />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Layer visibility controls */}
        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0.5 }}>
          {/* Vehicles layer toggle */}
          <Tooltip title={`${showVehicles ? 'Hide' : 'Show'} Vehicles`} placement="top">
            <IconButton
              size="small"
              color={showVehicles ? 'primary' : 'default'}
              onClick={() => onVehiclesToggle(!showVehicles)}
            >
              <VehicleIcon />
            </IconButton>
          </Tooltip>

          {/* Route shapes layer toggle */}
          <Tooltip title={`${showRouteShapes ? 'Hide' : 'Show'} Route Shapes`} placement="top">
            <IconButton
              size="small"
              color={showRouteShapes ? 'primary' : 'default'}
              onClick={() => onRouteShapesToggle(!showRouteShapes)}
            >
              <RouteIcon />
            </IconButton>
          </Tooltip>

          {/* Stations layer toggle */}
          <Tooltip title={`${showStations ? 'Hide' : 'Show'} Stations`} placement="top">
            <IconButton
              size="small"
              color={showStations ? 'primary' : 'default'}
              onClick={() => onStationsToggle(!showStations)}
            >
              <StationIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Additional controls */}
        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0.5 }}>
          {/* User location toggle */}
          <Tooltip title={`${showUserLocation ? 'Hide' : 'Show'} User Location`} placement="top">
            <IconButton
              size="small"
              color={showUserLocation ? 'primary' : 'default'}
              onClick={() => onUserLocationToggle(!showUserLocation)}
            >
              <LocationIcon />
            </IconButton>
          </Tooltip>

          {/* Debug toggle */}
          <Tooltip title="Toggle Debug Mode" placement="top">
            <IconButton
              size="small"
              color={debugMode ? 'primary' : 'default'}
              onClick={() => onDebugToggle(!debugMode)}
            >
              <DebugIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>
    </Box>
  );
};