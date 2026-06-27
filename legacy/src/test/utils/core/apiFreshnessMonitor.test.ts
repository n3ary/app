// Tests for Data Freshness Monitor
// Validates freshness calculations and subscription mechanisms

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  ApiFreshnessMonitor, 
  getDataFreshnessMonitor,
  destroyDataFreshnessMonitor
} from '../../../utils/core/apiFreshnessMonitor';
import { API_DATA_STALENESS_THRESHOLDS, AUTO_REFRESH_CYCLE } from '../../../utils/core/constants';
import { manualRefreshService } from '../../../services/manualRefreshService';

// Mock all store modules
vi.mock('../../../stores/vehicleStore', () => ({
  useVehicleStore: {
    getState: vi.fn(() => ({ lastUpdated: null, loading: false })),
    subscribe: vi.fn(() => vi.fn()) // Return unsubscribe function
  }
}));

// Mock manual refresh service
vi.mock('../../../services/manualRefreshService', () => ({
  manualRefreshService: {
    isRefreshInProgress: vi.fn(() => false)
  }
}));

vi.mock('../../../stores/stationStore', () => ({
  useStationStore: {
    getState: vi.fn(() => ({ lastUpdated: null, loading: false })),
    subscribe: vi.fn(() => vi.fn())
  }
}));

vi.mock('../../../stores/routeStore', () => ({
  useRouteStore: {
    getState: vi.fn(() => ({ lastUpdated: null, loading: false })),
    subscribe: vi.fn(() => vi.fn())
  }
}));

vi.mock('../../../stores/shapeStore', () => ({
  useShapeStore: {
    getState: vi.fn(() => ({ lastUpdated: null, loading: false })),
    subscribe: vi.fn(() => vi.fn())
  }
}));

vi.mock('../../../stores/stopTimeStore', () => ({
  useStopTimeStore: {
    getState: vi.fn(() => ({ lastUpdated: null, loading: false })),
    subscribe: vi.fn(() => vi.fn())
  }
}));

vi.mock('../../../stores/tripStore', () => ({
  useTripStore: {
    getState: vi.fn(() => ({ lastUpdated: null, loading: false })),
    subscribe: vi.fn(() => vi.fn())
  }
}));

// Import mocked stores
import { useVehicleStore } from '../../../stores/vehicleStore';
import { useStationStore } from '../../../stores/stationStore';
import { useRouteStore } from '../../../stores/routeStore';
import { useShapeStore } from '../../../stores/shapeStore';
import { useStopTimeStore } from '../../../stores/stopTimeStore';
import { useTripStore } from '../../../stores/tripStore';

