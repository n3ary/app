/**
 * Shape Processing Utilities
 * Bulk processing functions for route shape data with caching and validation
 */

import type { TranzyShapeResponse } from '../../types/rawTranzyApi.ts';
import type { RouteShape } from '../../types/arrivalTime.ts';
import { convertToRouteShape } from './shapeUtils.ts';

/**
 * Process all shapes from bulk API response into RouteShape format
 * Groups shape points by shape_id and converts each group to RouteShape
 */
export function processAllShapes(rawShapes: TranzyShapeResponse[]): Map<string, RouteShape> {
  const shapesMap = new Map<string, RouteShape>();
  
  if (rawShapes.length === 0) {
    return shapesMap;
  }

  // Group shape points by shape_id
  const shapeGroups = new Map<string, TranzyShapeResponse[]>();
  
  for (const shapePoint of rawShapes) {
    const shapeId = shapePoint.shape_id;
    if (!shapeGroups.has(shapeId)) {
      shapeGroups.set(shapeId, []);
    }
    shapeGroups.get(shapeId)!.push(shapePoint);
  }

  // Convert each group to RouteShape format
  for (const [shapeId, shapePoints] of shapeGroups) {
    try {
      const routeShape = convertToRouteShape(shapePoints);
      shapesMap.set(shapeId, routeShape);
    } catch (error) {
      // Log error but continue processing other shapes
      console.warn(`Failed to process shape ${shapeId}:`, error);
    }
  }

  return shapesMap;
}

/**
 * Generate hash for shape data using FNV-1a algorithm
 * Only hashes the actual shape content (coordinates, distances), not timestamps or metadata
 * Processes shapes in deterministic order (sorted by shape_id) for consistent hashing
 */
export function generateShapeHash(shapes: Map<string, RouteShape>): string {
  if (shapes.size === 0) {
    return '';
  }

  // FNV-1a hash constants (32-bit)
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;

  let hash = FNV_OFFSET_BASIS;

  // Process shapes in deterministic order (sorted by shape_id)
  const sortedShapeIds = Array.from(shapes.keys()).sort();

  for (const shapeId of sortedShapeIds) {
    const shape = shapes.get(shapeId)!;
    
    // Hash shape_id
    for (let i = 0; i < shapeId.length; i++) {
      hash ^= shapeId.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME);
    }

    // Hash each point's coordinates (lat, lon)
    for (const point of shape.points) {
      // Convert coordinates to string with fixed precision to ensure consistency
      const latStr = point.lat.toFixed(6);
      const lonStr = point.lon.toFixed(6);
      
      // Hash latitude
      for (let i = 0; i < latStr.length; i++) {
        hash ^= latStr.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
      }
      
      // Hash longitude
      for (let i = 0; i < lonStr.length; i++) {
        hash ^= lonStr.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
      }
    }

    // Hash segment distances (derived data, but important for consistency)
    for (const segment of shape.segments) {
      const distanceStr = segment.distance.toFixed(3);
      for (let i = 0; i < distanceStr.length; i++) {
        hash ^= distanceStr.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
      }
    }
  }

  // Convert to unsigned 32-bit integer and then to hex string
  return (hash >>> 0).toString(16);
}

/**
 * Validate shape data for basic JSON structure and required fields
 * Returns validated shapes array, filtering out invalid entries
 * Enhanced with better error handling and partial data recovery
 */
export function validateShapeData(shapes: TranzyShapeResponse[]): TranzyShapeResponse[] {
  if (!Array.isArray(shapes)) {
    throw new Error('Shape data must be an array');
  }

  if (shapes.length === 0) {
    console.warn('Received empty shapes array from API');
    return [];
  }

  const validShapes: TranzyShapeResponse[] = [];
  let invalidCount = 0;

  for (const shape of shapes) {
    try {
      // Check required fields exist and have correct types
      if (typeof shape !== 'object' || shape === null) {
        console.warn('Invalid shape object:', shape);
        invalidCount++;
        continue;
      }

      if (typeof shape.shape_id !== 'string' || shape.shape_id.trim() === '') {
        console.warn('Invalid shape_id:', shape.shape_id);
        invalidCount++;
        continue;
      }

      if (typeof shape.shape_pt_lat !== 'number' || isNaN(shape.shape_pt_lat)) {
        console.warn('Invalid shape_pt_lat:', shape.shape_pt_lat);
        invalidCount++;
        continue;
      }

      if (typeof shape.shape_pt_lon !== 'number' || isNaN(shape.shape_pt_lon)) {
        console.warn('Invalid shape_pt_lon:', shape.shape_pt_lon);
        invalidCount++;
        continue;
      }

      if (typeof shape.shape_pt_sequence !== 'number' || isNaN(shape.shape_pt_sequence)) {
        console.warn('Invalid shape_pt_sequence:', shape.shape_pt_sequence);
        invalidCount++;
        continue;
      }

      // Validate coordinate ranges
      if (shape.shape_pt_lat < -90 || shape.shape_pt_lat > 90) {
        console.warn('Latitude out of range:', shape.shape_pt_lat);
        invalidCount++;
        continue;
      }

      if (shape.shape_pt_lon < -180 || shape.shape_pt_lon > 180) {
        console.warn('Longitude out of range:', shape.shape_pt_lon);
        invalidCount++;
        continue;
      }

      // Validate sequence is non-negative
      if (shape.shape_pt_sequence < 0) {
        console.warn('Negative sequence number:', shape.shape_pt_sequence);
        invalidCount++;
        continue;
      }

      validShapes.push(shape);
    } catch (error) {
      console.warn('Error validating shape:', error);
      invalidCount++;
      continue;
    }
  }

  // Log validation summary
  if (invalidCount > 0) {
    console.warn(`Shape validation: ${invalidCount} invalid shapes filtered out, ${validShapes.length} valid shapes retained`);
  }

  // If too many shapes are invalid, this might indicate a data format issue
  if (invalidCount > validShapes.length) {
    console.error(`High number of invalid shapes (${invalidCount} invalid vs ${validShapes.length} valid). This may indicate a data format issue.`);
  }

  return validShapes;
}