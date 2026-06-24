/**
 * VehicleMapDialog - Full-screen map dialog for vehicle tracking
 * Simplified version that delegates map content to VehicleMapContent component
 */

import type { FC } from 'react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  IconButton,
  Typography,
  Box,
  Avatar
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { Map as LeafletMap } from 'leaflet';
import { VehicleMapContent } from './VehicleMapContent';
import { MapMode } from '../../../types/interactiveMap';
import { fetchRouteShapesForTrips } from '../../../services/routeShapeService';
import { calculateVehicleComprehensiveViewport, calculateRouteOverviewViewport } from '../../../utils/maps/viewportUtils';
import { getNextStationForVehicle } from '../../../utils/arrival/vehicleProgressUtils';
import { getTripStopSequence } from '../../../utils/arrival/tripUtils';
import type { RouteShape } from '../../../types/arrivalTime';
import type { 
  TranzyRouteResponse, 
  TranzyStopResponse,
  TranzyTripResponse,
  TranzyStopTimeResponse
} from '../../../types/rawTranzyApi';
import type { StationVehicle } from '../../../types/stationFilter';
import { useLocationStore } from '../../../stores/locationStore';
import { HeaderControls } from '../../layout/HeaderControls';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface VehicleMapDialogProps {
  open: boolean;
  onClose: () => void;
  vehicleId: number | null;
  targetStationId?: number | null;
  vehicles: StationVehicle[];
  routes: TranzyRouteResponse[];
  stations: TranzyStopResponse[];
  trips: TranzyTripResponse[];
  stopTimes: TranzyStopTimeResponse[];
}

