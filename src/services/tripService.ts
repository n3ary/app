// TripService - Domain-focused service for trip operations
// Primary source: static JSON from neary-gtfs releases branch
// Fallback: Tranzy API

import axios from 'axios';
import type { TranzyStopTimeResponse, TranzyTripResponse } from '../types/rawTranzyApi.ts';
import { handleApiError } from './error';
import { getApiConfig } from '../context/appContext';
import { API_CONFIG } from '../utils/core/constants';
import { staticDataService } from './staticDataService';

export const tripService = {
  /**
   * Get stop times for an agency.
   * Tries static GitHub source first, falls back to Tranzy API.
   */
  async getStopTimes(): Promise<TranzyStopTimeResponse[]> {
    const { agencyId } = getApiConfig();

    try {
      const remoteHashes = await staticDataService.fetchRemoteHashes();
      const result = await staticDataService.fetchEndpoint<TranzyStopTimeResponse[]>(
        agencyId, 'stop_times', remoteHashes
      );
      if (result) {
        console.log(`[TripService] Loaded ${result.data.length} stop_times from static source`);
        return result.data;
      }
    } catch (err) {
      console.warn('[TripService] Static source failed for stop_times, falling back to API:', err);
    }

    // Fallback: Tranzy API
    try {
      const { apiKey } = getApiConfig();
      const response = await axios.get<TranzyStopTimeResponse[]>(`${API_CONFIG.BASE_URL}/stop_times`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Agency-Id': agencyId.toString()
        }
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to fetch stop times');
    }
  },

  /**
   * Get trips for an agency.
   * Tries static GitHub source first, falls back to Tranzy API.
   */
  async getTrips(): Promise<TranzyTripResponse[]> {
    const { agencyId } = getApiConfig();

    try {
      const remoteHashes = await staticDataService.fetchRemoteHashes();
      const result = await staticDataService.fetchEndpoint<TranzyTripResponse[]>(
        agencyId, 'trips', remoteHashes
      );
      if (result) {
        console.log(`[TripService] Loaded ${result.data.length} trips from static source`);
        return result.data;
      }
    } catch (err) {
      console.warn('[TripService] Static source failed for trips, falling back to API:', err);
    }

    // Fallback: Tranzy API
    try {
      const { apiKey } = getApiConfig();
      const response = await axios.get<TranzyTripResponse[]>(`${API_CONFIG.BASE_URL}/trips`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Agency-Id': agencyId.toString()
        }
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to fetch trips');
    }
  }
};
