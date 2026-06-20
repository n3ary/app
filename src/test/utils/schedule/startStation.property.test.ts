// Feature: gtfs-schedule-integration, Property 9: Start station prediction suppression
//
// Property 9: For any vehicle, prediction suppression SHALL activate if and only
// if ALL of: (a) the vehicle's stop_sequence equals the first stop in its trip,
// (b) the vehicle is within proximity threshold of the first stop's coordinates,
// (c) the current time is before the scheduled departure from that stop, and
// (d) schedule data exists for the trip. When any condition is not met, normal
// position prediction SHALL apply (suppression returns false).
//
// Validates: Requirements 6.3, 9.1, 9.2, 9.3, 9.4

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  shouldSuppressPrediction,
  START_STATION_PROXIMITY_THRESHOLD_METERS,
} from '../../../utils/schedule/startStationUtils';
import type { SchedulePayload } from '../../../types/schedule';
import type {
  TranzyStopResponse,
  TranzyStopTimeResponse,
} from '../../../types/rawTranzyApi';
import type { EnhancedVehicleData } from '../../../utils/vehicle/vehicleEnhancementUtils';

const PBT_TIMEOUT_MS = 60_000;
const PBT_RUNS = 200;

// ---------------------------------------------------------------------------
// Geometry helpers
//
// We control proximity with realistic coordinates:
//  - "near"  => vehicle placed exactly at the first stop (distance 0m, well
//               within the 50m threshold).
//  - "far"   => vehicle offset ~0.005deg latitude (~556m) from the first stop,
//               clearly beyond the threshold but still nearer to the first stop
//               than any other stop (other stops are placed >100km away), so the
//               vehicle's nearest-stop sequence remains the first stop.
//  - "other" => vehicle placed exactly on a later stop, so its nearest-stop
//               sequence is no longer the first stop.
// ---------------------------------------------------------------------------

const FAR_OFFSET_DEG = 0.005; // ~556m: > 50m threshold, << inter-stop spacing
const OTHER_STOP_SPACING_DEG = 1.0; // ~111km between stops

interface Scenario {
  schedulePresent: boolean; // condition (d)
  atFirstStop: boolean; // condition (a)
  proximityNear: boolean; // condition (b)
  timeBefore: boolean; // condition (c)
  baseLat: number;
  baseLon: number;
  startSeq: number;
  numOtherStops: number;
  firstStopId: number;
  departureMinutes: number; // scheduled departure (d) for the first stop
  currentMinutes: number;
}

const TRIP_ID = 'CJ1001_1_Mon-Fri';
const OTHER_TRIP_ID = 'CJ2002_0_Mon-Fri'; // noise to verify trip filtering

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    schedulePresent: fc.boolean(),
    atFirstStop: fc.boolean(),
    proximityNear: fc.boolean(),
    timeBefore: fc.boolean(),
    // Cluj-area coordinates keep distances realistic.
    baseLat: fc.double({ min: 46.7, max: 46.8, noNaN: true }),
    baseLon: fc.double({ min: 23.5, max: 23.7, noNaN: true }),
    startSeq: fc.integer({ min: 0, max: 5 }),
    numOtherStops: fc.integer({ min: 1, max: 3 }),
    firstStopId: fc.integer({ min: 100, max: 999 }),
    departureMinutes: fc.integer({ min: 1, max: 1439 }),
    timePick: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map((r) => {
    const currentMinutes = r.timeBefore
      ? Math.floor(r.timePick * r.departureMinutes) // [0, departure-1]
      : r.departureMinutes +
        Math.floor(r.timePick * (1439 - r.departureMinutes)); // [departure, 1439]
    return {
      schedulePresent: r.schedulePresent,
      atFirstStop: r.atFirstStop,
      proximityNear: r.proximityNear,
      timeBefore: r.timeBefore,
      baseLat: r.baseLat,
      baseLon: r.baseLon,
      startSeq: r.startSeq,
      numOtherStops: r.numOtherStops,
      firstStopId: r.firstStopId,
      departureMinutes: r.departureMinutes,
      currentMinutes,
    };
  });

interface BuiltInputs {
  vehicle: EnhancedVehicleData;
  scheduleData: SchedulePayload;
  tripStopTimes: TranzyStopTimeResponse[];
  stops: TranzyStopResponse[];
  currentMinutes: number;
}

