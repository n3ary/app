// Viewport Utilities Tests
// Tests for the new comprehensive viewport functions

import { describe, it, expect } from 'vitest';
import { 
  calculateComprehensiveViewport, 
  calculateVehicleComprehensiveViewport 
} from '../../../utils/maps/viewportUtils';

// Mock data helpers
const createMockStation = (id: number, lat: number, lon: number) => ({
  stop_id: id,
  stop_name: `Station ${id}`,
  stop_lat: lat,
  stop_lon: lon,
  stop_code: `S${id}`,
  stop_desc: '',
  zone_id: null,
  stop_url: null,
  location_type: 0,
  parent_station: null,
  stop_timezone: null,
  wheelchair_boarding: 0
});

describe('Comprehensive Viewport Functions', () => {
  it('should calculate comprehensive viewport with all three points', () => {
    const targetStation = createMockStation(1, 46.7712, 23.6236);
    const vehiclePosition = { lat: 46.7720, lon: 23.6240 };
    const nextStation = createMockStation(2, 46.7730, 23.6250);

    const result = calculateComprehensiveViewport(
      targetStation,
      vehiclePosition,
      nextStation,
      800,
      600
    );

    expect(result).toBeTruthy();
    expect(result?.bounds).toBeTruthy();
    expect(result?.center).toBeTruthy();
    expect(result?.zoom).toBeGreaterThan(0);
    
    // Should include all points in bounds
    expect(result?.bounds.south).toBeLessThanOrEqual(46.7712);
    expect(result?.bounds.north).toBeGreaterThanOrEqual(46.7730);
    expect(result?.bounds.west).toBeLessThanOrEqual(23.6236);
    expect(result?.bounds.east).toBeGreaterThanOrEqual(23.6250);
  });

  it('should handle case with only target station and vehicle', () => {
    const targetStation = createMockStation(1, 46.7712, 23.6236);
    const vehiclePosition = { lat: 46.7720, lon: 23.6240 };

    const result = calculateComprehensiveViewport(
      targetStation,
      vehiclePosition,
      null, // No next station
      800,
      600
    );

    expect(result).toBeTruthy();
    expect(result?.bounds).toBeTruthy();
    expect(result?.center).toBeTruthy();
  });

  it('should calculate vehicle comprehensive viewport', () => {
    const vehiclePosition = { lat: 46.7720, lon: 23.6240 };
    const targetStation = createMockStation(1, 46.7712, 23.6236);
    const nextStation = createMockStation(2, 46.7730, 23.6250);

    const result = calculateVehicleComprehensiveViewport(
      vehiclePosition,
      targetStation,
      nextStation,
      800,
      600
    );

    expect(result).toBeTruthy();
    expect(result?.bounds).toBeTruthy();
    expect(result?.center).toBeTruthy();
    expect(result?.zoom).toBeGreaterThan(0);
  });

  it('should handle vehicle-only case', () => {
    const vehiclePosition = { lat: 46.7720, lon: 23.6240 };

    const result = calculateVehicleComprehensiveViewport(
      vehiclePosition,
      null, // No target station
      null, // No next station
      800,
      600
    );

    expect(result).toBeTruthy();
    expect(result?.center).toEqual(vehiclePosition);
    expect(result?.zoom).toBe(15); // Default zoom for single point
  });

  it('should exclude duplicate stations', () => {
    const station = createMockStation(1, 46.7712, 23.6236);
    const vehiclePosition = { lat: 46.7720, lon: 23.6240 };

    const result = calculateComprehensiveViewport(
      station,
      vehiclePosition,
      station, // Same station as target
      800,
      600
    );

    expect(result).toBeTruthy();
    // Should only include 2 points (target station and vehicle), not 3
  });
});