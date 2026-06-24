// StationService - Domain-focused service for stop operations
// Primary source: static JSON from neary-gtfs releases branch
// Fallback: Tranzy API

import axios from 'axios';
import type { TranzyStopResponse } from '../types/rawTranzyApi.ts';
import type { ArrivalTimeResult } from '../types/arrivalTime.ts';
import { handleApiError, apiStatusTracker } from './error';
import { getApiConfig } from '../context/appContext';
import { API_CONFIG } from '../utils/core/constants';
import { staticDataService } from './staticDataService';

export const stationService = {
  /**
   * Get all stops for an agency.
   * Tries static GitHub source first, falls back to Tranzy API.
   */
  async getStops(): Promise<TranzyStopResponse[]> {
    const { agencyId } = getApiConfig();

    // Try static source first
    try {
      const remoteHashes = await staticDataService.fetchRemoteHashes();
      const result = await staticDataService.fetchEndpoint<TranzyStopResponse[]>(
        agencyId, 'stops', remoteHashes
      );
      if (result) {
        console.log(`[StationService] Loaded ${result.data.length} stops from static source`);
        return result.data;
      }
    } catch (err) {
      console.warn('[StationService] Static source failed, falling back to API:', err);
    }

    // Fallback: Tranzy API
    const { apiKey } = getApiConfig();
    const startTime = Date.now();
    try {
      const response = await axios.get(`${API_CONFIG.BASE_URL}/stops`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Agency-Id': agencyId.toString()
        }
      });
      
      if (!Array.isArray(response.data)) {
        throw new Error('API returned invalid data format (expected array, got ' + typeof response.data + ')');
      }
      
      const responseTime = Date.now() - startTime;
      apiStatusTracker.recordSuccess('fetch stops', responseTime);
      
      if (typeof window !== 'undefined') {
        const { useStatusStore } = await import('../stores/statusStore');
        useStatusStore.getState().updateFromApiCall(true, responseTime, 'fetch stops');
      }
      
      return response.data;
    } catch (error) {
      handleApiError(error, 'fetch stops');
    }
  },

  /**
   * Get arrival times for vehicles approaching a specific stop
   * Delegates to dedicated arrival service for real-time calculations
   */
  async getStopArrivals(stopId: string): Promise<ArrivalTimeResult[]> {
    try {
      const { arrivalService } = await import('./arrivalService');
      return arrivalService.calculateArrivalsForStop(stopId);
    } catch (error) {
      handleApiError(error, 'fetch stop arrivals');
    }
  }
};