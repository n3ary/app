/**
 * Station Filter Strategies
 * Unified filtering algorithm with configurable result limits
 */

import { sortByDistance, calculateDistance } from '../location/distanceUtils';
import { hasActiveTrips } from './tripValidationUtils';
import { addStationMetadata } from './stationVehicleUtils';
import { useShapeStore } from '../../stores/shapeStore';
import type { FilteredStation, StationVehicle } from '../../types/stationFilter';
import type { TranzyStopResponse, TranzyStopTimeResponse, TranzyVehicleResponse, TranzyRouteResponse, TranzyTripResponse } from '../../types/rawTranzyApi';
import type { EnhancedVehicleData } from '../vehicle/vehicleEnhancementUtils';
import type { RouteShape } from '../../types/arrivalTime';
import type { SchedulePayload } from '../../types/schedule';
import { SECONDARY_STATION_THRESHOLD } from '../../types/stationFilter';
import { buildScheduledStationVehicles } from '../schedule/scheduledStationVehicles';
import { deriveGpsVehicleTripIds } from '../schedule/scheduleVehicleIntegration';

/**
 * Optional schedule context enabling synthesized scheduled departures (Req 6,
 * 12). When provided, stations get scheduled (non-GPS) vehicles merged in, and
 * a station that ONLY has scheduled service (no live Tranzy trips) is still
 * surfaced. Omit it to keep the pure GPS-only behavior.
 */
export interface ScheduleFilterContext {
  scheduleData: SchedulePayload | null;
  tripRouteMap: Record<string, number>;
  activeServiceIds: Set<string>;
  tranzyTrips: TranzyTripResponse[];
}

/**
 * Unified Station Filtering - Handles both "all stations" and "proximity filtering" modes
 * @param maxResults - Maximum number of results (undefined = all stations, number = proximity filtering)
 * @param proximityThreshold - Distance threshold for proximity filtering (only used when maxResults is defined)
 */