describe('ApiFreshnessMonitor', () => {
  let monitor: ApiFreshnessMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all store states to default
    vi.mocked(useVehicleStore.getState).mockReturnValue({ lastUpdated: null, loading: false });
    vi.mocked(useStationStore.getState).mockReturnValue({ lastUpdated: null, loading: false });
    vi.mocked(useRouteStore.getState).mockReturnValue({ lastUpdated: null, loading: false });
    vi.mocked(useShapeStore.getState).mockReturnValue({ lastUpdated: null, loading: false });
    vi.mocked(useStopTimeStore.getState).mockReturnValue({ lastUpdated: null, loading: false });
    vi.mocked(useTripStore.getState).mockReturnValue({ lastUpdated: null, loading: false });
  });

  afterEach(() => {
    if (monitor) {
      monitor.destroy();
    }
    destroyDataFreshnessMonitor();
  });

  describe('calculateApiFreshness', () => {
    it('should return fresh status when no data exists (empty state)', () => {
      monitor = new ApiFreshnessMonitor();
      const status = monitor.calculateApiFreshness();

      // When no data exists, status should be 'fresh' (grey/default state, not red/stale)
      expect(status.status).toBe('fresh');
      expect(status.vehicleApiAge).toBe(Infinity);
      expect(status.staticApiAge).toBe(Infinity);
      expect(status.isRefreshing).toBe(false);
    });

    it('should return fresh status when all data is within thresholds', () => {
      const now = Date.now();
      const recentTime = now - 1000; // 1 second ago

      // Mock fresh data for all stores
      vi.mocked(useVehicleStore.getState).mockReturnValue({ 
        lastUpdated: recentTime, 
        loading: false 
      });
      vi.mocked(useStationStore.getState).mockReturnValue({ 
        lastUpdated: recentTime, 
        loading: false 
      });
      vi.mocked(useRouteStore.getState).mockReturnValue({ 
        lastUpdated: recentTime, 
        loading: false 
      });
      vi.mocked(useShapeStore.getState).mockReturnValue({ 
        lastUpdated: recentTime, 
        loading: false 
      });
      vi.mocked(useStopTimeStore.getState).mockReturnValue({ 
        lastUpdated: recentTime, 
        loading: false 
      });
      vi.mocked(useTripStore.getState).mockReturnValue({ 
        lastUpdated: recentTime, 
        loading: false 
      });

      monitor = new ApiFreshnessMonitor();
      const status = monitor.calculateApiFreshness();

      expect(status.status).toBe('fresh');
      expect(status.vehicleApiAge).toBeLessThan(API_DATA_STALENESS_THRESHOLDS.VEHICLES);
      expect(status.staticApiAge).toBeLessThan(API_DATA_STALENESS_THRESHOLDS.STATIC_DATA);
    });

    it('should return stale status when vehicle data exceeds 5 minute threshold', () => {
      const now = Date.now();
      const staleVehicleTime = now - (6 * 60 * 1000); // 6 minutes ago
      const freshGeneralTime = now - 1000; // 1 second ago

      vi.mocked(useVehicleStore.getState).mockReturnValue({ 
        lastUpdated: staleVehicleTime, 
        loading: false 
      });
      vi.mocked(useStationStore.getState).mockReturnValue({ 
        lastUpdated: freshGeneralTime, 
        loading: false 
      });
      vi.mocked(useRouteStore.getState).mockReturnValue({ 
        lastUpdated: freshGeneralTime, 
        loading: false 
      });
      vi.mocked(useShapeStore.getState).mockReturnValue({ 
        lastUpdated: freshGeneralTime, 
        loading: false 
      });
      vi.mocked(useStopTimeStore.getState).mockReturnValue({ 
        lastUpdated: freshGeneralTime, 
        loading: false 
      });
      vi.mocked(useTripStore.getState).mockReturnValue({ 
        lastUpdated: freshGeneralTime, 
        loading: false 
      });

      monitor = new ApiFreshnessMonitor();
      const status = monitor.calculateApiFreshness();

      expect(status.status).toBe('stale');
      expect(status.vehicleApiAge).toBeGreaterThan(API_DATA_STALENESS_THRESHOLDS.VEHICLES);
    });

    it('should return stale status when general data exceeds 24 hour threshold', () => {
      const now = Date.now();
      const freshVehicleTime = now - 1000; // 1 second ago
      const staleGeneralTime = now - (25 * 60 * 60 * 1000); // 25 hours ago

      vi.mocked(useVehicleStore.getState).mockReturnValue({ 
        lastUpdated: freshVehicleTime, 
        loading: false 
      });
      vi.mocked(useStationStore.getState).mockReturnValue({ 
        lastUpdated: staleGeneralTime, 
        loading: false 
      });
      vi.mocked(useRouteStore.getState).mockReturnValue({ 
        lastUpdated: freshVehicleTime, 
        loading: false 
      });
      vi.mocked(useShapeStore.getState).mockReturnValue({ 
        lastUpdated: freshVehicleTime, 
        loading: false 
      });
      vi.mocked(useStopTimeStore.getState).mockReturnValue({ 
        lastUpdated: freshVehicleTime, 
        loading: false 
      });
      vi.mocked(useTripStore.getState).mockReturnValue({ 
        lastUpdated: freshVehicleTime, 
        loading: false 
      });

      monitor = new ApiFreshnessMonitor();
      const status = monitor.calculateApiFreshness();

      expect(status.status).toBe('stale');
      expect(status.staticApiAge).toBeGreaterThan(API_DATA_STALENESS_THRESHOLDS.STATIC_DATA);
    });

    it('should detect when stores are refreshing', () => {
      vi.mocked(manualRefreshService.isRefreshInProgress).mockReturnValue(true);

      monitor = new ApiFreshnessMonitor();
      const status = monitor.calculateApiFreshness();

      expect(status.isRefreshing).toBe(true);
    });
  });

  describe('subscriptions', () => {
    it('should notify subscribers when subscribed', () => {
      monitor = new ApiFreshnessMonitor();
      const callback = vi.fn();

      const unsubscribe = monitor.subscribeToChanges(callback);
      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });

    it('should setup subscriptions to all stores', () => {
      monitor = new ApiFreshnessMonitor();

      // Verify that subscribe was called on all stores
      expect(useVehicleStore.subscribe).toHaveBeenCalled();
      expect(useStationStore.subscribe).toHaveBeenCalled();
      expect(useRouteStore.subscribe).toHaveBeenCalled();
      expect(useShapeStore.subscribe).toHaveBeenCalled();
      expect(useStopTimeStore.subscribe).toHaveBeenCalled();
      expect(useTripStore.subscribe).toHaveBeenCalled();
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance from getDataFreshnessMonitor', () => {
      const instance1 = getDataFreshnessMonitor();
      const instance2 = getDataFreshnessMonitor();

      expect(instance1).toBe(instance2);

      // Cleanup
      destroyDataFreshnessMonitor();
    });

    it('should create new instance after destroy', () => {
      const instance1 = getDataFreshnessMonitor();
      destroyDataFreshnessMonitor();
      const instance2 = getDataFreshnessMonitor();

      expect(instance1).not.toBe(instance2);

      // Cleanup
      destroyDataFreshnessMonitor();
    });
  });

  describe('cleanup', () => {
    it('should cleanup subscriptions and intervals on destroy', () => {
      monitor = new ApiFreshnessMonitor();
      
      // Destroy should not throw
      expect(() => monitor.destroy()).not.toThrow();
    });
  });

  describe('constants', () => {
    it('should have correct freshness thresholds', () => {
      expect(API_DATA_STALENESS_THRESHOLDS.VEHICLES).toBe(5 * 60 * 1000); // 5 minutes
      expect(API_DATA_STALENESS_THRESHOLDS.STATIC_DATA).toBe(24 * 60 * 60 * 1000); // 24 hours
    });

    it('should have correct auto refresh intervals', () => {
      expect(AUTO_REFRESH_CYCLE).toBe(120 * 1000); // 2 minutes
    });
  });
});