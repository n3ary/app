import { describe, it, expect } from 'vitest';
import {
  hasActiveTrips,
  validateStationsForTrips,
  getStationsWithTrips
} from '../../../utils/station/tripValidationUtils';
import type { TranzyStopResponse, TranzyStopTimeResponse } from '../../../types/rawTranzyApi';

describe('tripValidationUtils', () => {
  // Test data
  const testStations: TranzyStopResponse[] = [
    {
      stop_id: 1,
      stop_name: 'Station A',
      stop_lat: 44.4268,
      stop_lon: 26.1025,
      location_type: 0,
      stop_code: 'A001'
    },
    {
      stop_id: 2,
      stop_name: 'Station B',
      stop_lat: 44.4300,
      stop_lon: 26.1000,
      location_type: 0,
      stop_code: 'B002'
    },
    {
      stop_id: 3,
      stop_name: 'Station C',
      stop_lat: 44.4350,
      stop_lon: 26.0950,
      location_type: 0,
      stop_code: 'C003'
    }
  ];

  const testStopTimes: TranzyStopTimeResponse[] = [
    // Station 1 has 2 trips
    { trip_id: 'trip_1', stop_id: 1, stop_sequence: 1 },
    { trip_id: 'trip_2', stop_id: 1, stop_sequence: 2 },
    // Station 2 has 1 trip
    { trip_id: 'trip_1', stop_id: 2, stop_sequence: 3 },
    // Station 3 has no trips (not in stop times)
    // Additional stop time with empty trip_id (should be ignored)
    { trip_id: '', stop_id: 1, stop_sequence: 4 },
    { trip_id: '   ', stop_id: 1, stop_sequence: 5 }, // whitespace only
  ];

  describe('hasActiveTrips', () => {
    it('should return true for station with active trips', () => {
      const result = hasActiveTrips(testStations[0], testStopTimes);
      expect(result).toBe(true);
    });

    it('should return true for station with one active trip', () => {
      const result = hasActiveTrips(testStations[1], testStopTimes);
      expect(result).toBe(true);
    });

    it('should return false for station with no trips', () => {
      const result = hasActiveTrips(testStations[2], testStopTimes);
      expect(result).toBe(false);
    });

    it('should return false for empty stop times array', () => {
      const result = hasActiveTrips(testStations[0], []);
      expect(result).toBe(false);
    });

    it('should ignore stop times with empty trip_id', () => {
      const stopTimesWithEmpty: TranzyStopTimeResponse[] = [
        { trip_id: '', stop_id: 1, stop_sequence: 1 },
        { trip_id: '   ', stop_id: 1, stop_sequence: 2 }
      ];
      const result = hasActiveTrips(testStations[0], stopTimesWithEmpty);
      expect(result).toBe(false);
    });
  });


  describe('validateStationsForTrips', () => {
    it('should validate all stations and return trip status', () => {
      const result = validateStationsForTrips(testStations, testStopTimes);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        station: testStations[0],
        hasTrips: true
      });
      expect(result[1]).toEqual({
        station: testStations[1],
        hasTrips: true
      });
      expect(result[2]).toEqual({
        station: testStations[2],
        hasTrips: false
      });
    });

    it('should handle empty stations array', () => {
      const result = validateStationsForTrips([], testStopTimes);
      expect(result).toHaveLength(0);
    });

    it('should handle empty stop times array', () => {
      const result = validateStationsForTrips(testStations, []);
      
      expect(result).toHaveLength(3);
      result.forEach(item => {
        expect(item.hasTrips).toBe(false);
      });
    });
  });

  describe('getStationsWithTrips', () => {
    it('should return only stations with trips', () => {
      const result = getStationsWithTrips(testStations, testStopTimes);
      
      expect(result).toHaveLength(2);
      expect(result).toContain(testStations[0]); // Station A with trips
      expect(result).toContain(testStations[1]); // Station B with trips
      expect(result).not.toContain(testStations[2]); // Station C without trips
    });

    it('should return empty array when no stations have trips', () => {
      const result = getStationsWithTrips(testStations, []);
      expect(result).toHaveLength(0);
    });

    it('should handle empty stations array', () => {
      const result = getStationsWithTrips([], testStopTimes);
      expect(result).toHaveLength(0);
    });
  });
});