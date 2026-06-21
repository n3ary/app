/**
 * Vehicle Grouping Utilities
 * Functions for optimizing vehicle display in station lists
 */

import { VEHICLE_DISPLAY } from '../core/constants';
import type { StationVehicle } from '../../types/stationFilter';
import type { ArrivalStatus } from '../../types/arrivalTime';

/**
 * Result of vehicle grouping operation
 */
export interface GroupedVehicles {
  displayed: StationVehicle[];
  hidden: StationVehicle[];
  groupingApplied: boolean;
}

/**
 * Options for vehicle grouping
 */
export interface VehicleGroupingOptions {
  maxVehicles: number;
  routeCount: number;
  /**
   * Vehicle ids that are drop-off-only at the current station (the trip
   * terminates here, you can't board). When supplied, those vehicles are
   * pushed BEHIND every other status bucket — they only fill display slots
   * if there are leftovers, and they always sort below pickup rows in the
   * "More N vehicles" expander too.
   */
  dropOffOnlyIds?: ReadonlySet<number>;
}

/**
 * Extract arrival status from a station vehicle
 */
function getVehicleStatus(vehicle: StationVehicle): ArrivalStatus {
  if (!vehicle.arrivalTime) {
    return 'off_route';
  }

  const statusMessage = vehicle.arrivalTime.statusMessage;
  if (statusMessage.includes('At stop')) return 'at_stop';
  if (statusMessage.includes('Departed')) return 'departed';
  if (statusMessage.includes('minute')) return 'in_minutes'; // Changed from 'minutes' to 'minute' to catch both singular and plural
  return 'off_route';
}

/**
 * Select the best vehicle from a group with the same trip and status
 * Prioritizes vehicles with the earliest arrival time
 */
export function selectBestVehiclePerStatus(
  vehicles: StationVehicle[],
  status: ArrivalStatus
): StationVehicle | null {
  const vehiclesWithStatus = vehicles.filter(v => getVehicleStatus(v) === status);

  if (vehiclesWithStatus.length === 0) {
    return null;
  }

  // Sort by estimated minutes (ascending) to get earliest arrival
  return vehiclesWithStatus.sort((a, b) => {
    const aMinutes = a.arrivalTime?.estimatedMinutes ?? 999;
    const bMinutes = b.arrivalTime?.estimatedMinutes ?? 999;
    return aMinutes - bMinutes;
  })[0];
}

/** Status fill order — primary axis after the drop-off-only partition. */
const STATUS_PRIORITY: ArrivalStatus[] = ['at_stop', 'in_minutes', 'departed', 'off_route'];

/** Internal: run the existing status/trip-diversity grouping on one partition. */
function groupPartition(
  vehicles: StationVehicle[],
): { selected: Record<ArrivalStatus, StationVehicle[]>; byStatus: Record<ArrivalStatus, StationVehicle[]> } {
  const byStatus: Record<ArrivalStatus, StationVehicle[]> = {
    at_stop: [], in_minutes: [], departed: [], off_route: [],
  };
  for (const vehicle of vehicles) {
    byStatus[getVehicleStatus(vehicle)].push(vehicle);
  }
  for (const status of STATUS_PRIORITY) {
    byStatus[status].sort((a, b) => {
      const aMinutes = a.arrivalTime?.estimatedMinutes ?? 999;
      const bMinutes = b.arrivalTime?.estimatedMinutes ?? 999;
      return aMinutes - bMinutes;
    });
  }
  // Trip-diversity cap inside each status bucket.
  const selected: Record<ArrivalStatus, StationVehicle[]> = {
    at_stop: [], in_minutes: [], departed: [], off_route: [],
  };
  for (const status of STATUS_PRIORITY) {
    const tripCounts = new Map<string, number>();
    for (const vehicle of byStatus[status]) {
      const tripId = vehicle.trip?.trip_id || `no-trip-${vehicle.vehicle.id}`;
      const count = tripCounts.get(tripId) || 0;
      if (count < VEHICLE_DISPLAY.MAX_VEHICLES_PER_TRIP_STATUS) {
        selected[status].push(vehicle);
        tripCounts.set(tripId, count + 1);
      }
    }
  }
  return { selected, byStatus };
}

/**
 * Group vehicles for display optimization.
 *
 * Implements a two-tier ordering:
 *   1. **Drop-off-only partition**: vehicles whose trip terminates at this
 *      station (passed in via `options.dropOffOnlyIds`) are pushed STRICTLY
 *      below every pickup row. The user can't board these, so they're the
 *      lowest-value entries on the card list.
 *   2. **Status priority within each partition**: at_stop → in_minutes →
 *      departed → off_route, with the existing trip-diversity cap
 *      ({@link VEHICLE_DISPLAY.MAX_VEHICLES_PER_TRIP_STATUS}) applied per
 *      bucket so multiple vehicles on the same trip don't crowd the list.
 *
 * Pickup slots are filled first (in priority order); any leftover capacity is
 * filled by drop-off rows in the same priority order. The hidden list keeps
 * the same partition split, so "More N vehicles" reveals pickup leftovers
 * before drop-off leftovers.
 */
export function groupVehiclesForDisplay(
  vehicles: StationVehicle[],
  options: VehicleGroupingOptions
): GroupedVehicles {
  // If single route or under threshold, show all vehicles in their input
  // order. Drop-off-only re-ordering is the caller's responsibility on the
  // ungrouped path (handled in `sortStationVehiclesByArrival`).
  if (options.routeCount === 1 || vehicles.length <= options.maxVehicles) {
    return {
      displayed: vehicles,
      hidden: [],
      groupingApplied: false
    };
  }

  // Partition into pickup vs drop-off-only. Both partitions are then bucketed
  // independently using the same status/trip-diversity rules.
  const dropOffIds = options.dropOffOnlyIds;
  const pickup: StationVehicle[] = [];
  const dropOff: StationVehicle[] = [];
  if (dropOffIds && dropOffIds.size > 0) {
    for (const v of vehicles) (dropOffIds.has(v.vehicle.id) ? dropOff : pickup).push(v);
  } else {
    pickup.push(...vehicles);
  }

  const pickupGrouped = groupPartition(pickup);
  const dropOffGrouped = dropOff.length > 0 ? groupPartition(dropOff) : null;

  const finalDisplayed: StationVehicle[] = [];
  const allHidden: StationVehicle[] = [];

  // Fill displayed slots: PICKUP first, in status priority, then DROP-OFF in
  // status priority. Hidden tracks the same partition order.
  for (const partition of (dropOffGrouped ? [pickupGrouped, dropOffGrouped] : [pickupGrouped])) {
    for (const status of STATUS_PRIORITY) {
      const selected = partition.selected[status];
      const all = partition.byStatus[status];

      for (const vehicle of selected) {
        if (finalDisplayed.length < options.maxVehicles) {
          finalDisplayed.push(vehicle);
        } else {
          allHidden.push(vehicle);
        }
      }
      // Trip-diversity-overflow vehicles join hidden in the same partition.
      for (const vehicle of all) {
        if (!selected.includes(vehicle)) {
          allHidden.push(vehicle);
        }
      }
    }
  }

  return {
    displayed: finalDisplayed,
    hidden: allHidden,
    groupingApplied: true
  };
}
