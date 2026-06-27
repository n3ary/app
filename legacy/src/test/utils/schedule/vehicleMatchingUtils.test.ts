/**
 * Unit tests for vehicle-to-schedule matching (Requirements 8.1–8.5).
 */

import { describe, it, expect } from 'vitest';
import { matchVehiclesToSchedule } from '../../../utils/schedule/vehicleMatchingUtils';
import type { SchedulePayload, ScheduleStopTime } from '../../../types/schedule';
import type { EnhancedVehicleData } from '../../../utils/vehicle/vehicleEnhancementUtils';

/** Build a minimal enhanced vehicle; only fields used by matching matter. */
function makeVehicle(
  id: number,
  tripId: string | null,
  routeId: number | null = 1,
): EnhancedVehicleData {
  return {
    id,
    label: `V${id}`,
    latitude: 46.77,
    longitude: 23.6,
    timestamp: '2025-01-15T08:00:00Z',
    speed: 20,
    route_id: routeId,
    trip_id: tripId,
    vehicle_type: 3,
    bike_accessible: 'BIKE_INACCESSIBLE',
    wheelchair_accessible: 'WHEELCHAIR_INACCESSIBLE',
    apiLatitude: 46.77,
    apiLongitude: 23.6,
    apiSpeed: 20,
  };
}

/** Two-stop trip starting (departing stop 0) at the given minutes-since-midnight. */
function tripStops(startMinutes: number): ScheduleStopTime[] {
  return [
    { s: 100, q: 0, a: startMinutes, d: startMinutes },
    { s: 101, q: 1, a: startMinutes + 10, d: startMinutes + 10 },
  ];
}

function makeSchedule(
  stopTimes: Record<string, ScheduleStopTime[]>,
): SchedulePayload {
  return {
    version: '2025-01-15T03:00:00Z',
    stopTimes,
    calendar: [],
    calendarExceptions: [],
    tripServiceMap: {},
  };
}

describe('matchVehiclesToSchedule', () => {
  it('matches a vehicle to its own active trip with zero timing delta (8.1)', () => {
    const schedule = makeSchedule({ T1: tripStops(480) }); // 08:00
    const vehicles = [makeVehicle(1, 'T1')];

    const result = matchVehiclesToSchedule(vehicles, ['T1'], schedule, 485);

    expect(result).toEqual([
      {
        vehicleId: 1,
        tripId: 'T1',
        matchConfidence: 'high',
        isSuspectDuplicate: false,
        timingDeltaMinutes: 0,
      },
    ]);
  });

  it('matches to the closest active trip by scheduled start time (8.2)', () => {
    // Vehicle anchored to a trip starting 08:04; candidates at 08:00 and 08:20.
    const schedule = makeSchedule({
      VEH: tripStops(484),
      EARLY: tripStops(480),
      LATE: tripStops(500),
    });
    const vehicles = [makeVehicle(1, 'VEH')];

    const result = matchVehiclesToSchedule(
      vehicles,
      ['EARLY', 'LATE'],
      schedule,
      490,
    );

    expect(result[0].tripId).toBe('EARLY'); // |484-480|=4 vs |484-500|=16
    expect(result[0].timingDeltaMinutes).toBe(4);
    expect(result[0].isSuspectDuplicate).toBe(false);
    expect(result[0].matchConfidence).toBe('medium');
  });

  it('flags the worse of two same-trip vehicles as a suspect duplicate (8.3)', () => {
    // Only one active trip; two vehicles anchored at different start times.
    const schedule = makeSchedule({
      T1: tripStops(480),
      A: tripStops(481), // delta 1 -> real
      B: tripStops(486), // delta 6 -> duplicate
    });
    const vehicles = [makeVehicle(1, 'A'), makeVehicle(2, 'B')];

    const result = matchVehiclesToSchedule(vehicles, ['T1'], schedule, 490);

    const v1 = result.find((r) => r.vehicleId === 1)!;
    const v2 = result.find((r) => r.vehicleId === 2)!;

    expect(v1.tripId).toBe('T1');
    expect(v1.isSuspectDuplicate).toBe(false);
    expect(v2.tripId).toBe('T1');
    expect(v2.isSuspectDuplicate).toBe(true);
    expect(v2.matchConfidence).toBe('low');
  });

  it('flags a vehicle with no candidate within tolerance as suspect (8.4)', () => {
    const schedule = makeSchedule({
      VEH: tripStops(480),
      FAR: tripStops(520), // 40 minutes off -> beyond ±10
    });
    const vehicles = [makeVehicle(1, 'VEH')];

    const result = matchVehiclesToSchedule(vehicles, ['FAR'], schedule, 490);

    expect(result[0].isSuspectDuplicate).toBe(true);
    expect(result[0].tripId).toBe('');
    expect(result[0].timingDeltaMinutes).toBe(40);
    expect(result[0].matchConfidence).toBe('low');
  });

  it('flags vehicles with no schedule anchor as suspect with NO_MATCH delta', () => {
    const schedule = makeSchedule({ T1: tripStops(480) });
    const vehicles = [
      makeVehicle(1, null), // no trip_id
      makeVehicle(2, 'UNKNOWN'), // trip not in schedule
    ];

    const result = matchVehiclesToSchedule(vehicles, ['T1'], schedule, 490);

    for (const r of result) {
      expect(r.isSuspectDuplicate).toBe(true);
      expect(r.tripId).toBe('');
      expect(r.timingDeltaMinutes).toBe(-1);
      expect(r.matchConfidence).toBe('low');
    }
  });

  it('flags all vehicles suspect when there are no active candidate trips', () => {
    const schedule = makeSchedule({ T1: tripStops(480) });
    const vehicles = [makeVehicle(1, 'T1')];

    const result = matchVehiclesToSchedule(vehicles, [], schedule, 490);

    expect(result[0].isSuspectDuplicate).toBe(true);
    expect(result[0].timingDeltaMinutes).toBe(-1);
  });

  it('returns one result per vehicle, preserving input order', () => {
    const schedule = makeSchedule({
      T1: tripStops(480),
      T2: tripStops(500),
    });
    const vehicles = [
      makeVehicle(3, 'T2'),
      makeVehicle(1, 'T1'),
      makeVehicle(2, null),
    ];

    const result = matchVehiclesToSchedule(
      vehicles,
      ['T1', 'T2'],
      schedule,
      490,
    );

    expect(result.map((r) => r.vehicleId)).toEqual([3, 1, 2]);
  });

  it('breaks same-trip ties deterministically by vehicle id', () => {
    // Both vehicles anchored to identical start -> equal delta 0 to T1.
    const schedule = makeSchedule({
      T1: tripStops(480),
      A: tripStops(480),
      B: tripStops(480),
    });
    const vehicles = [makeVehicle(5, 'B'), makeVehicle(2, 'A')];

    const result = matchVehiclesToSchedule(vehicles, ['T1'], schedule, 490);

    const real = result.find((r) => !r.isSuspectDuplicate)!;
    expect(real.vehicleId).toBe(2); // smaller id wins the tie
  });
});
