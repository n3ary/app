// ShapesService - Domain-focused service for route shape operations
// Primary source: static JSON from neary-gtfs releases branch
// Fallback: Tranzy API

import axios from 'axios';
import type { TranzyShapeResponse } from '../types/rawTranzyApi.ts';
import { handleApiError } from './error';
import { getApiConfig } from '../context/appContext';
import { API_CONFIG } from '../utils/core/constants';
import { staticDataService } from './staticDataService';

export const shapesService = {
  /**
   * Get all shapes in bulk.
   * Tries static GitHub source first (avoids 14 MB Tranzy API hit),
   * falls back to Tranzy API if static source unavailable.
   */
  async getAllShapes(): Promise<TranzyShapeResponse[]> {
    const { agencyId } = getApiConfig();

    // Try static source first (much better for shapes — cached, no API key needed)
    try {
      const remoteHashes = await staticDataService.fetchRemoteHashes();
      const result = await staticDataService.fetchEndpoint<TranzyShapeResponse[]>(
        agencyId, 'shapes', remoteHashes
      );
      if (result) {
        console.log(`[ShapesService] Loaded ${result.data.length} shape points from static source`);
        return result.data;
      }
    } catch (err) {
      console.warn('[ShapesService] Static source failed, falling back to API:', err);
    }

    // Fallback: Tranzy API
    try {
      const { apiKey } = getApiConfig();
      const response = await axios.get<TranzyShapeResponse[]>(`${API_CONFIG.BASE_URL}/shapes`, {
        headers: {
          'X-API-Key': apiKey,
          'X-Agency-Id': agencyId.toString()
        },
        timeout: 30000,
      });
      
      if (!Array.isArray(response.data)) {
        throw new Error('Invalid response format: expected array of shapes');
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'NETWORK_ERROR') {
          throw new Error('Network timeout - check your connection and try again');
        }
        if (!error.response) {
          throw new Error('Network error - unable to reach server');
        }
      }
      
      throw handleApiError(error, 'Failed to fetch all shapes');
    }
  }
};
