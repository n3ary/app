/**
 * Station Vehicle Utilities
 * Vehicle retrieval and station metadata management
 * Supports both original and enhanced vehicle data with position predictions
 */

import { 
  getCachedStationRouteMapping, 
  getRouteIdsForStation 
} from '../route/routeStationMapping';
import { CONFIDENCE_LEVELS, ARRIVAL_METHODS } from '../core/stringConstants';
import { calculateVehicleArrivalTime, sortVehiclesByArrival, isVehicleOffRoute } from '../arrival/arrivalUtils';
import type { StationVehicle, FilteredStation } from '../../types/stationFilter';
import type { TranzyStopTimeResponse, TranzyVehicleResponse, TranzyRouteResponse, TranzyTripResponse, TranzyStopResponse } from '../../types/rawTranzyApi';
import type { EnhancedVehicleData } from '../vehicle/vehicleEnhancementUtils';
import type { ArrivalTimeResult, ArrivalStatus, RouteShape } from '../../types/arrivalTime';

/**
 * Sort StationVehicle objects by arrival time using existing arrival sorting logic
 * Adapts StationVehicle objects to work with the existing sortVehiclesByArrival function
 *
 * When `dropOffOnlyIds` is supplied, vehicles whose id is in that set are
 * unconditionally pushed to the end of the list (these are runs that terminate
 * at the current station, i.e. you can't board them — lowest value to the
 * user). Within each partition the existing arrival-priority sort is applied.
 */
export const sortStationVehiclesByArrival = (
  vehicles: StationVehicle[],
  dropOffOnlyIds?: ReadonlySet<number>,
): StationVehicle[] => {
  const useDropOffSplit = dropOffOnlyIds && dropOffOnlyIds.size > 0;
  const pickup: StationVehicle[] = [];
  const dropOff: StationVehicle[] = [];
  if (useDropOffSplit) {
    for (const v of vehicles) {
      (dropOffOnlyIds!.has(v.vehicle.id) ? dropOff : pickup).push(v);
    }
  } else {
    pickup.push(...vehicles);
  }

  const sortPartition = (partition: StationVehicle[]): StationVehicle[] => {
    if (partition.length === 0) return partition;
    // Convert StationVehicle objects to ArrivalTimeResult objects for sorting
    const arrivalResults: (ArrivalTimeResult & { originalVehicle: StationVehicle })[] = partition.map(stationVehicle => {
      if (stationVehicle.arrivalTime) {
        // Create a mock ArrivalTimeResult that matches the sorting interface
        return {
          vehicleId: stationVehicle.vehicle.id, // Keep as number - matches API type
          estimatedMinutes: stationVehicle.arrivalTime.estimatedMinutes,
          status: getStatusFromMessage(stationVehicle.arrivalTime.statusMessage), // Convert message back to status
          statusMessage: stationVehicle.arrivalTime.statusMessage,
          confidence: stationVehicle.arrivalTime.confidence,
          calculationMethod: stationVehicle.arrivalTime.calculationMethod || 'unknown',
          originalVehicle: stationVehicle
        } as ArrivalTimeResult & { originalVehicle: StationVehicle };
      } else {
        // Vehicle without arrival time - assign lowest priority
        return {
          vehicleId: stationVehicle.vehicle.id, // Keep as number - matches API type
          estimatedMinutes: 999, // High value for sorting to end
          status: 'off_route' as const, // Lowest priority status
          statusMessage: '',
          confidence: CONFIDENCE_LEVELS.LOW,
          calculationMethod: ARRIVAL_METHODS.ROUTE_SHAPE,
          originalVehicle: stationVehicle
        } as ArrivalTimeResult & { originalVehicle: StationVehicle };
      }
    });

    // Use existing sorting logic
    const sortedResults = sortVehiclesByArrival(arrivalResults as ArrivalTimeResult[]);

    // Extract the original StationVehicle objects in sorted order
    return (sortedResults as (ArrivalTimeResult & { originalVehicle: StationVehicle })[])
      .map(result => result.originalVehicle);
  };

  return [...sortPartition(pickup), ...sortPartition(dropOff)];
};

