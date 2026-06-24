// RouteService - Domain-focused service for route operations
// Primary source: static JSON from neary-gtfs releases branch (no API key needed)
// Fallback: Tranzy API (requires API key)

import axios from 'axios';
import type { TranzyRouteResponse } from '../types/rawTranzyApi.ts';
import { handleApiError, apiStatusTracker } from './error';
import { getApiConfig } from '../context/appContext';
import { API_CONFIG } from '../utils/core/constants';
import { staticDataService } from './staticDataService';

export const routeService = {
  /**
   * Get all routes for an agency.
   * Tries static GitHub source first, falls back to Tranzy API.
   */
  async getRoutes(): Promise<TranzyRouteResponse[]> {
    const { agencyId } = getApiConfig();

    // Try static source first (no API key needed, hash-checked)
    try {
      const remoteHashes = await staticDataService.fetchRemoteHashes();
      const result = await staticDataService.fetchEndpoint<TranzyRouteResponse[]>(
        agencyId, 'routes', remoteHashes
      );
      if (result) {
        console.log(`[RouteService] Loaded ${result.data.length} routes from static source`);
        return result.data;
      }
      // null means unchanged — but we still need to return data for the caller.
      // The store's cache handles this case (isDataFresh returns true).
      // If we get here during a forced refresh, fall through to API.
    } catch (err) {
      console.warn('[RouteService] Static source failed, falling back to API:', err);
    }

    // Fallback: Tranzy API
    const startTime = Date.now();
    try {
      const { apiKey } = getApiConfig();
      const response = await axios.get<TranzyRouteResponse[]>(`${API_CONFIG.BASE_URL}/routes`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Agency-Id': agencyId.toString()
        }
      });
      
      const responseTime = Date.now() - startTime;
      apiStatusTracker.recordSuccess('fetch routes', responseTime);
      
      if (typeof window !== 'undefined') {
        const { useStatusStore } = await import('../stores/statusStore');
        useStatusStore.getState().updateFromApiCall(true, responseTime, 'fetch routes');
      }
      
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to fetch routes');
    }
  },

  /**
   * Validate API key and agency combination by calling the routes endpoint
   * Standalone function that doesn't require app context
   * @param apiKey - API key to validate
   * @param agencyId - Agency ID to validate
   * @returns true on success, false on error
   */
  async validateAgency(apiKey: string, agencyId: number): Promise<boolean> {
    const startTime = Date.now();
    try {
      await axios.get(`${API_CONFIG.BASE_URL}/routes`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Agency-Id': agencyId.toString()
        }
      });
      
      // Record successful validation - updates connection status to green
      const responseTime = Date.now() - startTime;
      apiStatusTracker.recordSuccess('validate agency', responseTime);
      
      // Update status store if available
      if (typeof window !== 'undefined') {
        const { useStatusStore } = await import('../stores/statusStore');
        useStatusStore.getState().updateFromApiCall(true, responseTime, 'validate agency');
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
};