// Station Vehicle Utilities Tests
// Tests for arrival time sorting functionality

import { describe, it, expect } from 'vitest';
import { sortStationVehiclesByArrival } from '../../../utils/station/stationVehicleUtils';
import type { StationVehicle } from '../../../types/stationFilter';

// Mock data for testing
const createMockStationVehicle = (
  vehicleId: number, 
  arrivalTime?: { statusMessage: string; confidence: 'high' | 'medium' | 'low'; estimatedMinutes: number; calculationMethod: string }
): StationVehicle => ({
  vehicle: {
    id: vehicleId,
    label: `Vehicle ${vehicleId}`,
    latitude: 46.7712,
    longitude: 23.6236,
    speed: 25,
    timestamp: '2023-01-01T12:00:00Z',
    route_id: 1,
    trip_id: 'trip_1'
  },
  route: null,
  trip: null,
  arrivalTime
});

describe('sortStationVehiclesByArrival', () => {
  it('should sort vehicles with arrival times before vehicles without', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1), // No arrival time
      createMockStationVehicle(2, { statusMessage: 'In 5 minutes', confidence: 'high', estimatedMinutes: 5, calculationMethod: 'route_projection' }),
      createMockStationVehicle(3), // No arrival time
    ];

    const sorted = sortStationVehiclesByArrival(vehicles);
    
    expect(sorted[0].vehicle.id).toBe(2); // Vehicle with arrival time comes first
    expect(sorted[1].vehicle.id).toBe(1); // Vehicles without arrival time come after
    expect(sorted[2].vehicle.id).toBe(3);
  });

  it('should sort vehicles by estimated minutes when both have arrival times', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, { statusMessage: 'In 10 minutes', confidence: 'high', estimatedMinutes: 10, calculationMethod: 'route_projection' }),
      createMockStationVehicle(2, { statusMessage: 'In 3 minutes', confidence: 'high', estimatedMinutes: 3, calculationMethod: 'stop_segments' }),
      createMockStationVehicle(3, { statusMessage: 'In 7 minutes', confidence: 'medium', estimatedMinutes: 7, calculationMethod: 'route_projection' }),
    ];

    const sorted = sortStationVehiclesByArrival(vehicles);
    
    expect(sorted[0].vehicle.id).toBe(2); // 3 minutes
    expect(sorted[1].vehicle.id).toBe(3); // 7 minutes  
    expect(sorted[2].vehicle.id).toBe(1); // 10 minutes
  });

  it('should handle mixed scenarios with different status messages', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, { statusMessage: 'Departed', confidence: 'high', estimatedMinutes: -5, calculationMethod: 'route_projection' }),
      createMockStationVehicle(2, { statusMessage: 'At stop', confidence: 'high', estimatedMinutes: 0, calculationMethod: 'route_projection' }),
      createMockStationVehicle(3, { statusMessage: 'In 2 minutes', confidence: 'medium', estimatedMinutes: 2, calculationMethod: 'stop_segments' }),
      createMockStationVehicle(4), // No arrival time
    ];

    const sorted = sortStationVehiclesByArrival(vehicles);
    
    // Should be sorted by arrival priority: At stop, In minutes, Departed, No arrival time
    expect(sorted[0].arrivalTime?.statusMessage).toBe('At stop');
    expect(sorted[1].arrivalTime?.statusMessage).toBe('In 2 minutes');
    expect(sorted[2].arrivalTime?.statusMessage).toBe('Departed');
    expect(sorted[3].arrivalTime).toBeUndefined();
  });

  it('should maintain stable sort order for vehicles with same arrival time', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(3, { statusMessage: 'In 5 minutes', confidence: 'high', estimatedMinutes: 5, calculationMethod: 'route_projection' }),
      createMockStationVehicle(1, { statusMessage: 'In 5 minutes', confidence: 'high', estimatedMinutes: 5, calculationMethod: 'route_projection' }),
      createMockStationVehicle(2, { statusMessage: 'In 5 minutes', confidence: 'high', estimatedMinutes: 5, calculationMethod: 'route_projection' }),
    ];

    const sorted = sortStationVehiclesByArrival(vehicles);
    
    // Should maintain stable sort by vehicle ID when arrival times are equal
    expect(sorted[0].vehicle.id).toBe(1);
    expect(sorted[1].vehicle.id).toBe(2);
    expect(sorted[2].vehicle.id).toBe(3);
  });

  it('pushes drop-off-only vehicles to the end of the list', () => {
    // Vehicle 2 is "At stop" (highest priority) but drop-off-only — it must
    // appear AFTER all pickup rows. Within each partition the existing
    // arrival-priority sort still applies.
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, { statusMessage: 'In 10 minutes', confidence: 'high', estimatedMinutes: 10, calculationMethod: 'route_projection' }),
      createMockStationVehicle(2, { statusMessage: 'At stop', confidence: 'high', estimatedMinutes: 0, calculationMethod: 'route_projection' }),
      createMockStationVehicle(3, { statusMessage: 'In 3 minutes', confidence: 'high', estimatedMinutes: 3, calculationMethod: 'route_projection' }),
      createMockStationVehicle(4, { statusMessage: 'In 7 minutes', confidence: 'high', estimatedMinutes: 7, calculationMethod: 'route_projection' }),
    ];

    const sorted = sortStationVehiclesByArrival(vehicles, new Set([2, 4]));

    // Pickup partition (1, 3) sorted by ETA: 3 min then 10 min.
    // Drop-off partition (2, 4) sorted by ETA inside its own group, then appended.
    expect(sorted.map((v) => v.vehicle.id)).toEqual([3, 1, 2, 4]);
  });

  it('returns the original sort when no drop-off-only ids are supplied', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, { statusMessage: 'In 10 minutes', confidence: 'high', estimatedMinutes: 10, calculationMethod: 'route_projection' }),
      createMockStationVehicle(2, { statusMessage: 'At stop', confidence: 'high', estimatedMinutes: 0, calculationMethod: 'route_projection' }),
    ];

    expect(sortStationVehiclesByArrival(vehicles).map((v) => v.vehicle.id)).toEqual([2, 1]);
    expect(sortStationVehiclesByArrival(vehicles, new Set()).map((v) => v.vehicle.id)).toEqual([2, 1]);
  });
});