export const VehicleMapDialog: FC<VehicleMapDialogProps> = React.memo(({
  open,
  onClose,
  vehicleId,
  targetStationId,
  vehicles,
  routes,
  stations,
  trips,
  stopTimes
}) => {
  // State management
  const [routeShapes, setRouteShapes] = useState<Map<string, RouteShape>>(new Map());
  const [loadingShapes, setLoadingShapes] = useState(false);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showRouteShapes, setShowRouteShapes] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [showUserLocation, setShowUserLocation] = useState(true);
  const [currentMode, setCurrentMode] = useState<MapMode>(MapMode.VEHICLE_TRACKING);
  const mapRef = useRef<LeafletMap | null>(null);
  
  // Get user location from store
  const { currentPosition, requestLocation } = useLocationStore();
  
  // Request location when user location is enabled
  useEffect(() => {
    if (showUserLocation && !currentPosition) {
      requestLocation();
    }
  }, [showUserLocation, currentPosition, requestLocation]);
  
  // Focus management for accessibility
  useEffect(() => {
    if (open) {
      // Small delay to ensure dialog is rendered
      const timer = setTimeout(() => {
        // Focus the close button when dialog opens
        const closeButton = document.querySelector('[aria-label="close"]') as HTMLElement;
        if (closeButton) {
          closeButton.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);
  
  // Generate stable map key
  const mapKey = useMemo(() => {
    if (!open || !vehicleId) return 'map-closed';
    return `vehicle-map-${vehicleId}`;
  }, [open, vehicleId]);
  
  // Find target vehicle and trip
  const targetStationVehicle = vehicleId ? vehicles.find(sv => sv.vehicle.id === vehicleId) : null;
  const targetVehicle = targetStationVehicle?.vehicle || null;
  const vehicleTrip = targetVehicle ? (Array.isArray(trips) ? trips : []).find(trip => trip.trip_id === targetVehicle.trip_id) : null;

  // Calculate map center
  const mapCenter = useMemo(() => {
    if (targetVehicle) {
      return { lat: targetVehicle.latitude, lon: targetVehicle.longitude };
    }
    return { lat: 46.7712, lon: 23.6236 }; // Default center
  }, [targetVehicle]);

  // Handle map ready
  const handleMapReady = (map: LeafletMap) => {
    mapRef.current = map;
    
    // Wait for Leaflet to fully initialize before manipulating viewport
    map.whenReady(() => {
      if (targetVehicle) {
        const targetStation = targetStationId 
          ? stations.find(s => s.stop_id === targetStationId) 
          : null;
        
        const nextStation = getNextStationForVehicle(targetVehicle, stopTimes, stations);
        
        const viewport = calculateVehicleComprehensiveViewport(
          { lat: targetVehicle.latitude, lon: targetVehicle.longitude },
          targetStation,
          nextStation
        );
        
        if (viewport && viewport.bounds) {
          const bounds: [[number, number], [number, number]] = [
            [viewport.bounds.south, viewport.bounds.west],
            [viewport.bounds.north, viewport.bounds.east]
          ];
          
          try {
            map.fitBounds(bounds, { padding: [20, 20] });
          } catch (error) {
            console.warn('Failed to fit bounds on map ready:', error);
          }
        }
      }
    });
  };

  // Load route shapes
  useEffect(() => {
    if (open && vehicleTrip?.shape_id && !routeShapes.has(vehicleTrip.shape_id)) {
      setLoadingShapes(true);
      
      fetchRouteShapesForTrips([vehicleTrip])
        .then(shapes => {
          const requestedShape = shapes.get(vehicleTrip.shape_id);
          if (requestedShape) {
            const singleShape = new Map([[vehicleTrip.shape_id, requestedShape]]);
            setRouteShapes(singleShape);
          }
        })
        .catch(error => console.error('Failed to load route shapes:', error))
        .finally(() => setLoadingShapes(false));
    }
  }, [open, vehicleTrip, routeShapes]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setRouteShapes(new Map());
      setLoadingShapes(false);
      mapRef.current = null;
    }
  }, [open]);

  // Early return if no vehicle
  if (!vehicleId || !targetVehicle) {
    return null;
  }

  // Filter routes for display
  const filteredRoutes = targetVehicle?.route_id 
    ? routes.filter(route => route.route_id === targetVehicle.route_id)
    : [];

  // Handle mode changes
  const handleModeChange = (newMode: MapMode) => {
    setCurrentMode(newMode);
    
    if (!mapRef.current || !targetVehicle) return;
    
    const map = mapRef.current;
    
    // Ensure map is ready before manipulating viewport
    map.whenReady(() => {
      if (newMode === MapMode.VEHICLE_TRACKING) {
        // Vehicle tracking: show vehicle, target station, and next station
        const targetStation = targetStationId 
          ? stations.find(s => s.stop_id === targetStationId) 
          : null;
        
        const nextStation = getNextStationForVehicle(targetVehicle, stopTimes, stations);
        
        const viewport = calculateVehicleComprehensiveViewport(
          { lat: targetVehicle.latitude, lon: targetVehicle.longitude },
          targetStation,
          nextStation
        );
        
        if (viewport && viewport.bounds) {
          const bounds: [[number, number], [number, number]] = [
            [viewport.bounds.south, viewport.bounds.west],
            [viewport.bounds.north, viewport.bounds.east]
          ];
          
          try {
            map.fitBounds(bounds, { padding: [20, 20] });
          } catch (error) {
            console.warn('Failed to fit bounds in vehicle tracking mode:', error);
          }
        }
      } else if (newMode === MapMode.ROUTE_OVERVIEW) {
        // Route overview: show the entire route with all stations
        const tripStations = (() => {
          if (!targetVehicle.trip_id) return stations;
          
          const tripStopTimes = getTripStopSequence(targetVehicle, stopTimes);
          if (tripStopTimes.length === 0) return stations;
          
          const tripStationIds = new Set(tripStopTimes.map(st => st.stop_id));
          return stations.filter(station => tripStationIds.has(station.stop_id));
        })();
        
        const routeShapesForOverview = vehicleTrip?.shape_id && routeShapes.has(vehicleTrip.shape_id)
          ? new Map([[vehicleTrip.shape_id, routeShapes.get(vehicleTrip.shape_id)!]])
          : new Map();
        
        const viewport = calculateRouteOverviewViewport(
          routeShapesForOverview,
          tripStations
        );
        
        if (viewport && viewport.bounds) {
          const bounds: [[number, number], [number, number]] = [
            [viewport.bounds.south, viewport.bounds.west],
            [viewport.bounds.north, viewport.bounds.east]
          ];
          
          try {
            map.fitBounds(bounds, { padding: [20, 20] });
          } catch (error) {
            console.warn('Failed to fit bounds in route overview mode:', error);
          }
        }
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      disableRestoreFocus={false}
      disableEnforceFocus={false}
      keepMounted={false}
      PaperProps={{
        sx: {
          bgcolor: 'background.default'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        py: 1,
        px: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
          {/* Route badge */}
          {filteredRoutes.length > 0 && (
            <Avatar sx={{ 
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              width: 40,
              height: 40,
              fontSize: '1rem',
              fontWeight: 'bold',
              flexShrink: 0
            }}>
              {filteredRoutes[0].route_short_name}
            </Avatar>
          )}
          
          {/* Headsign */}
          <Typography variant="h6" component="div">
            {vehicleTrip?.trip_headsign || 'Live Tracking'}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HeaderControls />
          
          <IconButton
            edge="end"
            color="inherit"
            onClick={onClose}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ p: 0, height: '100%' }}>
        <VehicleMapContent
          vehicleId={vehicleId}
          targetStationId={targetStationId}
          vehicles={vehicles}
          routes={routes}
          stations={stations}
          trips={trips}
          stopTimes={stopTimes}
          routeShapes={routeShapes}
          loadingShapes={loadingShapes}
          showVehicles={showVehicles}
          showRouteShapes={showRouteShapes}
          showStations={showStations}
          showUserLocation={showUserLocation}
          debugMode={debugMode}
          currentMode={currentMode}
          currentPosition={currentPosition}
          mapKey={mapKey}
          mapCenter={mapCenter}
          onMapReady={handleMapReady}
          onModeChange={handleModeChange}
          onVehiclesToggle={setShowVehicles}
          onRouteShapesToggle={setShowRouteShapes}
          onStationsToggle={setShowStations}
          onUserLocationToggle={setShowUserLocation}
          onDebugToggle={setDebugMode}
        />
      </DialogContent>
    </Dialog>
  );
});