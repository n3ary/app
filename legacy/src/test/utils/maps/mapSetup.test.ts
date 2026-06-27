/**
 * Map Setup Tests
 * Verify map dependencies and configuration are properly set up
 */

import { describe, it, expect } from 'vitest';
import { MAP_DEFAULTS, validateCoordinates, getOptimalPerformanceConfig } from '../../../utils/maps/mapConstants';
import { createVehicleIcon, createStationIcon } from '../../../utils/maps/iconUtils';

describe('Map Dependencies and Configuration', () => {
  it('should have valid map defaults', () => {
    expect(MAP_DEFAULTS.CENTER.lat).toBeCloseTo(46.7712, 4);
    expect(MAP_DEFAULTS.CENTER.lon).toBeCloseTo(23.6236, 4);
    expect(MAP_DEFAULTS.ZOOM).toBe(13);
    expect(MAP_DEFAULTS.MIN_ZOOM).toBe(10);
    expect(MAP_DEFAULTS.MAX_ZOOM).toBe(18);
    expect(MAP_DEFAULTS.TILE_URL).toContain('openstreetmap.org');
    expect(MAP_DEFAULTS.ATTRIBUTION).toContain('OpenStreetMap');
  });

  it('should validate coordinates correctly', () => {
    // Valid coordinates
    expect(validateCoordinates({ lat: 46.7712, lon: 23.6236 })).toBe(true);
    expect(validateCoordinates({ lat: 0, lon: 0 })).toBe(true);
    expect(validateCoordinates({ lat: -90, lon: -180 })).toBe(true);
    expect(validateCoordinates({ lat: 90, lon: 180 })).toBe(true);

    // Invalid coordinates
    expect(validateCoordinates({ lat: 91, lon: 0 })).toBe(false);
    expect(validateCoordinates({ lat: -91, lon: 0 })).toBe(false);
    expect(validateCoordinates({ lat: 0, lon: 181 })).toBe(false);
    expect(validateCoordinates({ lat: 0, lon: -181 })).toBe(false);
    expect(validateCoordinates({ lat: NaN, lon: 0 })).toBe(false);
    expect(validateCoordinates({ lat: 0, lon: NaN })).toBe(false);
  });

  it('should get optimal performance config', () => {
    const config = getOptimalPerformanceConfig();
    expect(config).toHaveProperty('maxVehicleMarkers');
    expect(config).toHaveProperty('maxRouteShapes');
    expect(config).toHaveProperty('clusteringThreshold');
    expect(config).toHaveProperty('updateThrottleMs');
    expect(config).toHaveProperty('renderDistance');
    
    expect(typeof config.maxVehicleMarkers).toBe('number');
    expect(config.maxVehicleMarkers).toBeGreaterThan(0);
  });

  it('should create vehicle icons', () => {
    const icon = createVehicleIcon({ color: '#FF0000' });
    expect(icon).toBeDefined();
    expect(icon.options.iconUrl).toContain('data:image/svg+xml');
  });

  it('should create station icons', () => {
    const icon = createStationIcon({ color: '#00FF00' });
    expect(icon).toBeDefined();
    expect(icon.options.iconUrl).toContain('data:image/svg+xml');
  });

  it('should create different station symbol types', () => {
    const defaultIcon = createStationIcon({ color: '#000000', symbolType: 'default' });
    const userLocationIcon = createStationIcon({ color: '#000000', symbolType: 'user-location' });
    const terminusIcon = createStationIcon({ color: '#000000', symbolType: 'terminus' });
    const nearbyIcon = createStationIcon({ color: '#000000', symbolType: 'nearby' });

    expect(defaultIcon.options.iconUrl).toBeDefined();
    expect(userLocationIcon.options.iconUrl).toBeDefined();
    expect(terminusIcon.options.iconUrl).toBeDefined();
    expect(nearbyIcon.options.iconUrl).toBeDefined();

    // Icons should be different for different types
    expect(defaultIcon.options.iconUrl).not.toBe(userLocationIcon.options.iconUrl);
    expect(terminusIcon.options.iconUrl).not.toBe(nearbyIcon.options.iconUrl);
  });
});