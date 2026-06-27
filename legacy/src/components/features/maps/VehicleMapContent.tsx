/**
 * VehicleMapContent - Map content and layers for vehicle tracking
 * Handles the map layers, controls, and viewport management
 */

import type { FC } from 'react';
import { useRef, useEffect, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { VehicleLayer } from './VehicleLayer';
import { RouteShapeLayer } from './RouteShapeLayer';
import { StationLayer } from './StationLayer';
import { UserLocationLayer } from './UserLocationLayer';
import { DebugLayer } from './DebugLayer';
import { MapControls } from './MapControls';
import { MapMode, VehicleColorStrategy } from '../../../types/map';
import { projectPointToShape, calculateDistanceAlongShape } from '../../../utils/arrival/distanceUtils';
import { getNextStationForVehicle } from '../../../utils/arrival/vehicleProgressUtils';
import { getTripStopSequence } from '../../../utils/arrival/tripUtils';
import { useVehicleStore } from '../../../stores/vehicleStore';
import type { RouteShape } from '../../../types/arrivalTime';
import type { DebugVisualizationData } from '../../../types/map/mapLayers';
import { DEFAULT_MAP_COLORS, MAP_DEFAULTS } from '../../../types/map';
import type { 
  TranzyRouteResponse, 
  TranzyStopResponse,
  TranzyTripResponse,
  TranzyStopTimeResponse
} from '../../../types/rawTranzyApi';
import type { StationVehicle } from '../../../types/stationFilter';

// ============================================================================
// Map Controller Component
// ============================================================================

interface MapControllerProps {
  onMapReady: (map: LeafletMap) => void;
}

const MapController: FC<MapControllerProps> = ({ onMapReady }) => {
  const map = useMap();
  const hasInitialized = useRef(false);
  
  useEffect(() => {
    if (map && !hasInitialized.current) {
      hasInitialized.current = true;
      
      // Wait for map to be fully ready before notifying parent
      map.whenReady(() => {
        onMapReady(map);
      });
    }
  }, [map, onMapReady]);
  
  // Reset initialization flag when component unmounts
  useEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, []);
  
  return null;
};

// ============================================================================
// Main Map Content Component
// ============================================================================

interface VehicleMapContentProps {
  vehicleId: number;
  targetStationId?: number | null;
  vehicles: StationVehicle[];
  routes: TranzyRouteResponse[];
  stations: TranzyStopResponse[];
  trips: TranzyTripResponse[];
  stopTimes: TranzyStopTimeResponse[];
  routeShapes: Map<string, RouteShape>;
  loadingShapes: boolean;
  showVehicles: boolean;
  showRouteShapes: boolean;
  showStations: boolean;
  showUserLocation: boolean;
  debugMode: boolean;
  currentMode: MapMode;
  currentPosition: GeolocationPosition | null;
  mapKey: string;
  mapCenter: { lat: number; lon: number };
  onMapReady: (map: LeafletMap) => void;
  onModeChange: (mode: MapMode) => void;
  onVehiclesToggle: (show: boolean) => void;
  onRouteShapesToggle: (show: boolean) => void;
  onStationsToggle: (show: boolean) => void;
  onUserLocationToggle: (show: boolean) => void;
  onDebugToggle: (debug: boolean) => void;
}

