// ArrivalService - Dedicated service for real-time arrival calculations
// Uses enhanced vehicles (service layer handles predictions automatically)
// Single responsibility: calculate arrival times on-demand

import type { 
  TranzyVehicleResponse, 
  TranzyStopResponse, 
  TranzyStopTimeResponse,
  TranzyTripResponse 
} from '../types/rawTranzyApi.ts';
import type { EnhancedVehicleData } from '../utils/vehicle/vehicleEnhancementUtils.ts';
import type { ArrivalTimeResult } from '../types/arrivalTime.ts';
import { handleApiError } from './error';
import { 
  calculateMultipleArrivals, 
  sortVehiclesByArrival 
} from '../utils/arrival/arrivalUtils.ts';

export const arrivalService = {
  /**
   * Calculate arrival times for vehicles approaching a specific stop
   * Uses enhanced vehicles with position predictions for improved accuracy
   * Uses proper store architecture with caching
   */
  async calculateArrivalsForStop(stopId: string): Promise<ArrivalTimeResult[]> {
    try {
      // Load data through stores (respects caching and prevents duplicate requests)
      const { useVehicleStore } = await import('../stores/vehicleStore');
      const { useTripStore } = await import('../stores/tripStore');
      const { useStopTimeStore } = await import('../stores/stopTimeStore');
      const { useStationStore } = await import('../stores/stationStore');

      // Load data through stores in parallel - stores handle caching and deduplication
      await Promise.all([
        useVehicleStore.getState().loadVehicles(),
        useTripStore.getState().loadTrips(),
        useStopTimeStore.getState().loadStopTimes(),
        useStationStore.getState().loadStops()
      ]);

      // Get cached data from stores
      const vehicles = useVehicleStore.getState().vehicles;
      const trips = useTripStore.getState().trips;
      const stopTimes = useStopTimeStore.getState().stopTimes;
      const stops = useStationStore.getState().stops;

      // Find target stop
      const targetStop = stops.find(s => s.stop_id === parseInt(stopId));
      if (!targetStop) {
        throw new Error(`Stop ${stopId} not found`);
      }

      // Calculate and sort arrival times using enhanced vehicle data with predictions
      const arrivals = calculateMultipleArrivals(vehicles, targetStop, trips, stopTimes, stops);
      return sortVehiclesByArrival(arrivals);
    } catch (error) {
      handleApiError(error, 'calculate arrivals for stop');
    }
  }
};