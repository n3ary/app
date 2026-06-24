// VehicleService - Domain-focused service for vehicle tracking
// Applies position predictions at service layer before returning data
// Integrated with status tracking and position prediction

import axios from 'axios';
import type { TranzyVehicleResponse } from '../types/rawTranzyApi.ts';
import type { EnhancedVehicleData } from '../utils/vehicle/vehicleEnhancementUtils.ts';
import { enhanceVehicles } from '../utils/vehicle/vehicleEnhancementUtils.ts';
import { calculateStationDensityCenter } from '../utils/vehicle/stationDensityUtils.ts';
import { handleApiError, apiStatusTracker } from './error';
import { getApiConfig } from '../context/appContext';
import { API_CONFIG, SpeedPredictionConfigValidator } from '../utils/core/constants';

export const vehicleService = {
  /**
   * Get vehicles with position predictions applied (primary method)
   * Enhancement happens at service layer before returning to consumers
   * Uses proper store architecture with caching
   */
  async getVehicles(): Promise<EnhancedVehicleData[]> {
    try {
      // Get raw vehicle data from API
      const rawVehicles = await this.getRawVehicles();
      
      // Load additional data through stores (respects caching and prevents duplicate requests)
      const { useTripStore } = await import('../stores/tripStore');
      const { useStationStore } = await import('../stores/stationStore');
      const { useShapeStore } = await import('../stores/shapeStore');
      const { useStopTimeStore } = await import('../stores/stopTimeStore');

      // Load data through stores in parallel - stores handle caching and deduplication
      await Promise.all([
        useTripStore.getState().loadTrips(),
        useStationStore.getState().loadStops(), 
        useShapeStore.getState().loadShapes(),
        useStopTimeStore.getState().loadStopTimes()
      ]);

      // Get cached data from stores
      const trips = useTripStore.getState().trips;
      const stops = useStationStore.getState().stops;
      const shapes = useShapeStore.getState().shapes;
      const stopTimes = useStopTimeStore.getState().stopTimes;

      // Build route shapes mapping from cached store data
      const routeShapes = this.buildRouteShapesFromStoreData(rawVehicles, trips, shapes);
      
      // Build stop times mapping from cached store data
      const stopTimesByTrip = this.buildStopTimesMappingFromStoreData(stopTimes);
      
      console.log(`[VehicleService] Enhancement data from stores: routeShapes=${routeShapes?.size || 0}, stopTimesByTrip=${stopTimesByTrip?.size || 0}, stops=${stops?.length || 0}`);
      
      // Apply position and speed predictions at service layer (always enabled)
      const enhancedVehicles = enhanceVehicles(rawVehicles, {
        routeShapes,
        stopTimesByTrip,
        stops
      });
      
      console.log(`[VehicleService] Enhanced ${enhancedVehicles.length} vehicles with position and speed predictions`);
      return enhancedVehicles;
    } catch (error) {
      // If enhancement fails, fall back to raw vehicles without predictions
      console.warn('Failed to enhance vehicles with predictions, falling back to raw data:', error);
      const rawVehicles = await this.getRawVehicles();
      
      // Convert to enhanced format without predictions for consistency
      return rawVehicles.map(vehicle => ({
        ...vehicle,
        apiLatitude: vehicle.latitude,
        apiLongitude: vehicle.longitude,
        apiSpeed: vehicle.speed,
        predictionMetadata: {
          predictedDistance: 0,
          stationsEncountered: 0,
          totalDwellTime: 0,
          positionMethod: 'fallback' as const,
          positionApplied: false,
          timestampAge: 0,
          predictedSpeed: vehicle.speed, // Use API speed as fallback
          speedMethod: 'api_speed' as const,
          speedConfidence: 'low' as const,
          speedApplied: true
        }
      }));
    }
  },

  /**
   * Get raw vehicles from API (internal method)
   * Use this only for debugging or when you specifically need original API data
   */
  async getRawVehicles(): Promise<TranzyVehicleResponse[]> {
    const startTime = Date.now();
    try {
      // Get API credentials from app context
      const { apiKey, agencyId } = getApiConfig();

      const response = await axios.get(`${API_CONFIG.BASE_URL}/vehicles`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Agency-Id': agencyId.toString()
        },
        params: { _t: Date.now() } // Cache-bust Netlify edge CDN
      });
      
      // Validate response is JSON array, not HTML error page
      if (!Array.isArray(response.data)) {
        console.error('API returned non-array response:', typeof response.data, response.data);
        throw new Error('API returned invalid data format (expected array, got ' + typeof response.data + ')');
      }
      
      // Record successful API call
      const responseTime = Date.now() - startTime;
      apiStatusTracker.recordSuccess('fetch vehicles', responseTime);
      
      // Update status store if available
      if (typeof window !== 'undefined') {
        const { useStatusStore } = await import('../stores/statusStore');
        useStatusStore.getState().updateFromApiCall(true, responseTime, 'fetch vehicles');
      }
      
      return response.data;
    } catch (error) {
      handleApiError(error, 'fetch vehicles');
    }
  },

  /**
   * Get enhanced vehicles with position predictions applied
   * @deprecated Use getVehicles() instead - it now returns enhanced vehicles by default
   */
  /**
   * Helper methods to build data structures from store data
   */
  buildRouteShapesFromStoreData(vehicles: TranzyVehicleResponse[], trips: any[], shapes: Map<string, any>): Map<string, any> | undefined {
    try {
      if (trips.length === 0 || shapes.size === 0) {
        return undefined;
      }

      // Create a mapping from trip_id to route shape for easier lookup
      const routeShapesByTripId = new Map<string, any>();
      
      for (const vehicle of vehicles) {
        if (vehicle.trip_id) {
          // Find the trip for this vehicle
          const trip = trips.find(t => t.trip_id === vehicle.trip_id);
          if (trip && trip.shape_id) {
            // Get the route shape for this trip's shape_id from store
            const routeShape = shapes.get(trip.shape_id);
            if (routeShape) {
              routeShapesByTripId.set(vehicle.trip_id, routeShape);
            }
          }
        }
      }
      
      return routeShapesByTripId;
    } catch (error) {
      console.warn('Route shapes not available for predictions:', error);
      return undefined;
    }
  },

  buildStopTimesMappingFromStoreData(stopTimes: any[]): Map<string, any> | undefined {
    try {
      if (stopTimes.length === 0) {
        return undefined;
      }

      // Group stop times by trip_id for efficient lookup
      const stopTimesByTrip = new Map();
      for (const stopTime of stopTimes) {
        if (!stopTimesByTrip.has(stopTime.trip_id)) {
          stopTimesByTrip.set(stopTime.trip_id, []);
        }
        stopTimesByTrip.get(stopTime.trip_id).push(stopTime);
      }
      
      return stopTimesByTrip;
    } catch (error) {
      console.warn('Stop times not available for predictions:', error);
      return undefined;
    }
  }
};