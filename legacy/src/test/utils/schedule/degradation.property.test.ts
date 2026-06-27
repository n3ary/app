// Feature: gtfs-schedule-integration, Property 10: Graceful degradation
//
// Property 10: Graceful degradation
// For any vehicle, station, or trip input, when schedule data is null/unavailable,
// every schedule-consuming function produces output identical to the existing
// non-schedule (GPS-only) behavior:
//   - getGhostCandidatesForDisplay -> [] (no ghosts)
//   - combineVehiclesAndGhosts     -> exactly the input vehicles as `gps` items, in order
//   - applyScheduleMatching        -> every vehicle with match: null, in input order (no duplicate detection)
//   - buildVehicleMatchMap         -> empty map
//   - isPredictionSuppressed       -> false (no prediction suppression)
//   - enhanceArrivalWithSchedule (scheduledArrivalMinutes null) -> original GPS
//       result preserved (estimatedMinutes / confidence / statusMessage / status
//       unchanged; etaSource 'gps'; scheduleEtaMinutes null; gpsEtaMinutes mirrors
//       the GPS estimate) -> GPS-only ETA
//
// Validates: Requirements 10.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getGhostCandidatesForDisplay,
  combineVehiclesAndGhosts,
  applyScheduleMatching,
  buildVehicleMatchMap,
  isPredictionSuppressed,
} from '../../../utils/schedule/scheduleVehicleIntegration';
import { enhanceArrivalWithSchedule } from '../../../utils/schedule/etaEnhancementUtils';
import type { EnhancedVehicleData } from '../../../utils/vehicle/vehicleEnhancementUtils';
import type { ArrivalTimeResult, ArrivalStatus } from '../../../types/arrivalTime';
import type {
  TranzyStopResponse,
  TranzyStopTimeResponse,
} from '../../../types/rawTranzyApi';
import {
  CONFIDENCE_LEVELS,
  ARRIVAL_METHODS,
  type ConfidenceLevel,
  type ArrivalMethod,
} from '../../../utils/core/stringConstants';

const PBT_TIMEOUT_MS = 60_000;
const PBT_RUNS = 100;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A GPS-visible enhanced vehicle. Only fields read by the functions matter. */
const vehicleArb: fc.Arbitrary<EnhancedVehicleData> = fc
  .record({
    id: fc.integer({ min: 1, max: 100_000 }),
    tripId: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
    routeId: fc.option(fc.integer({ min: 1, max: 999 }), { nil: null }),
    latitude: fc.double({ min: 46, max: 47, noNaN: true }),
    longitude: fc.double({ min: 23, max: 24, noNaN: true }),
    speed: fc.double({ min: 0, max: 80, noNaN: true }),
  })
  .map(({ id, tripId, routeId, latitude, longitude, speed }) => ({
    id,
    label: `V${id}`,
    latitude,
    longitude,
    timestamp: '2025-01-15T08:00:00Z',
    speed,
    route_id: routeId,
    trip_id: tripId,
    vehicle_type: 3,
    bike_accessible: 'BIKE_INACCESSIBLE',
    wheelchair_accessible: 'WHEELCHAIR_INACCESSIBLE',
    apiLatitude: latitude,
    apiLongitude: longitude,
    apiSpeed: speed,
  }));

const vehiclesArb = fc.array(vehicleArb, { minLength: 0, maxLength: 8 });

const confidenceArb: fc.Arbitrary<ConfidenceLevel> = fc.constantFrom(
  CONFIDENCE_LEVELS.HIGH,
  CONFIDENCE_LEVELS.MEDIUM,
  CONFIDENCE_LEVELS.LOW,
);

const arrivalStatusArb: fc.Arbitrary<ArrivalStatus> = fc.constantFrom(
  'at_stop',
  'in_minutes',
  'departed',
  'off_route',
);

const arrivalMethodArb: fc.Arbitrary<ArrivalMethod> = fc.constantFrom(
  ARRIVAL_METHODS.ROUTE_SHAPE,
  ARRIVAL_METHODS.STOP_SEGMENTS,
  ARRIVAL_METHODS.ROUTE_PROJECTION,
  ARRIVAL_METHODS.OFF_ROUTE,
  ARRIVAL_METHODS.FALLBACK,
);

/** A GPS-derived arrival result (the existing baseline output). */
const arrivalResultArb: fc.Arbitrary<ArrivalTimeResult> = fc.record({
  vehicleId: fc.integer({ min: 1, max: 100_000 }),
  estimatedMinutes: fc.integer({ min: 0, max: 120 }),
  status: arrivalStatusArb,
  statusMessage: fc.string({ maxLength: 24 }),
  confidence: confidenceArb,
  calculationMethod: arrivalMethodArb,
});

/** Tranzy stop-sequence rows for a trip (shape only; content is irrelevant when null). */
const tripStopTimesArb: fc.Arbitrary<TranzyStopTimeResponse[]> = fc.array(
  fc
    .record({
      trip_id: fc.string({ minLength: 1, maxLength: 6 }),
      stop_id: fc.integer({ min: 1, max: 9999 }),
      stop_sequence: fc.integer({ min: 0, max: 30 }),
    })
    .map((r) => r as unknown as TranzyStopTimeResponse),
  { maxLength: 5 },
);

