import { describe, it, expect } from 'vitest';
import { convertToRouteShape, getCachedRouteShape, clearShapeCache } from '../../../utils/shapes/shapeUtils.ts';
import type { TranzyShapeResponse } from '../../../types/rawTranzyApi.ts';

describe('shapeUtils', () => {
  const mockShapePoints: TranzyShapeResponse[] = [
    {
      shape_id: '1_0',
      shape_pt_lat: 46.75123,
      shape_pt_lon: 23.54317,
      shape_pt_sequence: 0
    },
    {
      shape_id: '1_0',
      shape_pt_lat: 46.75125,
      shape_pt_lon: 23.5432,
      shape_pt_sequence: 1
    },
    {
      shape_id: '1_0',
      shape_pt_lat: 46.75129,
      shape_pt_lon: 23.54327,
      shape_pt_sequence: 2
    }
  ];

  describe('convertToRouteShape', () => {
    it('should convert shape points to RouteShape format', () => {
      const routeShape = convertToRouteShape(mockShapePoints);

      expect(routeShape.id).toBe('1_0');
      expect(routeShape.points).toHaveLength(3);
      expect(routeShape.segments).toHaveLength(2);
      
      // Check first point
      expect(routeShape.points[0]).toEqual({
        lat: 46.75123,
        lon: 23.54317
      });
      
      // Check segments have distance calculated
      expect(routeShape.segments[0].distance).toBeGreaterThan(0);
      expect(routeShape.segments[0].start).toEqual(routeShape.points[0]);
      expect(routeShape.segments[0].end).toEqual(routeShape.points[1]);
    });

    it('should sort points by sequence', () => {
      const unorderedPoints = [
        { ...mockShapePoints[2] },
        { ...mockShapePoints[0] },
        { ...mockShapePoints[1] }
      ];

      const routeShape = convertToRouteShape(unorderedPoints);
      
      // Should be sorted by sequence
      expect(routeShape.points[0].lat).toBe(46.75123); // sequence 0
      expect(routeShape.points[1].lat).toBe(46.75125); // sequence 1
      expect(routeShape.points[2].lat).toBe(46.75129); // sequence 2
    });

    it('should throw error for empty shape points', () => {
      expect(() => convertToRouteShape([])).toThrow('Cannot create RouteShape from empty shape points');
    });
  });

  describe('getCachedRouteShape', () => {
    beforeEach(() => {
      clearShapeCache();
    });

    it('should cache route shapes', () => {
      const shape1 = getCachedRouteShape('1_0', mockShapePoints);
      const shape2 = getCachedRouteShape('1_0', mockShapePoints);
      
      // Should return the same object (cached)
      expect(shape1).toBe(shape2);
    });

    it('should create different shapes for different shape IDs', () => {
      const differentShapePoints = mockShapePoints.map(point => ({
        ...point,
        shape_id: '2_0'
      }));

      const shape1 = getCachedRouteShape('1_0', mockShapePoints);
      const shape2 = getCachedRouteShape('2_0', differentShapePoints);
      
      expect(shape1).not.toBe(shape2);
      expect(shape1.id).toBe('1_0');
      expect(shape2.id).toBe('2_0');
    });
  });
});