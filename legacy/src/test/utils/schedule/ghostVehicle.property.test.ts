// Feature: gtfs-schedule-integration, Property 7: Ghost vehicle lifecycle
//
// Property 7: Ghost vehicle lifecycle
// A scheduled trip is a ghost vehicle candidate exactly when its scheduled
// start (first stop's departure) is in the past, its scheduled end (last
// stop's arrival) has not yet passed, and no GPS-visible vehicle is assigned
// to it. The estimated progress along the route is always bounded to [0, 1].
// Once the scheduled end time passes, the candidate is removed (lifecycle).
// A trip with an assigned GPS vehicle is never a candidate.
//
// Validates: Requirements 7.1, 7.2, 7.5

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { identifyGhostTrips } from '../../../utils/schedule/ghostVehicleUtils';
import type {
  SchedulePayload,
  ScheduleStopTime,
  GhostVehicleCandidate,
} from '../../../types/schedule';

const PBT_TIMEOUT_MS = 60_000;
const PBT_RUNS = 100;

const UNKNOWN_ROUTE_ID = 0;

/** Specification for a single generated trip. */
interface TripSpec {
  firstDeparture: number;
  duration: number;
  nStops: number;
  hasGps: boolean;
  hasStopTimes: boolean;
}

/**
 * Build a trip's stop times with strictly increasing stop_sequence (`q`) so the
 * first array element is the earliest stop and the last element is the latest.
 * The first stop's departure (`d`) equals `firstDeparture` and the last stop's
 * arrival (`a`) equals `firstDeparture + duration`, matching the bounds the
 * function under test derives.
 */
function buildStopTimes(
  firstDeparture: number,
  duration: number,
  nStops: number,
): ScheduleStopTime[] {
  const end = firstDeparture + duration;
  const stopTimes: ScheduleStopTime[] = [];
  for (let i = 0; i < nStops; i++) {
    const t =
      nStops === 1
        ? firstDeparture
        : Math.round(firstDeparture + (duration * i) / (nStops - 1));
    stopTimes.push({ s: i + 1, q: i + 1, a: t, d: t });
  }
  // Pin the exact start (first stop's departure) and end (last stop's arrival).
  stopTimes[0].d = firstDeparture;
  stopTimes[nStops - 1].a = end;
  return stopTimes;
}

/** Assemble a minimal SchedulePayload from a list of trip specs. */
function buildScenario(specs: TripSpec[]): {
  activeTrips: string[];
  gpsVehicleTripIds: Set<string>;
  scheduleData: SchedulePayload;
} {
  const activeTrips: string[] = [];
  const gpsVehicleTripIds = new Set<string>();
  const stopTimes: Record<string, ScheduleStopTime[]> = {};

  specs.forEach((spec, index) => {
    const tripId = `trip-${index}`;
    activeTrips.push(tripId);
    if (spec.hasGps) gpsVehicleTripIds.add(tripId);
    if (spec.hasStopTimes) {
      stopTimes[tripId] = buildStopTimes(
        spec.firstDeparture,
        spec.duration,
        spec.nStops,
      );
    }
  });

  const scheduleData: SchedulePayload = {
    version: '',
    stopTimes,
    calendar: [],
    calendarExceptions: [],
    tripServiceMap: {},
  };

  return { activeTrips, gpsVehicleTripIds, scheduleData };
}