/**
 * Helper function to convert status message back to status enum
 * Updated to match the new 4-status system
 */
function getStatusFromMessage(statusMessage: string): ArrivalStatus {
  if (statusMessage.includes('At stop')) return 'at_stop';
  if (statusMessage.includes('Departed')) return 'departed';
  if (statusMessage.includes('minute')) return 'in_minutes'; // Changed to 'minute' to match both singular and plural
  return 'off_route';
}

/**
 * Add metadata (vehicles, route IDs) to a station
 * Now accepts pre-filtered vehicles for this station (from index) for O(1) performance
 * Processes vehicles with route, trip, and arrival time information
 */
export const addStationMetadata = (
  station: any,
  stopTimes: TranzyStopTimeResponse[],
  stationVehicles: EnhancedVehicleData[], // Pre-filtered vehicles for this station
  allRoutes: TranzyRouteResponse[],
  trips: TranzyTripResponse[] = [],
  stops: TranzyStopResponse[] = [],
  routeShapes?: Map<string, RouteShape>
): FilteredStation => {
  const stationObj = station.station || station;
  
  // Performance optimization: create lookup maps for faster access
  const routeMap = new Map(allRoutes.map(route => [route.route_id, route]));
  const tripMap = new Map(trips.map(trip => [trip.trip_id, trip]));
  
  // Find the target stop for arrival calculations
  const targetStop = stops.find(stop => stop.stop_id === stationObj.stop_id);
  
  // Process the pre-filtered vehicles with route, trip, and arrival time information
  const vehiclesWithData = stationVehicles
    .map(vehicle => {
      // Use map lookup for O(1) access
      const route = routeMap.get(vehicle.route_id) || null;
      const trip = vehicle.trip_id ? tripMap.get(vehicle.trip_id) || null : null;
      
      // Calculate arrival time if we have the target stop
      let arrivalTime: {
        statusMessage: string;
        confidence: 'high' | 'medium' | 'low';
        estimatedMinutes: number;
        calculationMethod: string;
      } | undefined;
      
      if (targetStop && stops.length > 0) {
        try {
          // Get route shape for this vehicle's trip
          let routeShape: RouteShape | undefined;
          if (routeShapes && trip && trip.shape_id) {
            routeShape = routeShapes.get(trip.shape_id);
          }
          
          const arrivalResult = calculateVehicleArrivalTime(
            vehicle,
            targetStop,
            trips,
            stopTimes,
            stops,
            routeShape
          );
          
          arrivalTime = {
            statusMessage: arrivalResult.statusMessage,
            confidence: arrivalResult.confidence,
            estimatedMinutes: arrivalResult.estimatedMinutes,
            calculationMethod: arrivalResult.calculationMethod
          };
        } catch (error) {
          console.warn('Failed to calculate arrival time for vehicle:', vehicle.id, error);
        }
      }
      
      return {
        vehicle,
        route,
        trip,
        arrivalTime
      };
    })
    .filter(vehicleData => {
      const { vehicle, trip } = vehicleData;
      
      // Get route shape for this vehicle's trip
      let routeShape: RouteShape | undefined;
      if (trip && trip.shape_id && routeShapes) {
        routeShape = routeShapes.get(trip.shape_id);
      }
      
      // Filter out off-route vehicles
      return !isVehicleOffRoute(vehicle, routeShape);
    });

  // Sort vehicles by arrival time priority
  const sortedVehicles = sortStationVehiclesByArrival(vehiclesWithData);
  
  // Get route IDs for this station
  let routeIds: number[] = [];
  try {
    const stationRouteMap = getCachedStationRouteMapping(stopTimes, stationVehicles);
    routeIds = getRouteIdsForStation(stationObj.stop_id, stationRouteMap);
  } catch (error) {
    console.warn('Failed to get route IDs for station:', stationObj.stop_id, error);
  }
  
  return {
    ...station,
    vehicles: sortedVehicles,
    routeIds
  };
};