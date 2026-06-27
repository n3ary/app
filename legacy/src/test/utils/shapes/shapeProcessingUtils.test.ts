import { describe, it, expect } from 'vitest';
import { processAllShapes, generateShapeHash, validateShapeData } from '../../../utils/shapes/shapeProcessingUtils.ts';
import type { TranzyShapeResponse } from '../../../types/rawTranzyApi.ts';

describe('shapeProcessingUtils', () => {
  const mockShapePoints: TranzyShapeResponse[] = [
    {
      shape_id: '1_0',
      shape_pt_lat: 46.75123,
      shape_pt_lon: 23.54317,
      shape_pt_sequence: 0
    },
    {
      shape_id: '1_0',
      shape_pt_lat: 46.75456,
      shape_pt_lon: 23.54789,
      shape_pt_sequence: 1
    },
    {
      shape_id: '2_0',
      shape_pt_lat: 46.76123,
      shape_pt_lon: 23.55317,
      shape_pt_sequence: 0
    }
  ];

  describe('processAllShapes', () => {
    it('should process multiple shapes into RouteShape format', () => {
      const result = processAllShapes(mockShapePoints);
      
      expect(result.size).toBe(2);
      expect(result.has('1_0')).toBe(true);
      expect(result.has('2_0')).toBe(true);
      
      const shape1 = result.get('1_0')!;
      expect(shape1.id).toBe('1_0');
      expect(shape1.points).toHaveLength(2);
      expect(shape1.segments).toHaveLength(1);
      
      const shape2 = result.get('2_0')!;
      expect(shape2.id).toBe('2_0');
      expect(shape2.points).toHaveLength(1);
      expect(shape2.segments).toHaveLength(0);
    });

    it('should return empty map for empty input', () => {
      const result = processAllShapes([]);
      expect(result.size).toBe(0);
    });
  });

  describe('generateShapeHash', () => {
    it('should generate consistent hash for same data', () => {
      const shapes = processAllShapes(mockShapePoints);
      const hash1 = generateShapeHash(shapes);
      const hash2 = generateShapeHash(shapes);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBeTruthy();
      expect(typeof hash1).toBe('string');
    });

    it('should generate different hashes for different data', () => {
      const shapes1 = processAllShapes(mockShapePoints);
      const shapes2 = processAllShapes([mockShapePoints[0]]);
      
      const hash1 = generateShapeHash(shapes1);
      const hash2 = generateShapeHash(shapes2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should return empty string for empty shapes', () => {
      const emptyShapes = new Map();
      const hash = generateShapeHash(emptyShapes);
      expect(hash).toBe('');
    });
  });

  describe('validateShapeData', () => {
    it('should validate correct shape data', () => {
      const result = validateShapeData(mockShapePoints);
      expect(result).toHaveLength(3);
      expect(result).toEqual(mockShapePoints);
    });

    it('should filter out invalid shapes', () => {
      const invalidShapes: any[] = [
        mockShapePoints[0], // valid
        { shape_id: '', shape_pt_lat: 46.75, shape_pt_lon: 23.54, shape_pt_sequence: 0 }, // invalid shape_id
        { shape_id: '2_0', shape_pt_lat: 'invalid', shape_pt_lon: 23.54, shape_pt_sequence: 0 }, // invalid lat
        { shape_id: '3_0', shape_pt_lat: 46.75, shape_pt_lon: 23.54, shape_pt_sequence: -1 }, // invalid sequence
        mockShapePoints[1] // valid
      ];
      
      const result = validateShapeData(invalidShapes);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockShapePoints[0]);
      expect(result[1]).toEqual(mockShapePoints[1]);
    });

    it('should throw error for non-array input', () => {
      expect(() => validateShapeData(null as any)).toThrow('Shape data must be an array');
      expect(() => validateShapeData('invalid' as any)).toThrow('Shape data must be an array');
    });
  });
});