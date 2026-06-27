// Feature: gtfs-schedule-integration, Property 8: Vehicle-to-schedule matching
//
// Property 8: For any set of GPS-visible vehicles and any set of active
// scheduled trips, matchVehiclesToSchedule SHALL assign each vehicle to the
// scheduled trip whose expected position (timing delta, in minutes) is closest,
// provided that delta is within ±10 minutes. When several vehicles map to the
// same trip, only the best-matching one (smallest delta, ties broken by smaller
// vehicle id) is real; the rest are suspect duplicates. Vehicles with no
// in-tolerance candidate (no schedule anchor, no candidates, or nearest beyond
// tolerance) are flagged as suspect duplicates.
//
// Validates: Requirements 8.1, 8.2, 8.3, 8.4

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  matchVehiclesToSchedule,
  TIMING_TOLERANCE_MINUTES,
} from '../../../utils/schedule/vehicleMatchingUtils';
import type { SchedulePayload, ScheduleStopTime } from '../../../types/schedule';
import type { EnhancedVehicleData } from '../../../utils/vehicle/vehicleEnhancementUtils';

// ---------------------------------------------------------------------------
// Generated model
// ---------------------------------------------------------------------------

/** A scheduled trip in the pool, with its start (minutes-since-midnight). */
interface PoolTrip {
  tripId: string;
  start: number;
}

interface GeneratedVehicle {
  id: number;
  /** How the vehicle's trip_id is derived. */
  tripKind: 'null' | 'unknown' | 'known';
  /** Index into the pool when tripKind === 'known'. */
  knownIdx: number;
}

interface GeneratedModel {
  pool: PoolTrip[];
  vehicles: GeneratedVehicle[];
  /** Indices into the pool selected as active candidate trips. */
  activeIdx: number[];
  /** Whether to also add an active trip id that has no schedule entry. */
  includeUnscheduledActive: boolean;
  currentMinutes: number;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Trip start times are kept in a small window (0..40 min) so that the pairwise
 * timing deltas (|startA - startB|) land both within and beyond the ±10 minute
 * tolerance across runs, exercising matches, duplicates, and no-match cases.
 */
const poolTripArb = fc.record({
  n: fc.integer({ min: 0, max: 60 }),
  start: fc.integer({ min: 0, max: 40 }),
});

const poolArb: fc.Arbitrary<PoolTrip[]> = fc
  .uniqueArray(poolTripArb, {
    selector: (t) => t.n,
    minLength: 1,
    maxLength: 6,
  })
  .map((arr) => arr.map((t) => ({ tripId: `T${t.n}`, start: t.start })));

const modelArb: fc.Arbitrary<GeneratedModel> = poolArb.chain((pool) => {
  const lastIdx = pool.length - 1;
  const vehicleArb: fc.Arbitrary<GeneratedVehicle> = fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    tripKind: fc.constantFrom<'null' | 'unknown' | 'known'>(
      'null',
      'unknown',
      'known',
    ),
    knownIdx: fc.integer({ min: 0, max: lastIdx }),
  });

  return fc.record({
    pool: fc.constant(pool),
    // Unique vehicle ids so each result is unambiguously addressable.
    vehicles: fc.uniqueArray(vehicleArb, {
      selector: (v) => v.id,
      minLength: 0,
      maxLength: 6,
    }),
    // Active candidate trips: a subset of the pool indices (order preserved).
    activeIdx: fc.subarray(
      pool.map((_, i) => i),
      { minLength: 0, maxLength: pool.length },
    ),
    includeUnscheduledActive: fc.boolean(),
    currentMinutes: fc.integer({ min: 0, max: 1439 }),
  });
});

// ---------------------------------------------------------------------------
// Helpers to materialize the generated model into function inputs
// ---------------------------------------------------------------------------

/** Build a two-stop trip departing the start station at `start` minutes. */
function tripStops(start: number): ScheduleStopTime[] {
  return [
    { s: 100, q: 0, a: start, d: start },
    { s: 101, q: 1, a: start + 10, d: start + 10 },
  ];
}

function buildSchedule(pool: PoolTrip[]): SchedulePayload {
  const stopTimes: Record<string, ScheduleStopTime[]> = {};
  for (const trip of pool) {
    stopTimes[trip.tripId] = tripStops(trip.start);
  }
  return {
    version: '2025-01-15T03:00:00Z',
    stopTimes,
    calendar: [],
    calendarExceptions: [],
    tripServiceMap: {},
  };
}

function makeVehicle(id: number, tripId: string | null): EnhancedVehicleData {
  return {
    id,
    label: `V${id}`,
    latitude: 46.77,
    longitude: 23.6,
    timestamp: '2025-01-15T08:00:00Z',
    speed: 20,
    route_id: 1,
    trip_id: tripId,
    vehicle_type: 3,
    bike_accessible: 'BIKE_INACCESSIBLE',
    wheelchair_accessible: 'WHEELCHAIR_INACCESSIBLE',
    apiLatitude: 46.77,
    apiLongitude: 23.6,
    apiSpeed: 20,
  };
}

function resolveTripId(v: GeneratedVehicle, pool: PoolTrip[]): string | null {
  switch (v.tripKind) {
    case 'null':
      return null;
    case 'unknown':
      // Deterministically not present in the schedule (pool ids are `T<n>`).
      return `GHOST_${v.id}`;
    case 'known':
      return pool[v.knownIdx].tripId;
  }
}

// ---------------------------------------------------------------------------
// Independent reference for the documented timing semantics
// ---------------------------------------------------------------------------

