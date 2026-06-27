import { describe, it, expect } from 'vitest';
import {
  createTripRouteMapping,
  createStationRouteMapping,
  createCompleteStationRouteMapping,
  getRouteIdsForStation,
  hasRoutesForStation
} from '../../../utils/route/routeStationMapping';
import type { TranzyStopTimeResponse, TranzyVehicleResponse } from '../../../types/rawTranzyApi';

describe('routeStationMapping', () => {
  // Test data
  const mockVehicles: TranzyVehicleResponse[] = [
    {
      id: 1,
      label: 'Bus 101',
      latitude: 46.7712,
      longitude: 23.6236,
      timestamp: '2024-01-01T10:00:00Z',
      speed: 25,
      route_id: 1,
      trip_id: 'trip_1',
      vehicle_type: 3,
      bike_accessible: 'BIKE_ACCESSIBLE',
      wheelchair_accessible: 'WHEELCHAIR_ACCESSIBLE'
    },
    {
      id: 2,
      label: 'Bus 102',
      latitude: 46.7712,
      longitude: 23.6236,
      timestamp: '2024-01-01T10:00:00Z',
      speed: 30,
      route_id: 2,
      trip_id: 'trip_2',
      vehicle_type: 3,
      bike_accessible: 'BIKE_INACCESSIBLE',
      wheelchair_accessible: 'WHEELCHAIR_INACCESSIBLE'
    },
    {
      id: 3,
      label: 'Bus 103',
      latitude: 46.7712,
      longitude: 23.6236,
      timestamp: '2024-01-01T10:00:00Z',
      speed: 20,
      route_id: 1,
      trip_id: 'trip_3',
      vehicle_type: 3,
      bike_accessible: 'BIKE_ACCESSIBLE',
      wheelchair_accessible: 'WHEELCHAIR_ACCESSIBLE'
    }
  ];

  const mockStopTimes: TranzyStopTimeResponse[] = [
    { trip_id: 'trip_1', stop_id: 100, stop_sequence: 1 },
    { trip_id: 'trip_1', stop_id: 101, stop_sequence: 2 },
    { trip_id: 'trip_2', stop_id: 101, stop_sequence: 1 },
    { trip_id: 'trip_2', stop_id: 102, stop_sequence: 2 },
    { trip_id: 'trip_3', stop_id: 100, stop_sequence: 1 },
    { trip_id: 'trip_3', stop_id: 103, stop_sequence: 2 }
  ];

  describe('createTripRouteMapping', () => {
    it('should create correct trip-to-route mapping', () => {
      const result = createTripRouteMapping(mockVehicles);
      
      expect(result).toEqual({
        'trip_1': 1,
        'trip_2': 2,
        'trip_3': 1
      });
    });

    it('should handle vehicles with null route_id', () => {
      const vehiclesWithNull = [
        ...mockVehicles,
        {
          id: 4,
          label: 'Bus 104',
          latitude: 46.7712,
          longitude: 23.6236,
          timestamp: '2024-01-01T10:00:00Z',
          speed: 15,
          route_id: null,
          trip_id: 'trip_4',
          vehicle_type: 3,
          bike_accessible: 'BIKE_ACCESSIBLE',
          wheelchair_accessible: 'WHEELCHAIR_ACCESSIBLE'
        }
      ];
      
      const result = createTripRouteMapping(vehiclesWithNull);
      
      expect(result).toEqual({
        'trip_1': 1,
        'trip_2': 2,
        'trip_3': 1
      });
      expect(result['trip_4']).toBeUndefined();
    });

    it('should handle vehicles with null trip_id', () => {
      const vehiclesWithNull = [
        ...mockVehicles,
        {
          id: 5,
          label: 'Bus 105',
          latitude: 46.7712,
          longitude: 23.6236,
          timestamp: '2024-01-01T10:00:00Z',
          speed: 15,
          route_id: 3,
          trip_id: null,
          vehicle_type: 3,
          bike_accessible: 'BIKE_ACCESSIBLE',
          wheelchair_accessible: 'WHEELCHAIR_ACCESSIBLE'
        }
      ];
      
      const result = createTripRouteMapping(vehiclesWithNull);
      
      expect(result).toEqual({
        'trip_1': 1,
        'trip_2': 2,
        'trip_3': 1
      });
    });

    it('should handle empty vehicles array', () => {
      const result = createTripRouteMapping([]);
      expect(result).toEqual({});
    });

    it('should handle invalid input', () => {
      const result = createTripRouteMapping(null as any);
      expect(result).toEqual({});
    });
  });

  describe('createStationRouteMapping', () => {
    it('should create correct station-to-routes mapping', () => {
      const tripRouteMap = createTripRouteMapping(mockVehicles);
      const result = createStationRouteMapping(mockStopTimes, tripRouteMap);
      
      expect(result).toEqual({
        100: [1], // Station 100 served by route 1 (trip_1 and trip_3)
        101: [1, 2], // Station 101 served by routes 1 and 2
        102: [2], // Station 102 served by route 2
        103: [1]  // Station 103 served by route 1
      });
    });

    it('should handle stop times with unknown trip_id', () => {
      const tripRouteMap = createTripRouteMapping(mockVehicles);
      const stopTimesWithUnknown = [
        ...mockStopTimes,
        { trip_id: 'unknown_trip', stop_id: 200, stop_sequence: 1 }
      ];
      
      const result = createStationRouteMapping(stopTimesWithUnknown, tripRouteMap);
      
      expect(result[200]).toBeUndefined();
    });

    it('should handle empty stop times array', () => {
      const tripRouteMap = createTripRouteMapping(mockVehicles);
      const result = createStationRouteMapping([], tripRouteMap);
      
      expect(result).toEqual({});
    });

    it('should handle invalid input', () => {
      const result = createStationRouteMapping(null as any, {});
      expect(result).toEqual({});
    });
  });

  describe('getRouteIdsForStation', () => {
    it('should return correct route IDs for existing station', () => {
      const stationRouteMap = {
        100: [1],
        101: [1, 2],
        102: [2]
      };
      
      expect(getRouteIdsForStation(101, stationRouteMap)).toEqual([1, 2]);
      expect(getRouteIdsForStation(100, stationRouteMap)).toEqual([1]);
    });

    it('should return empty array for non-existent station', () => {
      const stationRouteMap = { 100: [1] };
      
      expect(getRouteIdsForStation(999, stationRouteMap)).toEqual([]);
    });

    it('should handle invalid input', () => {
      expect(getRouteIdsForStation(null as any, {})).toEqual([]);
      expect(getRouteIdsForStation(100, null as any)).toEqual([]);
    });
  });

  describe('hasRoutesForStation', () => {
    it('should return true for station with routes', () => {
      const stationRouteMap = { 100: [1, 2] };
      
      expect(hasRoutesForStation(100, stationRouteMap)).toBe(true);
    });

    it('should return false for station without routes', () => {
      const stationRouteMap = { 100: [1, 2] };
      
      expect(hasRoutesForStation(999, stationRouteMap)).toBe(false);
    });
  });

  describe('createCompleteStationRouteMapping', () => {
    it('should create complete mapping from raw data', () => {
      const result = createCompleteStationRouteMapping(mockStopTimes, mockVehicles);
      
      expect(result).toEqual({
        100: [1],
        101: [1, 2],
        102: [2],
        103: [1]
      });
    });

    it('should handle invalid input', () => {
      expect(createCompleteStationRouteMapping(null as any, null as any)).toEqual({});
      expect(createCompleteStationRouteMapping([], [])).toEqual({});
    });
  });
});