/** Clamp helper mirroring the implementation's [0, 1] bound. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

const tripSpecArb: fc.Arbitrary<TripSpec> = fc.record({
  firstDeparture: fc.integer({ min: 0, max: 1439 }),
  duration: fc.integer({ min: 0, max: 180 }),
  nStops: fc.integer({ min: 1, max: 5 }),
  hasGps: fc.boolean(),
  hasStopTimes: fc.boolean(),
});

function indexCandidates(
  candidates: GhostVehicleCandidate[],
): Map<string, GhostVehicleCandidate> {
  const byId = new Map<string, GhostVehicleCandidate>();
  for (const candidate of candidates) byId.set(candidate.tripId, candidate);
  return byId;
}

describe('ghostVehicleUtils — Property 7: Ghost vehicle lifecycle', () => {
  it(
    'identifies a trip as a candidate iff start is past, end not passed, and no GPS vehicle',
    () => {
      fc.assert(
        fc.property(
          fc.array(tripSpecArb, { minLength: 0, maxLength: 8 }),
          fc.integer({ min: 0, max: 1600 }),
          (specs, currentMinutes) => {
            const { activeTrips, gpsVehicleTripIds, scheduleData } =
              buildScenario(specs);

            const result = identifyGhostTrips(
              activeTrips,
              gpsVehicleTripIds,
              scheduleData,
              currentMinutes,
            );
            const byId = indexCandidates(result);

            specs.forEach((spec, index) => {
              const tripId = `trip-${index}`;
              const start = spec.firstDeparture;
              const end = spec.firstDeparture + spec.duration;

              const expectedCandidate =
                spec.hasStopTimes &&
                !spec.hasGps &&
                start < currentMinutes &&
                currentMinutes <= end;

              const candidate = byId.get(tripId);
              expect(Boolean(candidate)).toBe(expectedCandidate);

              if (candidate) {
                // Bounded progress in [0, 1].
                expect(candidate.estimatedProgress).toBeGreaterThanOrEqual(0);
                expect(candidate.estimatedProgress).toBeLessThanOrEqual(1);

                const expectedProgress =
                  spec.duration > 0
                    ? clamp01((currentMinutes - start) / spec.duration)
                    : 1;
                expect(candidate.estimatedProgress).toBeCloseTo(
                  expectedProgress,
                  10,
                );

                expect(candidate.scheduledStartMinutes).toBe(start);
                expect(candidate.elapsedMinutes).toBe(currentMinutes - start);
                expect(candidate.routeId).toBe(UNKNOWN_ROUTE_ID);
              }
            });
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'always bounds estimatedProgress to [0, 1] for every emitted candidate',
    () => {
      fc.assert(
        fc.property(
          fc.array(tripSpecArb, { minLength: 0, maxLength: 8 }),
          fc.integer({ min: 0, max: 1600 }),
          (specs, currentMinutes) => {
            const { activeTrips, gpsVehicleTripIds, scheduleData } =
              buildScenario(specs);

            const result = identifyGhostTrips(
              activeTrips,
              gpsVehicleTripIds,
              scheduleData,
              currentMinutes,
            );

            for (const candidate of result) {
              expect(candidate.estimatedProgress).toBeGreaterThanOrEqual(0);
              expect(candidate.estimatedProgress).toBeLessThanOrEqual(1);
              expect(Number.isFinite(candidate.estimatedProgress)).toBe(true);
            }
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'removes a candidate once the scheduled end time has passed (lifecycle)',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 100 }),
          (firstDeparture, duration, nStops, extra) => {
            const start = firstDeparture;
            const end = firstDeparture + duration;

            const { activeTrips, gpsVehicleTripIds, scheduleData } =
              buildScenario([
                {
                  firstDeparture,
                  duration,
                  nStops,
                  hasGps: false,
                  hasStopTimes: true,
                },
              ]);
            const tripId = 'trip-0';

            // Within the active window (start < t <= end): present.
            const midTime = end; // end is still "not passed" (inclusive).
            const duringResult = identifyGhostTrips(
              activeTrips,
              gpsVehicleTripIds,
              scheduleData,
              midTime,
            );
            expect(
              duringResult.some((c) => c.tripId === tripId),
            ).toBe(start < midTime);

            // After the scheduled end time: candidate removed.
            const afterResult = identifyGhostTrips(
              activeTrips,
              gpsVehicleTripIds,
              scheduleData,
              end + extra,
            );
            expect(afterResult.some((c) => c.tripId === tripId)).toBe(false);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'never emits a candidate for a trip that has an assigned GPS vehicle',
    () => {
      fc.assert(
        fc.property(
          fc.array(
            tripSpecArb.map((spec) => ({ ...spec, hasGps: true })),
            { minLength: 1, maxLength: 8 },
          ),
          fc.integer({ min: 0, max: 1600 }),
          (specs, currentMinutes) => {
            const { activeTrips, gpsVehicleTripIds, scheduleData } =
              buildScenario(specs);

            const result = identifyGhostTrips(
              activeTrips,
              gpsVehicleTripIds,
              scheduleData,
              currentMinutes,
            );

            expect(result).toHaveLength(0);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );
});