const stopsArb: fc.Arbitrary<TranzyStopResponse[]> = fc.array(
  fc
    .record({
      stop_id: fc.integer({ min: 1, max: 9999 }),
      stop_lat: fc.double({ min: 46, max: 47, noNaN: true }),
      stop_lon: fc.double({ min: 23, max: 24, noNaN: true }),
    })
    .map((r) => r as unknown as TranzyStopResponse),
  { maxLength: 5 },
);

const activeTripsArb = fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
  maxLength: 8,
});

const currentMinutesArb = fc.integer({ min: 0, max: 1600 });

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('schedule degradation — Property 10: Graceful degradation', () => {
  it(
    'getGhostCandidatesForDisplay returns no ghosts when schedule data is null',
    () => {
      fc.assert(
        fc.property(
          vehiclesArb,
          activeTripsArb,
          currentMinutesArb,
          (vehicles, activeTrips, currentMinutes) => {
            const ghosts = getGhostCandidatesForDisplay({
              vehicles,
              activeTrips,
              scheduleData: null,
              currentMinutes,
            });
            expect(ghosts).toEqual([]);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'combineVehiclesAndGhosts returns exactly the input vehicles as gps items, in order',
    () => {
      fc.assert(
        fc.property(
          vehiclesArb,
          activeTripsArb,
          currentMinutesArb,
          (vehicles, activeTrips, currentMinutes) => {
            const items = combineVehiclesAndGhosts({
              vehicles,
              activeTrips,
              scheduleData: null,
              currentMinutes,
            });

            // Same length as the GPS-only baseline (no ghost items appended).
            expect(items).toHaveLength(vehicles.length);
            items.forEach((item, index) => {
              expect(item.kind).toBe('gps');
              // Same vehicles, same order, same identity.
              expect(item).toEqual({ kind: 'gps', vehicle: vehicles[index] });
            });
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'applyScheduleMatching returns every vehicle unannotated (match: null), in input order',
    () => {
      fc.assert(
        fc.property(
          vehiclesArb,
          activeTripsArb,
          currentMinutesArb,
          (vehicles, activeTrips, currentMinutes) => {
            const matched = applyScheduleMatching({
              vehicles,
              activeTrips,
              scheduleData: null,
              currentMinutes,
            });

            expect(matched).toHaveLength(vehicles.length);
            matched.forEach((entry, index) => {
              expect(entry.match).toBeNull();
              expect(entry.vehicle).toBe(vehicles[index]);
            });
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'buildVehicleMatchMap returns an empty map when schedule data is null',
    () => {
      fc.assert(
        fc.property(
          vehiclesArb,
          activeTripsArb,
          currentMinutesArb,
          (vehicles, activeTrips, currentMinutes) => {
            const map = buildVehicleMatchMap({
              vehicles,
              activeTrips,
              scheduleData: null,
              currentMinutes,
            });
            expect(map.size).toBe(0);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'isPredictionSuppressed is always false when schedule data is null',
    () => {
      fc.assert(
        fc.property(
          vehicleArb,
          tripStopTimesArb,
          stopsArb,
          currentMinutesArb,
          (vehicle, tripStopTimes, stops, currentMinutes) => {
            const suppressed = isPredictionSuppressed({
              vehicle,
              scheduleData: null,
              tripStopTimes,
              stops,
              currentMinutes,
            });
            expect(suppressed).toBe(false);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'enhanceArrivalWithSchedule preserves the GPS result when no scheduled arrival exists (GPS-only ETA)',
    () => {
      fc.assert(
        fc.property(
          arrivalResultArb,
          fc.integer({ min: 0, max: 600_000 }),
          fc.integer({ min: 0, max: 1439 }),
          (gpsResult, gpsAgeMs, nowMinutes) => {
            const enhanced = enhanceArrivalWithSchedule(gpsResult, {
              scheduledArrivalMinutes: null,
              gpsAgeMs,
              nowMinutesSinceMidnight: nowMinutes,
            });

            // GPS-only ETA: every original field is preserved unchanged.
            expect(enhanced.vehicleId).toBe(gpsResult.vehicleId);
            expect(enhanced.estimatedMinutes).toBe(gpsResult.estimatedMinutes);
            expect(enhanced.confidence).toBe(gpsResult.confidence);
            expect(enhanced.statusMessage).toBe(gpsResult.statusMessage);
            expect(enhanced.status).toBe(gpsResult.status);
            expect(enhanced.calculationMethod).toBe(gpsResult.calculationMethod);

            // Additive fields reflect GPS-only behavior.
            expect(enhanced.etaSource).toBe('gps');
            expect(enhanced.scheduleEtaMinutes).toBeNull();
            expect(enhanced.gpsEtaMinutes).toBe(gpsResult.estimatedMinutes);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );
});
