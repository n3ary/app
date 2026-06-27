// Test to verify that all stores have the required refresh functionality
// This test ensures that the manual data refresh feature requirements are met

import { describe, it, expect, beforeEach } from 'vitest';
import { useVehicleStore } from '../../stores/vehicleStore';
import { useStationStore } from '../../stores/stationStore';
import { useRouteStore } from '../../stores/routeStore';
import { useStopTimeStore } from '../../stores/stopTimeStore';
import { useTripStore } from '../../stores/tripStore';
import { useShapeStore } from '../../stores/shapeStore';
import { useFavoritesStore } from '../../stores/favoritesStore';

describe('Store Refresh Functionality', () => {
  beforeEach(() => {
    // Clear all stores before each test
    useVehicleStore.getState().clearVehicles();
    useStationStore.getState().clearStops();
    useRouteStore.getState().clearRoutes();
    useStopTimeStore.getState().clearStopTimes();
    useTripStore.getState().clearTrips();
    useShapeStore.getState().clearShapes();
    useFavoritesStore.getState().clearFavorites();
  });

  describe('VehicleStore', () => {
    it('should have all required refresh methods', () => {
      const store = useVehicleStore.getState();
      
      // Check that all required methods exist
      expect(typeof store.refreshData).toBe('function');
      expect(typeof store.isDataFresh).toBe('function');
      
      // Check that lastUpdated property exists
      expect(store.lastUpdated).toBe(null); // Initially null
    });

    it('should have isDataFresh method that works correctly', () => {
      const store = useVehicleStore.getState();
      
      // Initially should not be fresh (no data)
      expect(store.isDataFresh()).toBe(false);
      
      // Simulate setting lastApiFetch to now
      useVehicleStore.setState({ lastApiFetch: Date.now() });
      expect(store.isDataFresh()).toBe(true);
      
      // Simulate old data
      useVehicleStore.setState({ lastApiFetch: Date.now() - 10 * 60 * 1000 }); // 10 minutes ago
      expect(store.isDataFresh()).toBe(false);
    });
  });

  describe('StationStore', () => {
    it('should have all required refresh methods', () => {
      const store = useStationStore.getState();
      
      // Check that all required methods exist
      expect(typeof store.refreshData).toBe('function');
      expect(typeof store.isDataFresh).toBe('function');
      
      // Check that lastUpdated property exists
      expect(store.lastUpdated).toBe(null); // Initially null
    });

    it('should have isDataFresh method that works correctly', () => {
      const store = useStationStore.getState();
      
      // Initially should not be fresh (no data)
      expect(store.isDataFresh()).toBe(false);
      
      // Simulate setting lastApiFetch to now
      useStationStore.setState({ lastApiFetch: Date.now() });
      expect(store.isDataFresh()).toBe(true);
      
      // Simulate old data (25 hours ago - should be stale for general data)
      useStationStore.setState({ lastApiFetch: Date.now() - 25 * 60 * 60 * 1000 });
      expect(store.isDataFresh()).toBe(false);
    });
  });

  describe('RouteStore', () => {
    it('should have all required refresh methods', () => {
      const store = useRouteStore.getState();
      
      // Check that all required methods exist
      expect(typeof store.refreshData).toBe('function');
      expect(typeof store.isDataFresh).toBe('function');
      
      // Check that lastUpdated property exists
      expect(store.lastUpdated).toBe(null); // Initially null
    });
  });

  describe('StopTimeStore', () => {
    it('should have all required refresh methods', () => {
      const store = useStopTimeStore.getState();
      
      // Check that all required methods exist
      expect(typeof store.refreshData).toBe('function');
      expect(typeof store.isDataFresh).toBe('function');
      
      // Check that lastUpdated property exists
      expect(store.lastUpdated).toBe(null); // Initially null
    });
  });

  describe('TripStore', () => {
    it('should have all required refresh methods', () => {
      const store = useTripStore.getState();
      
      // Check that all required methods exist
      expect(typeof store.refreshData).toBe('function');
      expect(typeof store.isDataFresh).toBe('function');
      
      // Check that lastUpdated property exists
      expect(store.lastUpdated).toBe(null); // Initially null
    });
  });

  describe('FavoritesStore', () => {
    it('should have all required refresh methods', () => {
      const store = useFavoritesStore.getState();
      
      // Check that all required methods exist
      expect(typeof store.refreshData).toBe('function');
      expect(typeof store.isDataFresh).toBe('function');
      
      // Check that lastUpdated property exists
      expect(typeof store.lastUpdated).toBe('number'); // Should be initialized with current time
    });

    it('should use per-agency favorites structure', () => {
      const store = useFavoritesStore.getState();
      
      // Should be an object mapping agency IDs to arrays
      expect(typeof store.favoritesByAgency).toBe('object');
      expect(store.favoritesByAgency).not.toBeNull();
      
      // Set agency context for testing
      store.setCurrentAgency(123);
      
      // Test basic functionality
      store.addFavorite('route1');
      expect(store.isFavorite('route1')).toBe(true);
      expect(store.getFavoriteCount()).toBe(1);
      
      store.removeFavorite('route1');
      expect(store.isFavorite('route1')).toBe(false);
      expect(store.getFavoriteCount()).toBe(0);
    });
  });

  describe('ShapeStore', () => {
    it('should have all required refresh methods', () => {
      const store = useShapeStore.getState();
      
      // Check that all required methods exist
      expect(typeof store.refreshData).toBe('function');
      expect(typeof store.isDataFresh).toBe('function');
      
      // Check that lastUpdated property exists
      expect(store.lastUpdated).toBe(null); // Initially null
    });

    it('should have consistent refreshData method like other stores', () => {
      const store = useShapeStore.getState();
      
      // Should have refreshData method like all other stores
      expect(typeof store.refreshData).toBe('function');
    });
  });

  describe('API Consistency', () => {
    it('should have consistent method signatures across all stores', () => {
      const stores = [
        useVehicleStore.getState(),
        useStationStore.getState(),
        useRouteStore.getState(),
        useStopTimeStore.getState(),
        useTripStore.getState(),
        useShapeStore.getState(),
        useFavoritesStore.getState()
      ];

      stores.forEach((store, index) => {
        const storeName = ['Vehicle', 'Station', 'Route', 'StopTime', 'Trip', 'Shape', 'Favorites'][index];
        
        // All stores should have these methods with correct signatures
        expect(typeof store.refreshData, `${storeName}Store.refreshData`).toBe('function');
        expect(typeof store.isDataFresh, `${storeName}Store.isDataFresh`).toBe('function');
        
        // All stores should have lastUpdated property (favorites store initializes it)
        expect(typeof store.lastUpdated, `${storeName}Store.lastUpdated`).toBe(store === useFavoritesStore.getState() ? 'number' : 'object');
      });
    });
  });
});