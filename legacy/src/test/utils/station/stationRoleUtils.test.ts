/**
 * Tests for Station Role Utilities
 */

import { describe, it, expect } from 'vitest';
import { shouldShowStationDropOffIndicator } from '../../../utils/station/stationRoleUtils';
import type { TranzyStopTimeResponse } from '../../../types/rawTranzyApi';

describe('shouldShowStationDropOffIndicator', () => {
  const mockStopTimes: TranzyStopTimeResponse[] = [
    { trip_id: 'T1', stop_id: 100, stop_sequence: 0 },
    { trip_id: 'T1', stop_id: 101, stop_sequence: 1 },
    { trip_id: 'T1', stop_id: 102, stop_sequence: 2 },
    { trip_id: 'T2', stop_id: 100, stop_sequence: 0 },
    { trip_id: 'T2', stop_id: 101, stop_sequence: 1 },
    { trip_id: 'T2', stop_id: 102, stop_sequence: 2 },
  ];

  it('should return false when vehicles array is empty', () => {
    const result = shouldShowStationDropOffIndicator([], 102, mockStopTimes);
    expect(result).toBe(false);
  });

  it('should return true when all vehicles end at the station', () => {
    const vehicles = [
      { vehicle: { trip_id: 'T1' }, route: {}, trip: {} },
      { vehicle: { trip_id: 'T2' }, route: {}, trip: {} },
    ];
    
    const result = shouldShowStationDropOffIndicator(vehicles, 102, mockStopTimes);
    expect(result).toBe(true);
  });

  it('should return false when at least one vehicle allows boarding', () => {
    const vehicles = [
      { vehicle: { trip_id: 'T1' }, route: {}, trip: {} }, // Ends at 102
      { vehicle: { trip_id: 'T2' }, route: {}, trip: {} }, // Ends at 102
    ];
    
    // Check station 101 - neither trip ends here
    const result = shouldShowStationDropOffIndicator(vehicles, 101, mockStopTimes);
    expect(result).toBe(false);
  });

  it('should return false when vehicle has no trip_id', () => {
    const vehicles = [
      { vehicle: { trip_id: undefined }, route: {}, trip: {} },
    ];
    
    const result = shouldShowStationDropOffIndicator(vehicles, 102, mockStopTimes);
    expect(result).toBe(false);
  });

  it('should handle mixed vehicles with and without trip_id', () => {
    const vehicles = [
      { vehicle: { trip_id: 'T1' }, route: {}, trip: {} }, // Ends at 102
      { vehicle: { trip_id: undefined }, route: {}, trip: {} }, // No trip_id
    ];
    
    // Should return false because one vehicle has no trip_id (allows boarding)
    const result = shouldShowStationDropOffIndicator(vehicles, 102, mockStopTimes);
    expect(result).toBe(false);
  });
});
