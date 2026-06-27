/**
 * Shape Store Integration Tests
 * Verifies that the shape store can be used as a drop-in replacement for existing shape fetching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useShapeStore } from '../../stores/shapeStore';
import { processAllShapes } from '../../utils/shapes/shapeProcessingUtils';
import type { TranzyShapeResponse } from '../../types/rawTranzyApi';

// Mock shape data for testing
const mockShapeData: TranzyShapeResponse[] = [
  {
    shape_id: 'route_1_shape',
    shape_pt_lat: 37.7749,
    shape_pt_lon: -122.4194,
    shape_pt_sequence: 1
  },
  {
    shape_id: 'route_1_shape',
    shape_pt_lat: 37.7849,
    shape_pt_lon: -122.4094,
    shape_pt_sequence: 2
  },
  {
    shape_id: 'route_2_shape',
    shape_pt_lat: 37.7649,
    shape_pt_lon: -122.4294,
    shape_pt_sequence: 1
  },
  {
    shape_id: 'route_2_shape',
    shape_pt_lat: 37.7549,
    shape_pt_lon: -122.4394,
    shape_pt_sequence: 2
  }
];

describe('Shape Store Integration', () => {
  beforeEach(() => {
    // Clear the store before each test
    useShapeStore.getState().clearShapes();
  });

  describe('Drop-in replacement for route shape service', () => {
    it('should provide shapes after manual loading', () => {
      const store = useShapeStore.getState();
      
      // Manually load shapes to simulate successful initialization
      const processedShapes = processAllShapes(mockShapeData);
      
      // Use Zustand's setState to update the store properly
      useShapeStore.setState({
        shapes: processedShapes,
        lastUpdated: Date.now(),
        dataHash: 'test-hash'
      });
      
      // Get fresh state
      const updatedState = useShapeStore.getState();
      
      // Should have loaded shapes
      expect(updatedState.shapes.size).toBeGreaterThan(0);
      
      // Should be able to get specific shapes
      const route1Shape = updatedState.getShape('route_1_shape');
      const route2Shape = updatedState.getShape('route_2_shape');
      
      expect(route1Shape).toBeDefined();
      expect(route2Shape).toBeDefined();
      expect(route1Shape?.id).toBe('route_1_shape');
      expect(route2Shape?.id).toBe('route_2_shape');
    });

    it('should handle concurrent shape requests efficiently', () => {
      const store = useShapeStore.getState();
      
      // Manually load shapes
      const processedShapes = processAllShapes(mockShapeData);
      useShapeStore.setState({
        shapes: processedShapes,
        lastUpdated: Date.now(),
        dataHash: 'test-hash'
      });
      
      const updatedState = useShapeStore.getState();
      
      // Multiple concurrent requests should all return the same data
      const results = Array.from({ length: 10 }, () => 
        updatedState.getShape('route_1_shape')
      );
      
      // All results should be identical (same reference)
      results.forEach(result => {
        expect(result).toBe(results[0]);
        expect(result?.id).toBe('route_1_shape');
      });
    });

    it('should maintain performance characteristics', () => {
      const store = useShapeStore.getState();
      
      // Manually load shapes
      const processedShapes = processAllShapes(mockShapeData);
      useShapeStore.setState({
        shapes: processedShapes,
        lastUpdated: Date.now(),
        dataHash: 'test-hash'
      });
      
      const updatedState = useShapeStore.getState();
      
      // Measure lookup performance
      const iterations = 1000;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        updatedState.getShape('route_1_shape');
        updatedState.getShape('route_2_shape');
      }
      
      const end = performance.now();
      const duration = end - start;
      
      // Should be very fast (less than 5ms for 2000 lookups)
      expect(duration).toBeLessThan(5);
    });
  });

  describe('Fallback behavior', () => {
    it('should handle missing shapes gracefully', () => {
      const store = useShapeStore.getState();
      
      // Request non-existent shape
      const nonExistentShape = store.getShape('non_existent_shape');
      
      expect(nonExistentShape).toBeUndefined();
      expect(store.error).toBeNull(); // Should not cause error state
    });

    it('should maintain existing interface contracts', () => {
      const store = useShapeStore.getState();
      
      // Manually load shapes
      const processedShapes = processAllShapes(mockShapeData);
      useShapeStore.setState({
        shapes: processedShapes,
        lastUpdated: Date.now(),
        dataHash: 'test-hash'
      });
      
      const updatedState = useShapeStore.getState();
      
      // Verify the store provides the same interface as expected
      expect(typeof updatedState.getShape).toBe('function');
      expect(typeof updatedState.hasShape).toBe('function');
      expect(typeof updatedState.isDataFresh).toBe('function');
      
      // Verify return types
      const shape = updatedState.getShape('route_1_shape');
      if (shape) {
        expect(typeof shape.id).toBe('string');
        expect(Array.isArray(shape.points)).toBe(true);
        expect(Array.isArray(shape.segments)).toBe(true);
      }
      
      // Verify utility methods
      expect(typeof updatedState.hasShape('route_1_shape')).toBe('boolean');
      expect(typeof updatedState.isDataFresh()).toBe('boolean');
    });
  });

  describe('Store state management', () => {
    it('should maintain consistent state', () => {
      const store = useShapeStore.getState();
      
      // Initial state
      expect(store.shapes.size).toBe(0);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
      
      // After manual loading
      const processedShapes = processAllShapes(mockShapeData);
      useShapeStore.setState({
        shapes: processedShapes,
        lastUpdated: Date.now(),
        dataHash: 'test-hash'
      });
      
      const updatedState = useShapeStore.getState();
      
      expect(updatedState.shapes.size).toBeGreaterThan(0);
      expect(updatedState.hasShape('route_1_shape')).toBe(true);
      expect(updatedState.hasShape('route_2_shape')).toBe(true);
      expect(updatedState.hasShape('non_existent')).toBe(false);
    });

    it('should handle clear operation correctly', () => {
      // Load shapes by setting the state properly
      const processedShapes = processAllShapes(mockShapeData);
      
      // Use Zustand's set method to update the state properly
      useShapeStore.setState({
        shapes: processedShapes,
        lastUpdated: Date.now(),
        dataHash: 'test-hash'
      });
      
      // Verify shapes were loaded
      const loadedState = useShapeStore.getState();
      expect(loadedState.shapes.size).toBeGreaterThan(0);
      
      // Clear shapes
      loadedState.clearShapes();
      
      // Get fresh state after clearing
      const clearedState = useShapeStore.getState();
      expect(clearedState.shapes.size).toBe(0);
      expect(clearedState.error).toBeNull();
      expect(clearedState.lastUpdated).toBeNull();
      // Note: dataHash was removed in simplified version
    });
  });
});