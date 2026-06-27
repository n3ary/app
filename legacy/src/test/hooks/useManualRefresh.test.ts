// useManualRefresh Hook Tests

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useManualRefresh } from '../../hooks/useManualRefresh';
import { manualRefreshService } from '../../services/manualRefreshService';

// Mock dependencies
vi.mock('../../services/manualRefreshService');
vi.mock('../../stores/statusStore', () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      networkOnline: true,
      apiStatus: 'online'
    };
    return selector ? selector(mockState) : mockState;
  })
}));

describe('useManualRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(manualRefreshService.isRefreshInProgress).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should provide refresh function', () => {
      const { result } = renderHook(() => useManualRefresh());

      expect(typeof result.current.refresh).toBe('function');
      expect(typeof result.current.isRefreshing).toBe('boolean');
      expect(typeof result.current.canRefresh).toBe('boolean');
    });

    it('should call manualRefreshService.refreshData', async () => {
      const mockResult = {
        success: true,
        errors: [],
        refreshedStores: ['vehicles', 'stations'],
        skippedStores: []
      };

      vi.mocked(manualRefreshService.refreshData).mockResolvedValue(mockResult);

      const { result } = renderHook(() => useManualRefresh());

      let refreshResult;
      await act(async () => {
        refreshResult = await result.current.refresh();
      });

      expect(manualRefreshService.refreshData).toHaveBeenCalled();
      expect(refreshResult).toEqual(mockResult);
    });

    it('should handle refresh errors gracefully', async () => {
      const mockErrorResult = {
        success: false,
        errors: ['Network error'],
        refreshedStores: [],
        skippedStores: []
      };
      vi.mocked(manualRefreshService.refreshData).mockResolvedValue(mockErrorResult);

      const { result } = renderHook(() => useManualRefresh());

      let refreshResult;
      await act(async () => {
        refreshResult = await result.current.refresh();
      });

      expect(refreshResult).toEqual(mockErrorResult);
    });
  });
});
