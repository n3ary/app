// API Freshness Monitor - Event-based staleness checking for UI updates
// Eliminates periodic timers, checks staleness on refresh triggers and view changes
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5

import { useVehicleStore } from '../../stores/vehicleStore';
import { useStationStore } from '../../stores/stationStore';
import { useRouteStore } from '../../stores/routeStore';
import { useShapeStore } from '../../stores/shapeStore';
import { useStopTimeStore } from '../../stores/stopTimeStore';
import { useTripStore } from '../../stores/tripStore';
import { manualRefreshService } from '../../services/manualRefreshService';
import { AUTO_REFRESH_CYCLE, API_DATA_STALENESS_THRESHOLDS } from './constants';

/**
 * Interface for store timestamps read from all stores
 */
export interface StoreTimestamps {
  vehicles: number | null;
  stations: number | null;
  routes: number | null;
  shapes: number | null;
  stopTimes: number | null;
  trips: number | null;
}

/**
 * API freshness status interface
 */
export interface ApiFreshnessStatus {
  status: 'fresh' | 'stale';
  vehicleApiAge: number;
  staticApiAge: number;
  isRefreshing: boolean;
  nextAutoRefreshIn: number; // seconds until next auto-refresh
  lastApiFetchTime: number | null;
}

/**
 * Event-based API Freshness Monitor
 * No periodic timers - checks staleness on demand and via events
 */
export class ApiFreshnessMonitor {
  private subscribers: Set<(status: ApiFreshnessStatus) => void> = new Set();
  private unsubscribeFunctions: (() => void)[] = [];
  private lastVehicleApiFetch: number = Date.now();

  constructor() {
    this.setupStoreSubscriptions();
    // No periodic timer - event-based only
  }

  /**
   * Read timestamps from all stores
   * Requirement 3.1: Monitor SHALL read timestamps from store data
   */
  private readStoreTimestamps(): StoreTimestamps {
    return {
      vehicles: useVehicleStore.getState().lastUpdated,
      stations: useStationStore.getState().lastUpdated,
      routes: useRouteStore.getState().lastUpdated,
      shapes: useShapeStore.getState().lastUpdated,
      stopTimes: useStopTimeStore.getState().lastUpdated,
      trips: useTripStore.getState().lastUpdated,
    };
  }

  /**
   * Calculate API freshness status based on defined thresholds
   * Requirements 3.2, 3.3: Calculate staleness based on 5min/24hr thresholds
   */
  calculateApiFreshness(): ApiFreshnessStatus {
    const timestamps = this.readStoreTimestamps();
    const now = Date.now();

    // Calculate vehicle data age (most critical)
    const vehicleAge = timestamps.vehicles ? now - timestamps.vehicles : Infinity;
    const hasVehicleData = timestamps.vehicles !== null;
    const isVehicleDataStale = hasVehicleData && vehicleAge > API_DATA_STALENESS_THRESHOLDS.VEHICLES;

    // Calculate static data age (stations, routes, shapes, stopTimes, trips)
    const staticDataAges = [
      timestamps.stations ? now - timestamps.stations : Infinity,
      timestamps.routes ? now - timestamps.routes : Infinity,
      timestamps.shapes ? now - timestamps.shapes : Infinity,
      timestamps.stopTimes ? now - timestamps.stopTimes : Infinity,
      timestamps.trips ? now - timestamps.trips : Infinity,
    ];

    const maxStaticDataAge = Math.max(...staticDataAges);
    const hasStaticData = staticDataAges.some(age => age !== Infinity);
    const isStaticDataStale = hasStaticData && maxStaticDataAge > API_DATA_STALENESS_THRESHOLDS.STATIC_DATA;

    // Overall status logic:
    // - If no data exists at all (both Infinity), status is 'fresh' (empty/grey state)
    // - If data exists but is stale, status is 'stale' (red state)
    // - If data exists and is fresh, status is 'fresh' (green state)
    const hasAnyData = hasVehicleData || hasStaticData;
    const status = hasAnyData && (isVehicleDataStale || isStaticDataStale) ? 'stale' : 'fresh';

    // Check if any store is currently refreshing
    const isRefreshing = this.isAnyStoreRefreshing();

    // Calculate next vehicle refresh countdown
    const timeSinceLastVehicleApiFetch = now - this.lastVehicleApiFetch;
    const nextAutoRefreshIn = Math.max(0, 
      Math.ceil((AUTO_REFRESH_CYCLE - timeSinceLastVehicleApiFetch) / 1000)
    );

    return {
      status,
      vehicleApiAge: vehicleAge,
      staticApiAge: maxStaticDataAge,
      isRefreshing,
      nextAutoRefreshIn,
      lastApiFetchTime: timestamps.vehicles,
    };
  }

