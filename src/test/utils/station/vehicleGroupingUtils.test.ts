// Vehicle Grouping Utilities Tests
// Tests for the new status-priority grouping with route diversity

import { describe, it, expect } from 'vitest';
import { groupVehiclesForDisplay } from '../../../utils/station/vehicleGroupingUtils';
import type { StationVehicle } from '../../../types/stationFilter';

// Mock data helper
const createMockStationVehicle = (
  vehicleId: number,
  routeId: number,
  tripId: string,
  statusMessage: string,
  estimatedMinutes: number
): StationVehicle => ({
  vehicle: {
    id: vehicleId,
    label: `Vehicle ${vehicleId}`,
    route_id: routeId,
    latitude: 46.7712,
    longitude: 23.6236,
    timestamp: new Date().toISOString(),
    speed: 25,
    bearing: 180,
    trip_id: tripId,
    wheelchair_accessible: 1,
    bike_accessible: 0
  },
  route: {
    route_id: routeId,
    route_short_name: `R${routeId}`,
    route_long_name: `Route ${routeId}`,
    route_type: 3,
    route_color: '000000',
    route_text_color: 'FFFFFF'
  },
  trip: {
    trip_id: tripId,
    trip_headsign: `Trip ${tripId}`,
    route_id: routeId,
    service_id: 'service1',
    shape_id: 'shape1',
    direction_id: 0
  },
  arrivalTime: {
    statusMessage,
    confidence: 'high' as const,
    estimatedMinutes
  }
});