function startOf(pool: PoolTrip[], tripId: string | null): number | null {
  if (tripId === null) return null;
  const entry = pool.find((p) => p.tripId === tripId);
  return entry ? entry.start : null;
}

/**
 * The nearest candidate trip for a vehicle, per the design's timing model:
 *   delta = |scheduledStart(candidate) - scheduledStart(vehicle.trip_id)|
 * with ties broken by the lexicographically smaller trip id. Returns null when
 * the vehicle has no schedule anchor or there are no resolvable candidates.
 */
function nearestCandidate(
  anchorStart: number | null,
  candidates: PoolTrip[],
): { tripId: string; delta: number } | null {
  if (anchorStart === null || candidates.length === 0) return null;
  let best: { tripId: string; delta: number } | null = null;
  for (const c of candidates) {
    const delta = Math.abs(c.start - anchorStart);
    const better =
      best === null ||
      delta < best.delta ||
      (delta === best.delta && c.tripId < best.tripId);
    if (better) best = { tripId: c.tripId, delta };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 8: Vehicle-to-schedule matching', () => {
  it('matches vehicles to the closest in-tolerance trip and flags the rest as duplicates', () => {
    fc.assert(
      fc.property(modelArb, (model) => {
        const { pool, currentMinutes } = model;
        const schedule = buildSchedule(pool);

        const vehicles = model.vehicles.map((v) =>
          makeVehicle(v.id, resolveTripId(v, pool)),
        );

        const activeTrips = model.activeIdx.map((i) => pool[i].tripId);
        if (model.includeUnscheduledActive) {
          // An active trip with no schedule entry must be ignored as a candidate.
          activeTrips.push('NOSCHEDULE');
        }

        const results = matchVehiclesToSchedule(
          vehicles,
          activeTrips,
          schedule,
          currentMinutes,
        );

        // Independent reference: resolvable candidates and per-vehicle nearest.
        const candidates: PoolTrip[] = activeTrips
          .map((tripId) => {
            const start = startOf(pool, tripId);
            return start === null ? null : { tripId, start };
          })
          .filter((c): c is PoolTrip => c !== null);

        const expectedNearest = vehicles.map((v) =>
          nearestCandidate(startOf(pool, v.trip_id), candidates),
        );

        // Invariant 1: exactly one result per input vehicle, in input order.
        expect(results).toHaveLength(vehicles.length);
        results.forEach((r, i) => {
          expect(r.vehicleId).toBe(vehicles[i].id);
        });

        // Invariant 2: timing delta is the nearest candidate's delta, or the
        // -1 sentinel when there is no comparable candidate.
        results.forEach((r, i) => {
          const n = expectedNearest[i];
          expect(r.timingDeltaMinutes).toBe(n === null ? -1 : n.delta);
        });

        // Invariant 3: any vehicle with no in-tolerance candidate is suspect.
        results.forEach((r, i) => {
          const n = expectedNearest[i];
          const hasInTolerance =
            n !== null && n.delta <= TIMING_TOLERANCE_MINUTES;
          if (!hasInTolerance) {
            expect(r.isSuspectDuplicate).toBe(true);
          }
        });

        // Invariant 4: every real (non-duplicate) match is within tolerance and
        // carries a non-empty trip id.
        results.forEach((r) => {
          if (!r.isSuspectDuplicate) {
            expect(r.timingDeltaMinutes).toBeGreaterThanOrEqual(0);
            expect(r.timingDeltaMinutes).toBeLessThanOrEqual(
              TIMING_TOLERANCE_MINUTES,
            );
            expect(r.tripId).not.toBe('');
          }
        });

        // Invariant 5: each scheduled trip has at most one real vehicle.
        const realCountByTrip = new Map<string, number>();
        results.forEach((r) => {
          if (!r.isSuspectDuplicate) {
            realCountByTrip.set(
              r.tripId,
              (realCountByTrip.get(r.tripId) ?? 0) + 1,
            );
          }
        });
        for (const count of realCountByTrip.values()) {
          expect(count).toBeLessThanOrEqual(1);
        }

        // Invariant 6: for each trip with in-tolerance vehicles, the real one is
        // the unique best (smallest delta, ties broken by smaller vehicle id),
        // and every other in-tolerance vehicle on that trip is a suspect
        // duplicate that still references the trip id.
        const groups = new Map<string, Array<{ id: number; delta: number }>>();
        vehicles.forEach((v, i) => {
          const n = expectedNearest[i];
          if (n !== null && n.delta <= TIMING_TOLERANCE_MINUTES) {
            const arr = groups.get(n.tripId) ?? [];
            arr.push({ id: v.id, delta: n.delta });
            groups.set(n.tripId, arr);
          }
        });

        groups.forEach((members, tripId) => {
          members.sort((a, b) =>
            a.delta !== b.delta ? a.delta - b.delta : a.id - b.id,
          );
          const expectedRealId = members[0].id;

          const realForTrip = results.filter(
            (r) => !r.isSuspectDuplicate && r.tripId === tripId,
          );
          expect(realForTrip).toHaveLength(1);
          expect(realForTrip[0].vehicleId).toBe(expectedRealId);

          for (const loser of members.slice(1)) {
            const r = results.find((rr) => rr.vehicleId === loser.id)!;
            expect(r.isSuspectDuplicate).toBe(true);
            // Within tolerance, so the trip id is still surfaced.
            expect(r.tripId).toBe(tripId);
          }
        });
      }),
      { numRuns: 200 },
    );
  }, 60000);
});
