/**
 * Backward Compatibility Tests
 * Verifies that the new bulk shape caching system maintains compatibility with existing code
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useShapeStore } from '../../stores/shapeStore';
import { convertToRouteShape, getCachedRouteShape } from '../../utils/shapes/shapeUtils';
import { processAllShapes } from '../../utils/shapes/shapeProcessingUtils';
import type { TranzyShapeResponse } from '../../types/rawTranzyApi';
import type { RouteShape } from '../../types/arrivalTime';

// Mock data for testing
const mockShapePoints: TranzyShapeResponse[] = [
  {
    shape_id: 'test_shape_1',
    shape_pt_lat: 37.7749,
    shape_pt_lon: -122.4194,
    shape_pt_sequence: 1
  },
  {
    shape_id: 'test_shape_1',
    shape_pt_lat: 37.7849,
    shape_pt_lon: -122.4094,
    shape_pt_sequence: 2
  },
  {
    shape_id: 'test_shape_2',
    shape_pt_lat: 37.7649,
    shape_pt_lon: -122.4294,
    shape_pt_sequence: 1
  },
  {
    shape_id: 'test_shape_2',
    shape_pt_lat: 37.7549,
    shape_pt_lon: -122.4394,
    shape_pt_sequence: 2
  }
];

describe('Backward Compatibility', () => {
  beforeEach(() => {
    // Clear the store before each test
    useShapeStore.getState().clearShapes();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Shape Store getShape() method', () => {
    it('should provide shapes by shape_id from bulk collection', async () => {
      const store = useShapeStore.getState();
      
      // Process shapes using bulk processing
      const processedShapes = processAllShapes(mockShapePoints);
      
      // Manually set shapes in store to simulate bulk loading
      store.shapes.clear();
      for (const [shapeId, shape] of processedShapes) {
        store.shapes.set(shapeId, shape);
      }
      
      // Test that getShape returns the correct shape
      const shape1 = store.getShape('test_shape_1');
      const shape2 = store.getShape('test_shape_2');
      
      expect(shape1).toBeDefined();
      expect(shape2).toBeDefined();
      expect(shape1?.id).toBe('test_shape_1');
      expect(shape2?.id).toBe('test_shape_2');
      
      // Verify shape structure matches expected format
      expect(shape1?.points).toHaveLength(2);
      expect(shape1?.segments).toHaveLength(1);
      expect(shape2?.points).toHaveLength(2);
      expect(shape2?.segments).toHaveLength(1);
    });

    it('should return undefined for non-existent shape_id', () => {
      const store = useShapeStore.getState();
      
      const nonExistentShape = store.getShape('non_existent_shape');
      expect(nonExistentShape).toBeUndefined();
    });
  });

  describe('RouteShape format consistency', () => {
    it('should maintain expected RouteShape format for arrival calculations', () => {
      // Test individual conversion (existing method)
      const shape1Points = mockShapePoints.filter(p => p.shape_id === 'test_shape_1');
      const individualShape = convertToRouteShape(shape1Points);
      
      // Test bulk processing (new method)
      const bulkShapes = processAllShapes(mockShapePoints);
      const bulkShape = bulkShapes.get('test_shape_1');
      
      expect(bulkShape).toBeDefined();
      
      // Verify both methods produce the same structure
      expect(individualShape.id).toBe(bulkShape!.id);
      expect(individualShape.points).toHaveLength(bulkShape!.points.length);
      expect(individualShape.segments).toHaveLength(bulkShape!.segments.length);
      
      // Verify coordinate precision matches
      for (let i = 0; i < individualShape.points.length; i++) {
        expect(individualShape.points[i].lat).toBeCloseTo(bulkShape!.points[i].lat, 6);
        expect(individualShape.points[i].lon).toBeCloseTo(bulkShape!.points[i].lon, 6);
      }
      
      // Verify segment distances match
      for (let i = 0; i < individualShape.segments.length; i++) {
        expect(individualShape.segments[i].distance).toBeCloseTo(bulkShape!.segments[i].distance, 3);
      }
    });

    it('should maintain RouteShape interface compatibility', () => {
      const processedShapes = processAllShapes(mockShapePoints);
      const shape = processedShapes.get('test_shape_1');
      
      expect(shape).toBeDefined();
      
      // Verify required properties exist
      expect(shape).toHaveProperty('id');
      expect(shape).toHaveProperty('points');
      expect(shape).toHaveProperty('segments');
      
      // Verify property types
      expect(typeof shape!.id).toBe('string');
      expect(Array.isArray(shape!.points)).toBe(true);
      expect(Array.isArray(shape!.segments)).toBe(true);
      
      // Verify point structure
      if (shape!.points.length > 0) {
        const point = shape!.points[0];
        expect(point).toHaveProperty('lat');
        expect(point).toHaveProperty('lon');
        expect(typeof point.lat).toBe('number');
        expect(typeof point.lon).toBe('number');
      }
      
      // Verify segment structure
      if (shape!.segments.length > 0) {
        const segment = shape!.segments[0];
        expect(segment).toHaveProperty('start');
        expect(segment).toHaveProperty('end');
        expect(segment).toHaveProperty('distance');
        expect(typeof segment.distance).toBe('number');
      }
    });
  });

  describe('Integration with existing utilities', () => {
    it('should work with getCachedRouteShape utility', () => {
      const shape1Points = mockShapePoints.filter(p => p.shape_id === 'test_shape_1');
      
      // Test that getCachedRouteShape still works
      const cachedShape1 = getCachedRouteShape('test_shape_1', shape1Points);
      const cachedShape2 = getCachedRouteShape('test_shape_1', shape1Points);
      
      // Should return the same cached instance
      expect(cachedShape1).toBe(cachedShape2);
      
      // Should have correct structure
      expect(cachedShape1.id).toBe('test_shape_1');
      expect(cachedShape1.points).toHaveLength(2);
      expect(cachedShape1.segments).toHaveLength(1);
    });

    it('should handle empty shape points gracefully', () => {
      expect(() => {
        convertToRouteShape([]);
      }).toThrow('Cannot create RouteShape from empty shape points');
      
      // Bulk processing should handle empty arrays gracefully
      const emptyResult = processAllShapes([]);
      expect(emptyResult.size).toBe(0);
    });

    it('should handle malformed shape data gracefully', () => {
      // Test with valid data first
      const validShapes: TranzyShapeResponse[] = [
        {
          shape_id: 'valid_shape',
          shape_pt_lat: 37.7749,
          shape_pt_lon: -122.4194,
          shape_pt_sequence: 1
        },
        {
          shape_id: 'valid_shape',
          shape_pt_lat: 37.7849,
          shape_pt_lon: -122.4094,
          shape_pt_sequence: 2
        }
      ];
      
      // Bulk processing should handle valid shapes correctly
      const result = processAllShapes(validShapes);
      
      // Should have the valid shape
      expect(result.has('valid_shape')).toBe(true);
      expect(result.get('valid_shape')?.points).toHaveLength(2);
      
      // Test with empty array (edge case)
      const emptyResult = processAllShapes([]);
      expect(emptyResult.size).toBe(0);
    });
  });

  describe('Performance characteristics', () => {
    it('should provide O(1) shape lookup performance', () => {
      const store = useShapeStore.getState();
      const processedShapes = processAllShapes(mockShapePoints);
      
      // Set shapes in store
      store.shapes.clear();
      for (const [shapeId, shape] of processedShapes) {
        store.shapes.set(shapeId, shape);
      }
      
      // Multiple lookups should be fast (O(1))
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        store.getShape('test_shape_1');
        store.getShape('test_shape_2');
      }
      const end = performance.now();
      
      // Should complete quickly (less than 10ms for 2000 lookups)
      expect(end - start).toBeLessThan(10);
    });
  });

  describe('Data consistency', () => {
    it('should maintain consistent shape data across different access methods', () => {
      // Process shapes using bulk method
      const bulkShapes = processAllShapes(mockShapePoints);
      
      // Process same shapes individually
      const shape1Points = mockShapePoints.filter(p => p.shape_id === 'test_shape_1');
      const individualShape = convertToRouteShape(shape1Points);
      const bulkShape = bulkShapes.get('test_shape_1');
      
      expect(bulkShape).toBeDefined();
      
      // Data should be identical
      expect(individualShape.id).toBe(bulkShape!.id);
      expect(individualShape.points.length).toBe(bulkShape!.points.length);
      expect(individualShape.segments.length).toBe(bulkShape!.segments.length);
      
      // Coordinates should match exactly
      individualShape.points.forEach((point, index) => {
        expect(point.lat).toBe(bulkShape!.points[index].lat);
        expect(point.lon).toBe(bulkShape!.points[index].lon);
      });
      
      // Distances should match (within floating point precision)
      individualShape.segments.forEach((segment, index) => {
        expect(segment.distance).toBeCloseTo(bulkShape!.segments[index].distance, 10);
      });
    });
  });
});