function buildInputs(s: Scenario): BuiltInputs {
  // Build the trip's stops: first stop at base, others placed far away.
  const stops: TranzyStopResponse[] = [
    {
      stop_id: s.firstStopId,
      stop_name: 'Start Station',
      stop_lat: s.baseLat,
      stop_lon: s.baseLon,
      location_type: 0,
      stop_code: null,
    },
  ];
  const tripStopTimes: TranzyStopTimeResponse[] = [
    { trip_id: TRIP_ID, stop_id: s.firstStopId, stop_sequence: s.startSeq },
  ];

  for (let i = 0; i < s.numOtherStops; i++) {
    const otherId = s.firstStopId + 1 + i;
    stops.push({
      stop_id: otherId,
      stop_name: `Stop ${i + 2}`,
      stop_lat: s.baseLat + OTHER_STOP_SPACING_DEG * (i + 1),
      stop_lon: s.baseLon,
      location_type: 0,
      stop_code: null,
    });
    tripStopTimes.push({
      trip_id: TRIP_ID,
      stop_id: otherId,
      stop_sequence: s.startSeq + i + 1,
    });
  }

  // Noise: stop times belonging to a different trip must be ignored.
  tripStopTimes.push({
    trip_id: OTHER_TRIP_ID,
    stop_id: s.firstStopId,
    stop_sequence: 0,
  });

  // Vehicle position based on conditions (a) and (b).
  let vehicleLat: number;
  let vehicleLon: number;
  if (!s.atFirstStop) {
    // Place the vehicle on a later stop so its nearest stop is not the first.
    vehicleLat = s.baseLat + OTHER_STOP_SPACING_DEG; // first "other" stop
    vehicleLon = s.baseLon;
  } else if (s.proximityNear) {
    // Exactly at the first stop => distance 0, within threshold.
    vehicleLat = s.baseLat;
    vehicleLon = s.baseLon;
  } else {
    // Near the first stop but beyond the proximity threshold (~556m).
    vehicleLat = s.baseLat + FAR_OFFSET_DEG;
    vehicleLon = s.baseLon;
  }

  const vehicle: EnhancedVehicleData = {
    id: 1,
    label: 'V1',
    latitude: vehicleLat,
    longitude: vehicleLon,
    timestamp: '2025-01-15T08:00:00Z',
    speed: 0,
    route_id: 1,
    trip_id: TRIP_ID,
    vehicle_type: 3,
    bike_accessible: 'BIKE_INACCESSIBLE',
    wheelchair_accessible: 'WHEELCHAIR_INACCESSIBLE',
    apiLatitude: vehicleLat,
    apiLongitude: vehicleLon,
    apiSpeed: 0,
  };

  const scheduleStopTimes = [
    {
      s: s.firstStopId,
      q: s.startSeq,
      a: s.departureMinutes,
      d: s.departureMinutes,
    },
  ];

  const scheduleData: SchedulePayload = {
    version: '2025-01-15T03:00:00Z',
    stopTimes: s.schedulePresent ? { [TRIP_ID]: scheduleStopTimes } : {},
    calendar: [],
    calendarExceptions: [],
    tripServiceMap: { [TRIP_ID]: 'Mon-Fri' },
  };

  return {
    vehicle,
    scheduleData,
    tripStopTimes,
    stops,
    currentMinutes: s.currentMinutes,
  };
}

describe('Property 9: Start station prediction suppression', () => {
  it('exposes a positive proximity threshold above the far-offset distance', () => {
    // Sanity check that the "far" offset really exceeds the threshold.
    expect(START_STATION_PROXIMITY_THRESHOLD_METERS).toBeGreaterThan(0);
    expect(START_STATION_PROXIMITY_THRESHOLD_METERS).toBeLessThan(556);
  });

  it(
    'suppresses if and only if all four conditions hold, otherwise resumes normal prediction',
    () => {
      fc.assert(
        fc.property(scenarioArb, (scenario) => {
          const { vehicle, scheduleData, tripStopTimes, stops, currentMinutes } =
            buildInputs(scenario);

          const result = shouldSuppressPrediction(
            vehicle,
            scheduleData,
            tripStopTimes,
            stops,
            currentMinutes,
          );

          // Suppression is the conjunction of all four conditions (a)-(d).
          const expected =
            scenario.schedulePresent &&
            scenario.atFirstStop &&
            scenario.proximityNear &&
            scenario.timeBefore;

          expect(result).toBe(expected);
        }),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );
});