  /**
   * Check if any store is currently refreshing
   * Now checks the manual refresh service which handles both manual and automatic refreshes
   */
  private isAnyStoreRefreshing(): boolean {
    // Check manual refresh service state
    return manualRefreshService.isRefreshInProgress();
  }

  /**
   * Subscribe to changes in API freshness status
   * Requirement 3.4: Monitor SHALL update button color when data changes
   */
  subscribeToChanges(callback: (status: ApiFreshnessStatus) => void): () => void {
    this.subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of status changes
   */
  private notifySubscribers(): void {
    const status = this.calculateApiFreshness();
    this.subscribers.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.warn('Error in freshness monitor subscriber:', error);
      }
    });
  }

  /**
   * Manually trigger staleness check
   * Called on refresh triggers and view changes
   */
  checkStaleness(): void {
    this.notifySubscribers();
  }

  /**
   * Update last vehicle API fetch time
   * Called when vehicle refresh completes
   */
  updateVehicleApiFetchTime(): void {
    this.lastVehicleApiFetch = Date.now();
    this.notifySubscribers();
  }

  /**
   * Setup reactive subscriptions to all stores
   * Requirement 3.4: React to store changes for immediate updates
   */
  private setupStoreSubscriptions(): void {
    // Subscribe to vehicle store changes
    const unsubVehicles = useVehicleStore.subscribe((state, prevState) => {
      if (state.lastUpdated !== prevState.lastUpdated) {
        this.updateVehicleApiFetchTime();
      }
    });

    // Subscribe to other stores for lastUpdated changes
    const unsubStations = useStationStore.subscribe((state, prevState) => {
      if (state.lastUpdated !== prevState.lastUpdated) {
        this.notifySubscribers();
      }
    });

    const unsubRoutes = useRouteStore.subscribe((state, prevState) => {
      if (state.lastUpdated !== prevState.lastUpdated) {
        this.notifySubscribers();
      }
    });

    const unsubShapes = useShapeStore.subscribe((state, prevState) => {
      if (state.lastUpdated !== prevState.lastUpdated) {
        this.notifySubscribers();
      }
    });

    const unsubStopTimes = useStopTimeStore.subscribe((state, prevState) => {
      if (state.lastUpdated !== prevState.lastUpdated) {
        this.notifySubscribers();
      }
    });

    const unsubTrips = useTripStore.subscribe((state, prevState) => {
      if (state.lastUpdated !== prevState.lastUpdated) {
        this.notifySubscribers();
      }
    });

    // Store unsubscribe functions for cleanup
    this.unsubscribeFunctions = [
      unsubVehicles,
      unsubStations,
      unsubRoutes,
      unsubShapes,
      unsubStopTimes,
      unsubTrips,
    ];
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    // Unsubscribe from all stores
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];

    // Clear subscribers
    this.subscribers.clear();
  }
}

/**
 * Singleton instance for global use
 * This ensures consistent monitoring across the application
 */
let globalMonitorInstance: ApiFreshnessMonitor | null = null;

/**
 * Get or create the global API freshness monitor instance
 */
export function getDataFreshnessMonitor(): ApiFreshnessMonitor {
  if (!globalMonitorInstance) {
    globalMonitorInstance = new ApiFreshnessMonitor();
  }
  return globalMonitorInstance;
}

/**
 * Cleanup the global monitor instance (for testing or app shutdown)
 */
export function destroyDataFreshnessMonitor(): void {
  if (globalMonitorInstance) {
    globalMonitorInstance.destroy();
    globalMonitorInstance = null;
  }
}