export const filterStations = async (
  stops: TranzyStopResponse[],
  currentPosition: GeolocationPosition | null,
  stopTimes: TranzyStopTimeResponse[],
  vehicles: EnhancedVehicleData[], // Simplified: only accept enhanced vehicles
  allRoutes: TranzyRouteResponse[],
  maxResults?: number,
  proximityThreshold: number = SECONDARY_STATION_THRESHOLD,
  trips: TranzyTripResponse[] = [], // NEW: trip data for headsign
  scheduleContext?: ScheduleFilterContext, // NEW: schedule-derived vehicles (Req 6, 12)
): Promise<FilteredStation[]> => {
  // Early return if no location and proximity filtering requested
  if (!currentPosition && maxResults !== undefined) {
    return [];
  }

  const userLocation = currentPosition ? 
    { lat: currentPosition.coords.latitude, lon: currentPosition.coords.longitude } : 
    null;

  // Sort stations by distance if location available
  const stationsWithCoords = stops.map(station => ({ ...station, lat: station.stop_lat, lon: station.stop_lon }));
  const sortedStations = userLocation ? 
    sortByDistance(stationsWithCoords, userLocation) : 
    stationsWithCoords;

  // Get route shapes early if we have trips data
  let routeShapes: Map<string, RouteShape> | undefined;
  if (trips.length > 0) {
    try {
      // Get unique shape IDs from all trips to pre-load shapes
      const uniqueShapeIds = [...new Set(trips.map(trip => trip.shape_id).filter(Boolean))];
      
      if (uniqueShapeIds.length > 0) {
        // Get shapes from the centralized store
        const shapeStore = useShapeStore.getState();
        routeShapes = new Map<string, RouteShape>();
        
        // Collect available shapes from the store
        for (const shapeId of uniqueShapeIds) {
          const shape = shapeStore.getShape(shapeId);
          if (shape) {
            routeShapes.set(shapeId, shape);
          }
        }
        
        // Pre-load route shapes for accurate distance calculations
        if (routeShapes.size > 0) {
          // Route shapes are available for filtering
        }
      }
    } catch (error) {
      console.warn('Failed to pre-load route shapes from store:', error);
      routeShapes = undefined;
    }
  }

  // Build vehicle-to-station index ONCE (O(m) instead of O(n×m))
  // This maps stationId -> vehicles that serve it
  const vehiclesByStation = new Map<number, EnhancedVehicleData[]>();
  
  for (const vehicle of vehicles) {
    // Skip vehicles without required data
    if (!vehicle.trip_id || !vehicle.route_id || !vehicle.latitude || !vehicle.longitude) {
      continue;
    }
    
    // Find all stations this vehicle serves
    const stationIds = stopTimes
      .filter(st => st.trip_id === vehicle.trip_id)
      .map(st => st.stop_id);
    
    // Add vehicle to each station's list
    for (const stationId of stationIds) {
      if (!vehiclesByStation.has(stationId)) {
        vehiclesByStation.set(stationId, []);
      }
      vehiclesByStation.get(stationId)!.push(vehicle);
    }
  }

  // Build synthetic scheduled vehicles per station (Req 6, 12). Computed for
  // all candidate stops up front; empty when no schedule context is supplied.
  const scheduledByStation =
    scheduleContext && scheduleContext.scheduleData
      ? buildScheduledStationVehicles({
          scheduleData: scheduleContext.scheduleData,
          tripRouteMap: scheduleContext.tripRouteMap,
          activeServiceIds: scheduleContext.activeServiceIds,
          stopIds: sortedStations.map((s) => s.stop_id),
          stops,
          routes: allRoutes,
          tranzyTrips: scheduleContext.tranzyTrips,
          gpsVehicleTripIds: deriveGpsVehicleTripIds(vehicles),
          realVehicles: vehicles,
          tranzyStopTimes: stopTimes,
        })
      : new Map<number, StationVehicle[]>();

  // Apply core filtering logic: location + trips
  const validStations: FilteredStation[] = [];
  let primaryStation: FilteredStation | null = null;
  
  for (const station of sortedStations) {
    // Get vehicles for this station from pre-built index (O(1) lookup)
    const stationVehicles = vehiclesByStation.get(station.stop_id) || [];
    const scheduledVehicles = scheduledByStation.get(station.stop_id) || [];

    // A station qualifies if it has live vehicles OR scheduled departures.
    // Live vehicles require active Tranzy trips; scheduled-only stations may
    // have none, so the schedule path bypasses the hasActiveTrips gate (Req 12).
    const hasLive = stationVehicles.length > 0 && hasActiveTrips(station, stopTimes);
    if (!hasLive && scheduledVehicles.length === 0) {
      continue;
    }

    // Create station with metadata using the indexed (live) vehicles. Scheduled
    // vehicles already carry route/trip/arrival info and are appended after, so
    // they bypass the live arrival recalculation / off-route filtering.
    const stationWithMetadata = addStationMetadata({
      station,
      distance: userLocation ? calculateDistance(userLocation, { lat: station.stop_lat, lon: station.stop_lon }) : 0,
      hasActiveTrips: true,
      stationType: 'all' as const // Will be updated based on position
    }, stopTimes, hasLive ? stationVehicles : [], allRoutes, trips, stops, routeShapes);

    // Merge scheduled vehicles + their route ids into the station.
    if (scheduledVehicles.length > 0) {
      stationWithMetadata.vehicles = [...stationWithMetadata.vehicles, ...scheduledVehicles];
      const scheduledRouteIds = scheduledVehicles
        .map((sv) => sv.route?.route_id)
        .filter((id): id is number => typeof id === 'number');
      stationWithMetadata.routeIds = [
        ...new Set([...stationWithMetadata.routeIds, ...scheduledRouteIds]),
      ];
    }

    // Skip stations that ended up with no displayable vehicles at all.
    if (stationWithMetadata.vehicles.length === 0) {
      continue;
    }

    // For proximity filtering, check distance from primary station
    if (maxResults !== undefined) {
      if (primaryStation === null) {
        // First valid station becomes primary
        primaryStation = stationWithMetadata;
        validStations.push(stationWithMetadata);
      } else {
        // Check if this station is within proximity threshold of primary
        const distanceToPrimary = calculateDistance(
          { lat: primaryStation.station.stop_lat, lon: primaryStation.station.stop_lon },
          { lat: station.stop_lat, lon: station.stop_lon }
        );
        
        if (distanceToPrimary <= proximityThreshold) {
          // Station is within proximity, include it
          validStations.push(stationWithMetadata);
        }
        // If outside proximity threshold, skip this station but continue checking others
      }
    } else {
      // No proximity filtering, include all valid stations
      validStations.push(stationWithMetadata);
    }
  }

  // Update station types - only primary station gets special type, rest are 'all'
  return validStations.map((station, index) => ({
    ...station,
    stationType: index === 0 ? 'primary' : 'all' as const
  }));
};