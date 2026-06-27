/**
 * Station Role Store Tests
 * 
 * Basic tests to verify store functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStationRoleStore } from '../../stores/stationRoleStore';
import { useTripStore } from '../../stores/tripStore';
import { useStopTimeStore } from '../../stores/stopTimeStore';

describe('StationRoleStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStationRoleStore.setState({
      stationRoles: new Map(),
      lastCalculated: null,
      loading: false,
      error: null
    });
  });

  it('should initialize with empty state', () => {
    const state = useStationRoleStore.getState();
    
    expect(state.stationRoles.size).toBe(0);
    expect(state.lastCalculated).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should return "standard" for unknown route/station', () => {
    const role = useStationRoleStore.getState().getStationRole(999, 888);
    expect(role).toBe('standard');
  });

  it('should invalidate cache and reset state', async () => {
    // Mock empty trip data to prevent actual calculation
    useTripStore.setState({ trips: [] });
    useStopTimeStore.setState({ stopTimes: [] });
    
    // Set some initial state
    useStationRoleStore.setState({
      stationRoles: new Map([[35, new Map([[100, 'start']])]]),
      lastCalculated: Date.now() - 1000,
      error: null
    });
    
    const oldTimestamp = useStationRoleStore.getState().lastCalculated;
    
    // Invalidate cache (this will trigger recalculation)
    useStationRoleStore.getState().invalidateCache();
    
    // Wait for async calculation to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Check that state was reset
    const state = useStationRoleStore.getState();
    expect(state.stationRoles.size).toBe(0);
    // lastCalculated will be set by the recalculation attempt
    expect(state.lastCalculated).not.toBe(oldTimestamp);
  });

  it('should check data freshness correctly', () => {
    const store = useStationRoleStore.getState();
    
    // No data calculated yet
    expect(store.isDataFresh()).toBe(false);
    
    // Set recent calculation time
    useStationRoleStore.setState({
      lastCalculated: Date.now()
    });
    expect(store.isDataFresh()).toBe(true);
    
    // Set old calculation time (25 hours ago)
    useStationRoleStore.setState({
      lastCalculated: Date.now() - (25 * 60 * 60 * 1000)
    });
    expect(store.isDataFresh()).toBe(false);
  });

  it('should handle missing trip data gracefully', async () => {
    // Mock empty trip data
    useTripStore.setState({ trips: [] });
    useStopTimeStore.setState({ stopTimes: [] });
    
    await useStationRoleStore.getState().calculateStationRoles();
    
    const state = useStationRoleStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBeTruthy();
  });

  it('should store and retrieve station roles', () => {
    // Manually set some roles
    const testRoles = new Map<number, Map<number, 'start' | 'end' | 'turnaround' | 'standard'>>();
    testRoles.set(35, new Map([
      [100, 'start'],
      [101, 'standard'],
      [102, 'end']
    ]));
    
    useStationRoleStore.setState({
      stationRoles: testRoles,
      lastCalculated: Date.now()
    });
    
    // Retrieve roles
    const store = useStationRoleStore.getState();
    expect(store.getStationRole(35, 100)).toBe('start');
    expect(store.getStationRole(35, 101)).toBe('standard');
    expect(store.getStationRole(35, 102)).toBe('end');
    expect(store.getStationRole(35, 999)).toBe('standard'); // Unknown station
  });
});