export const VehicleMapContent: FC<VehicleMapContentProps> = ({
  vehicleId,
  targetStationId,
  vehicles,
  routes,
  stations,
  trips,
  stopTimes,
  routeShapes,
  loadingShapes,
  showVehicles,
  showRouteShapes,
  showStations,
  showUserLocation,
  debugMode,
  currentMode,
  currentPosition,
  mapKey,
  mapCenter,
  onMapReady,
  onModeChange,
  onVehiclesToggle,
  onRouteShapesToggle,
  onStationsToggle,
  onUserLocationToggle,
  onDebugToggle
}) => {
  // Subscribe to vehicle updates to get latest vehicle data
  // Use a selector to only subscribe to the specific vehicle we care about
  const targetVehicleFromStore = useVehicleStore(
    state => state.vehicles.find(v => v.id === vehicleId) || null
  );

  // Find the target vehicle from store (has latest predictions) or fallback to props
  const targetStationVehicle = vehicles.find(sv => sv.vehicle.id === vehicleId);
  const targetVehicle = targetVehicleFromStore || targetStationVehicle?.vehicle || null;
  const vehicleTrip = targetVehicle ? trips.find(trip => trip.trip_id === targetVehicle.trip_id) : null;

  // Filter data for this specific vehicle
  const filteredVehicles = targetVehicle ? [targetVehicle] : [];
  const filteredRoutes = targetVehicle?.route_id 
    ? routes.filter(route => route.route_id === targetVehicle.route_id)
    : [];

  // Filter stations to show only trip stations
  let filteredStations = stations;
  if (targetVehicle?.trip_id) {
    const tripStopTimes = getTripStopSequence(targetVehicle, stopTimes);
    if (tripStopTimes.length > 0) {
      const tripStationIds = new Set(tripStopTimes.map(st => st.stop_id));
      filteredStations = stations.filter(station => tripStationIds.has(station.stop_id));
    }
  }

  // Get route shapes to display
  const displayRouteShapes = useMemo(() => {
    if (!vehicleTrip?.shape_id || routeShapes.size === 0) {
      return new Map<string, RouteShape>();
    }
    
    const shape = routeShapes.get(vehicleTrip.shape_id);
    return shape ? new Map([[vehicleTrip.shape_id, shape]]) : new Map();
  }, [vehicleTrip?.shape_id, routeShapes]);

  // Calculate next stop using reusable utility
  const nextStop = useMemo(() => {
    if (!targetVehicle) return null;
    return getNextStationForVehicle(targetVehicle, stopTimes, stations);
  }, [targetVehicle, stopTimes, stations]);

  // Create debug data using REAL distance calculations
  const debugData: DebugVisualizationData | null = useMemo(() => {
    if (!debugMode || displayRouteShapes.size === 0 || filteredStations.length === 0 || !targetVehicle) {
      return null;
    }

    try {
      const vehiclePosition = { lat: targetVehicle.latitude, lon: targetVehicle.longitude };
      const routeShape = displayRouteShapes.values().next().value!;
      
      // Use the target station (where user clicked the vehicle) if available
      let targetStation: TranzyStopResponse;
      let targetStationPosition: { lat: number; lon: number };
      
      if (targetStationId) {
        // Find the specific target station
        const foundTargetStation = stations.find(s => s.stop_id === targetStationId);
        if (foundTargetStation) {
          targetStation = foundTargetStation;
          targetStationPosition = { lat: targetStation.stop_lat, lon: targetStation.stop_lon };
        } else {
          // Fallback to first filtered station if target station not found
          targetStation = filteredStations[0];
          targetStationPosition = { lat: targetStation.stop_lat, lon: targetStation.stop_lon };
        }
      } else {
        // Fallback: find a station ahead of the vehicle on the route
        targetStation = filteredStations[filteredStations.length - 1]; // Default to last station
        targetStationPosition = { lat: targetStation.stop_lat, lon: targetStation.stop_lon };
        
        // Try to find a station ahead of the vehicle
        const vehicleProjection = projectPointToShape(vehiclePosition, routeShape);
        
        for (let i = 0; i < filteredStations.length; i++) {
          const station = filteredStations[i];
          const stationPos = { lat: station.stop_lat, lon: station.stop_lon };
          const stationProjection = projectPointToShape(stationPos, routeShape);
          
          // Use the first station that's ahead of the vehicle
          if (stationProjection.segmentIndex > vehicleProjection.segmentIndex) {
            targetStation = station;
            targetStationPosition = stationPos;
            break;
          }
        }
      }
      
      // Get vehicle projection for debug data
      const vehicleProjection = projectPointToShape(vehiclePosition, routeShape);
      
      let nextStationPosition: { lat: number; lon: number } | undefined;
      let nextStationProjection: any | undefined;
      let nextStationInfo: { stop_id: number; stop_name: string; isTargetStation: boolean } | undefined;
      
      if (nextStop) {
        nextStationPosition = { lat: nextStop.stop_lat, lon: nextStop.stop_lon };
        nextStationProjection = projectPointToShape(nextStationPosition, routeShape);
        nextStationInfo = {
          stop_id: nextStop.stop_id,
          stop_name: nextStop.stop_name,
          isTargetStation: nextStop.stop_id === targetStation.stop_id
        };
      }
      
      const finalStationProjection = projectPointToShape(targetStationPosition, routeShape);
      
      const distanceResult = calculateDistanceAlongShape(
        vehiclePosition, 
        targetStationPosition, 
        routeShape
      );
      
      return {
        vehiclePosition,
        targetStationPosition,
        nextStationPosition,
        vehicleProjection,
        stationProjection: finalStationProjection,
        nextStationProjection,
        routeShape,
        distanceCalculation: distanceResult,
        nextStationInfo
      };
    } catch (error) {
      console.warn('Failed to create debug data:', error);
      return null;
    }
  }, [debugMode, displayRouteShapes, filteredStations, targetVehicle, targetStationId, stations, nextStop]);

  if (!targetVehicle) {
    return null;
  }

  return (
    <Box sx={{ height: '100%', width: '100%', position: 'relative' }}>
      {loadingShapes && (
        <Box 
          sx={{ 
            position: 'absolute', 
            top: 16, 
            right: 16, 
            zIndex: 1000,
            bgcolor: 'background.paper',
            borderRadius: 1,
            p: 1,
            boxShadow: 1
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Loading route...
          </Typography>
        </Box>
      )}

      {/* Custom map without automatic viewport management */}
      <MapContainer
        key={mapKey}
        center={[mapCenter.lat, mapCenter.lon]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        minZoom={MAP_DEFAULTS.MIN_ZOOM}
        maxZoom={MAP_DEFAULTS.MAX_ZOOM}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        {/* Map controller for viewport management */}
        <MapController onMapReady={onMapReady} />

        {/* Base tile layer */}
        <TileLayer
          url={MAP_DEFAULTS.TILE_URL}
          attribution={MAP_DEFAULTS.ATTRIBUTION}
        />

        {/* Vehicle layer - only the selected vehicle */}
        {showVehicles && (
          <VehicleLayer
            vehicles={filteredVehicles}
            routes={new Map(filteredRoutes.map(r => [r.route_id, r]))}
            trips={new Map(trips.map(t => [t.trip_id, t]))}
            highlightedVehicleId={vehicleId}
            colorStrategy={VehicleColorStrategy.BY_ROUTE}
            colorScheme={DEFAULT_MAP_COLORS}
          />
        )}

        {/* Route shape layer - only render when not loading */}
        {showRouteShapes && displayRouteShapes.size > 0 && !loadingShapes && (
          <RouteShapeLayer
            key={`route-shapes-${Array.from(displayRouteShapes.keys()).join('-')}-${loadingShapes}`}
            routeShapes={displayRouteShapes}
            routes={new Map(filteredRoutes.map(r => [r.route_id, r]))}
            highlightedRouteIds={targetVehicle.route_id ? [targetVehicle.route_id] : undefined}
            showDirectionArrows={true}
            colorScheme={DEFAULT_MAP_COLORS}
          />
        )}

        {/* Station layer - all trip stations when enabled */}
        {showStations && (
          <StationLayer
            stations={filteredStations}
            targetStationId={targetStationId}
            nextStationId={nextStop?.stop_id}
            colorScheme={DEFAULT_MAP_COLORS}
          />
        )}

        {/* Important stations layer - always show target and next station */}
        {!showStations && (
          <StationLayer
            stations={filteredStations.filter(station => 
              station.stop_id === targetStationId || 
              station.stop_id === nextStop?.stop_id
            )}
            targetStationId={targetStationId}
            nextStationId={nextStop?.stop_id}
            colorScheme={DEFAULT_MAP_COLORS}
          />
        )}

        {/* User location layer */}
        {showUserLocation && (
          <UserLocationLayer
            position={currentPosition}
            showAccuracyCircle={true}
            colorScheme={DEFAULT_MAP_COLORS}
          />
        )}

        {/* Debug layer - shows which shape is used for distance calculations */}
        {debugMode && debugData && (
          <DebugLayer
            debugData={debugData}
            visible={true}
            colorScheme={DEFAULT_MAP_COLORS}
            vehicles={filteredVehicles}
          />
        )}
      </MapContainer>

      {/* Map controls overlay */}
      <MapControls
        mode={currentMode}
        showVehicles={showVehicles}
        showRouteShapes={showRouteShapes}
        showStations={showStations}
        showUserLocation={showUserLocation}
        debugMode={debugMode}
        onModeChange={onModeChange}
        onVehiclesToggle={onVehiclesToggle}
        onRouteShapesToggle={onRouteShapesToggle}
        onStationsToggle={onStationsToggle}
        onUserLocationToggle={onUserLocationToggle}
        onDebugToggle={onDebugToggle}
      />
    </Box>
  );
};