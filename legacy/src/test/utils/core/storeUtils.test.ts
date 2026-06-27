// Tests for store utilities
// Ensures the shared utilities work correctly and eliminate duplication

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRefreshMethod, createFreshnessChecker } from '../../../utils/core/storeUtils';

describe('storeUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRefreshMethod', () => {
    it('should create refresh method that calls service and updates state', async () => {
      const mockService = {
        testService: {
          getData: vi.fn().mockResolvedValue(['data1', 'data2'])
        }
      };
      
      const mockServiceImport = vi.fn().mockResolvedValue(mockService);
      const mockGetState = vi.fn(() => ({ data: [], lastUpdated: null, error: null }));
      const mockSetState = vi.fn();

      const refreshMethod = createRefreshMethod('test', 'data', mockServiceImport, 'getData');
      
      await refreshMethod(mockGetState, mockSetState);

      // Should call service
      expect(mockServiceImport).toHaveBeenCalled();
      expect(mockService.testService.getData).toHaveBeenCalled();
      
      // Should update state with data and both timestamps
      expect(mockSetState).toHaveBeenCalledWith({
        data: ['data1', 'data2'],
        error: null,
        lastUpdated: expect.any(Number),
        lastApiFetch: expect.any(Number)
      });
    });

    it('should handle service errors gracefully', async () => {
      const mockServiceImport = vi.fn().mockRejectedValue(new Error('Service error'));
      const mockGetState = vi.fn(() => ({ data: [], lastUpdated: null, error: null }));
      const mockSetState = vi.fn();

      const refreshMethod = createRefreshMethod('test', 'data', mockServiceImport, 'getData');
      
      await refreshMethod(mockGetState, mockSetState);

      // Should set error state (no cached data available)
      expect(mockSetState).toHaveBeenCalledWith({
        error: 'Service error'
      });
    });

    it('should use retry and cached data by default', async () => {
      const mockServiceImport = vi.fn().mockRejectedValue(new Error('Network error'));
      const mockGetState = vi.fn(() => ({ 
        data: ['cached1', 'cached2'], 
        lastUpdated: Date.now() - 1000, 
        error: null 
      }));
      const mockSetState = vi.fn();

      const refreshMethod = createRefreshMethod('test', 'data', mockServiceImport, 'getData');
      
      await refreshMethod(mockGetState, mockSetState);

      // Should not update state when cached data exists and error occurs
      expect(mockSetState).not.toHaveBeenCalled();
    });
  });

  describe('createFreshnessChecker', () => {
    it('should create freshness checker that works correctly', () => {
      const freshnessChecker = createFreshnessChecker(60000); // 1 minute
      
      // Mock state with recent timestamp
      const mockGetState = vi.fn(() => ({ lastApiFetch: Date.now() - 30000 })); // 30 seconds ago
      
      expect(freshnessChecker(mockGetState)).toBe(true);
    });

    it('should use custom maxAge when provided', () => {
      const freshnessChecker = createFreshnessChecker(60000); // Default 1 minute
      
      // Mock state with old timestamp
      const mockGetState = vi.fn(() => ({ lastApiFetch: Date.now() - 120000 })); // 2 minutes ago
      
      // Should be stale with default (1 minute)
      expect(freshnessChecker(mockGetState)).toBe(false);
      
      // Should be fresh with custom longer duration (3 minutes)
      expect(freshnessChecker(mockGetState, 180000)).toBe(true);
    });
  });
});