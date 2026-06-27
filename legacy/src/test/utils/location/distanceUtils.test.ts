import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  filterByDistance,
  sortByDistance,
  type Coordinates,
  type LocationWithCoordinates
} from '../../../utils/location/distanceUtils';

describe('distanceUtils', () => {
  // Test coordinates (Bucharest and example city)
  const bucharest: Coordinates = { lat: 44.4268, lon: 26.1025 };
  const exampleCity: Coordinates = { lat: 46.7712, lon: 23.6236 };
  const sameLocation: Coordinates = { lat: 44.4268, lon: 26.1025 };

  describe('calculateDistance', () => {
    it('should return 0 for identical coordinates', () => {
      const distance = calculateDistance(bucharest, sameLocation);
      expect(distance).toBe(0);
    });

    it('should calculate distance between Bucharest and example city', () => {
      const distance = calculateDistance(bucharest, exampleCity);
      // Expected distance is approximately 328km
      expect(distance).toBeGreaterThan(320000);
      expect(distance).toBeLessThan(340000);
    });

    it('should throw error for invalid coordinates', () => {
      const invalidCoords = { lat: 91, lon: 181 }; // Out of valid range
      expect(() => calculateDistance(bucharest, invalidCoords)).toThrow('Invalid coordinates provided');
    });

    it('should handle NaN coordinates', () => {
      const nanCoords = { lat: NaN, lon: 26.1025 };
      expect(() => calculateDistance(bucharest, nanCoords)).toThrow('Invalid coordinates provided');
    });
  });

  describe('filterByDistance', () => {
    const locations: LocationWithCoordinates[] = [
      { lat: 44.4268, lon: 26.1025 }, // Bucharest
      { lat: 46.7712, lon: 23.6236 }, // Example city
      { lat: 44.4300, lon: 26.1000 }, // Near Bucharest
    ];

    it('should filter locations within specified distance', () => {
      const filtered = filterByDistance(locations, bucharest, 5000); // 5km radius
      expect(filtered).toHaveLength(2); // Bucharest and near Bucharest
    });

    it('should return all items for invalid center coordinates', () => {
      const invalidCenter = { lat: 91, lon: 181 };
      const filtered = filterByDistance(locations, invalidCenter, 1000);
      expect(filtered).toHaveLength(locations.length);
    });

    it('should return all items for negative distance', () => {
      const filtered = filterByDistance(locations, bucharest, -100);
      expect(filtered).toHaveLength(locations.length);
    });
  });

  describe('sortByDistance', () => {
    const locations: LocationWithCoordinates[] = [
      { lat: 46.7712, lon: 23.6236 }, // Example city (far)
      { lat: 44.4300, lon: 26.1000 }, // Near Bucharest (close)
      { lat: 44.4268, lon: 26.1025 }, // Bucharest (closest)
    ];

    it('should sort locations by distance from center', () => {
      const sorted = sortByDistance(locations, bucharest);
      expect(sorted[0]).toEqual({ lat: 44.4268, lon: 26.1025 }); // Bucharest first
      expect(sorted[2]).toEqual({ lat: 46.7712, lon: 23.6236 }); // Example city last
    });

    it('should return original array for invalid center', () => {
      const invalidCenter = { lat: NaN, lon: 26.1025 };
      const sorted = sortByDistance(locations, invalidCenter);
      expect(sorted).toEqual(locations);
    });
  });
});