describe('groupVehiclesForDisplay', () => {
  it('should show all vehicles when under threshold', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, 1, 'trip1', 'In 5 minutes', 5),
      createMockStationVehicle(2, 2, 'trip2', 'In 3 minutes', 3)
    ];

    const result = groupVehiclesForDisplay(vehicles, {
      maxVehicles: 5,
      routeCount: 2
    });

    expect(result.displayed).toHaveLength(2);
    expect(result.hidden).toHaveLength(0);
    expect(result.groupingApplied).toBe(false);
  });

  // Remove debug console.log
  it('should prioritize status order: at_stop → in_minutes → departed', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, 1, 'trip1', 'Departed 2 minutes ago', 999), // Trip 1 - departed
      createMockStationVehicle(2, 2, 'trip2', 'In 1 minute', 1),              // Trip 2 - arriving
      createMockStationVehicle(3, 3, 'trip3', 'At stop', 0),                  // Trip 3 - at stop
      createMockStationVehicle(4, 4, 'trip4', 'Departed 5 minutes ago', 999), // Trip 4 - departed
      createMockStationVehicle(5, 5, 'trip5', 'In 3 minutes', 3),             // Trip 5 - arriving
      createMockStationVehicle(6, 6, 'trip6', 'In 2 minutes', 2)              // Trip 6 - arriving (6 vehicles > 5 max)
    ];

    const result = groupVehiclesForDisplay(vehicles, {
      maxVehicles: 5,
      routeCount: 6 // More than 1 route and vehicles > maxVehicles
    });

    expect(result.displayed).toHaveLength(5);
    expect(result.groupingApplied).toBe(true);
    
    // Check order: at_stop first, then in_minutes (sorted by time), then departed
    expect(result.displayed[0].arrivalTime?.statusMessage).toBe('At stop');
    expect(result.displayed[1].arrivalTime?.statusMessage).toBe('In 1 minute');
    expect(result.displayed[2].arrivalTime?.statusMessage).toBe('In 2 minutes');
    expect(result.displayed[3].arrivalTime?.statusMessage).toBe('In 3 minutes');
    expect(result.displayed[4].arrivalTime?.statusMessage).toBe('Departed 2 minutes ago');
  });

  it('should apply trip diversity within status groups', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, 1, 'trip1', 'In 1 minute', 1),   // Trip 1 - arriving
      createMockStationVehicle(2, 1, 'trip1', 'In 3 minutes', 3),  // Trip 1 - arriving (should be hidden - duplicate trip)
      createMockStationVehicle(3, 2, 'trip2', 'In 2 minutes', 2),  // Trip 2 - arriving
      createMockStationVehicle(4, 3, 'trip3', 'In 5 minutes', 5),  // Trip 3 - arriving
      createMockStationVehicle(5, 4, 'trip4', 'In 4 minutes', 4),  // Trip 4 - arriving
      createMockStationVehicle(6, 5, 'trip5', 'In 6 minutes', 6)   // Trip 5 - arriving (6 vehicles > 3 max)
    ];

    const result = groupVehiclesForDisplay(vehicles, {
      maxVehicles: 3,
      routeCount: 5
    });

    expect(result.displayed).toHaveLength(3); // Limited by maxVehicles
    expect(result.hidden).toHaveLength(3);    // Remaining vehicles hidden
    
    // Should show vehicles from different trips, prioritizing earliest arrivals
    const displayedTrips = result.displayed.map(v => v.trip?.trip_id);
    expect(displayedTrips).toEqual(['trip1', 'trip2', 'trip4']); // Trips with earliest arrivals
    
    // Vehicle 2 (Trip 1, 3 minutes) should be hidden in favor of Vehicle 1 (Trip 1, 1 minute)
    expect(result.hidden.some(v => v.vehicle.id === 2)).toBe(true);
  });

  it('should never show arriving vehicles after departed vehicles', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, 1, 'trip1', 'Departed 1 minute ago', 999), // Trip 1 - departed
      createMockStationVehicle(2, 2, 'trip2', 'In 1 minute', 1),            // Trip 2 - arriving (should come before departed)
      createMockStationVehicle(3, 3, 'trip3', 'Departed 3 minutes ago', 999), // Trip 3 - departed
      createMockStationVehicle(4, 4, 'trip4', 'In 2 minutes', 2),           // Trip 4 - arriving
      createMockStationVehicle(5, 5, 'trip5', 'In 3 minutes', 3),           // Trip 5 - arriving
      createMockStationVehicle(6, 6, 'trip6', 'Departed 5 minutes ago', 999) // Trip 6 - departed (6 vehicles > 3 max)
    ];

    const result = groupVehiclesForDisplay(vehicles, {
      maxVehicles: 3,
      routeCount: 6
    });

    // Check that all arriving vehicles come before any departed vehicle
    const statusOrder = result.displayed.map(v => v.arrivalTime?.statusMessage);
    
    // Find indices of arriving and departed vehicles
    const arrivingIndices = statusOrder
      .map((status, index) => status?.includes('minute') && !status?.includes('Departed') ? index : -1)
      .filter(index => index !== -1);
    const departedIndices = statusOrder
      .map((status, index) => status?.includes('Departed') ? index : -1)
      .filter(index => index !== -1);
    
    // If both types exist, all arriving should come before all departed
    if (arrivingIndices.length > 0 && departedIndices.length > 0) {
      const lastArrivingIndex = Math.max(...arrivingIndices);
      const firstDepartedIndex = Math.min(...departedIndices);
      expect(lastArrivingIndex).toBeLessThan(firstDepartedIndex);
    }
  });

  it('should respect maxVehicles limit', () => {
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, 1, 'trip1', 'At stop', 0),
      createMockStationVehicle(2, 2, 'trip2', 'In 1 minute', 1),
      createMockStationVehicle(3, 3, 'trip3', 'In 2 minutes', 2),
      createMockStationVehicle(4, 4, 'trip4', 'In 3 minutes', 3),
      createMockStationVehicle(5, 5, 'trip5', 'In 4 minutes', 4),
      createMockStationVehicle(6, 6, 'trip6', 'Departed 1 minute ago', 999)
    ];

    const result = groupVehiclesForDisplay(vehicles, {
      maxVehicles: 3, // Limit to 3 vehicles
      routeCount: 6
    });

    expect(result.displayed).toHaveLength(3);
    expect(result.hidden).toHaveLength(3);
    expect(result.groupingApplied).toBe(true);
    
    // Should show highest priority vehicles (at_stop + earliest arriving)
    expect(result.displayed[0].arrivalTime?.statusMessage).toBe('At stop');
    expect(result.displayed[1].arrivalTime?.statusMessage).toBe('In 1 minute');
    expect(result.displayed[2].arrivalTime?.statusMessage).toBe('In 2 minutes');
  });

  it('demotes drop-off-only vehicles below all pickup rows in display order', () => {
    // Vehicles 1 + 3 are drop-off-only (terminate here). Even though vehicle 1
    // is "At stop" — the highest-priority status — it must come AFTER every
    // pickup row in the displayed list.
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, 1, 'trip1', 'At stop', 0),
      createMockStationVehicle(2, 2, 'trip2', 'In 5 minutes', 5),
      createMockStationVehicle(3, 3, 'trip3', 'In 1 minute', 1),
      createMockStationVehicle(4, 4, 'trip4', 'In 3 minutes', 3),
      createMockStationVehicle(5, 5, 'trip5', 'In 4 minutes', 4),
      createMockStationVehicle(6, 6, 'trip6', 'In 6 minutes', 6),
    ];

    const result = groupVehiclesForDisplay(vehicles, {
      maxVehicles: 5,
      routeCount: 6,
      dropOffOnlyIds: new Set([1, 3]),
    });

    expect(result.groupingApplied).toBe(true);
    expect(result.displayed).toHaveLength(5);

    // Pickup vehicles (2, 4, 5, 6) take the first 4 slots, sorted by ETA. The
    // drop-off-only partition then fills the leftover slot — within drop-off
    // status priority still applies, so the at-stop vehicle 1 wins over the
    // in_minutes vehicle 3.
    const displayedIds = result.displayed.map((v) => v.vehicle.id);
    expect(displayedIds.slice(0, 4)).toEqual([4, 5, 2, 6]);
    expect(displayedIds[4]).toBe(1);

    // Vehicle 3 is hidden (the second drop-off-only didn't fit).
    expect(result.hidden.some((v) => v.vehicle.id === 3)).toBe(true);
  });

  it('drop-off-only rows still order pickup-then-dropoff in the hidden list', () => {
    // 1 pickup that doesn't fit + 2 drop-off-only rows. Hidden order must keep
    // pickup before drop-off so "More N vehicles" reveals more useful rows
    // first.
    const vehicles: StationVehicle[] = [
      createMockStationVehicle(1, 1, 'trip1', 'In 1 minute', 1),
      createMockStationVehicle(2, 2, 'trip2', 'In 2 minutes', 2),
      createMockStationVehicle(3, 3, 'trip3', 'In 3 minutes', 3),
      createMockStationVehicle(4, 4, 'trip4', 'In 4 minutes', 4),
      createMockStationVehicle(5, 5, 'trip5', 'In 5 minutes', 5), // hidden pickup
      createMockStationVehicle(6, 6, 'trip6', 'In 6 minutes', 6), // drop-off, hidden
      createMockStationVehicle(7, 7, 'trip7', 'In 7 minutes', 7), // drop-off, hidden
    ];

    const result = groupVehiclesForDisplay(vehicles, {
      maxVehicles: 4,
      routeCount: 7,
      dropOffOnlyIds: new Set([6, 7]),
    });

    const hiddenIds = result.hidden.map((v) => v.vehicle.id);
    // Pickup (5) comes before drop-off (6, 7) in the hidden list.
    expect(hiddenIds.indexOf(5)).toBeLessThan(hiddenIds.indexOf(6));
    expect(hiddenIds.indexOf(5)).toBeLessThan(hiddenIds.indexOf(7));
  });
});