// Feature: gtfs-schedule-integration, Property 5: ETA source selection
//
// Property 5: For any GPS-based arrival result and schedule inputs,
// enhanceArrivalWithSchedule SHALL select the primary ETA source as follows:
//   (a) GPS fresh (gpsAgeMs <= staleThreshold) + scheduled arrival present →
//       etaSource 'gps', GPS value stays primary, schedule retained as a
//       reference (Requirements 5.1, 5.2).
//   (b) GPS stale (gpsAgeMs > staleThreshold) + scheduled arrival present →
//       etaSource 'schedule', schedule value becomes primary, GPS retained as a
//       reference, and confidence is downgraded one step (strictly lower than
//       the GPS-primary confidence for GPS confidence in {high, medium}; floors
//       at 'low' when GPS is already 'low') (Requirements 5.3, 5.4).
//   (c) scheduledArrivalMinutes null → GPS result returned unchanged aside from
//       additive fields (Requirement 5.5).
//
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  enhanceArrivalWithSchedule,
  compareConfidence,
  downgradeConfidence,
  GPS_STALE_ETA_FALLBACK_MS,
} from '../../../utils/schedule/etaEnhancementUtils';
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '../../../utils/core/stringConstants';
import { ARRIVAL_METHODS } from '../../../utils/core/stringConstants';
import type { ArrivalTimeResult, ArrivalStatus } from '../../../types/arrivalTime';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const confidenceArb: fc.Arbitrary<ConfidenceLevel> = fc.constantFrom(
  CONFIDENCE_LEVELS.HIGH,
  CONFIDENCE_LEVELS.MEDIUM,
  CONFIDENCE_LEVELS.LOW,
);

// Confidence restricted to levels that strictly downgrade (high/medium). Used
// for the strict-lower-confidence assertion; 'low' floors at 'low' and is
// covered separately as an accepted boundary case.
const downgradableConfidenceArb: fc.Arbitrary<ConfidenceLevel> = fc.constantFrom(
  CONFIDENCE_LEVELS.HIGH,
  CONFIDENCE_LEVELS.MEDIUM,
);

const statusArb: fc.Arbitrary<ArrivalStatus> = fc.constantFrom(
  'at_stop',
  'in_minutes',
  'departed',
  'off_route',
);

const methodArb = fc.constantFrom(
  ARRIVAL_METHODS.ROUTE_SHAPE,
  ARRIVAL_METHODS.STOP_SEGMENTS,
  ARRIVAL_METHODS.ROUTE_PROJECTION,
  ARRIVAL_METHODS.OFF_ROUTE,
  ARRIVAL_METHODS.FALLBACK,
);

const gpsResultArb = (
  confidence: fc.Arbitrary<ConfidenceLevel> = confidenceArb,
): fc.Arbitrary<ArrivalTimeResult> =>
  fc.record({
    vehicleId: fc.integer({ min: 1, max: 100000 }),
    estimatedMinutes: fc.integer({ min: 0, max: 120 }),
    status: statusArb,
    statusMessage: fc.string(),
    confidence,
    calculationMethod: methodArb,
    rawDistance: fc.double({ min: 0, max: 50000, noNaN: true }),
  });

// Current wall-clock time as minutes-since-midnight (0..1439).
const nowArb = fc.integer({ min: 0, max: 1439 });

// Scheduled arrival as minutes-since-midnight, allowing overnight values >1440.
const scheduledArrivalArb = fc.integer({ min: 0, max: 1440 + 720 });

// Fresh GPS age: 0..STALE inclusive (boundary is treated as fresh).
const freshAgeArb = fc.integer({ min: 0, max: GPS_STALE_ETA_FALLBACK_MS });
// Stale GPS age: strictly greater than the threshold.
const staleAgeArb = fc.integer({
  min: GPS_STALE_ETA_FALLBACK_MS + 1,
  max: GPS_STALE_ETA_FALLBACK_MS + 60 * 60 * 1000,
});
// Any GPS age (fresh or stale).
const anyAgeArb = fc.oneof(freshAgeArb, staleAgeArb);

const expectedScheduleEta = (scheduled: number, now: number): number => {
  const delta = scheduled - now;
  return delta > 0 ? delta : 0;
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Property 5: ETA source selection', () => {
  // Case (c): trip not in schedule → GPS unchanged --------------------------
  it('returns the GPS result unchanged (additive fields only) when no scheduled arrival exists', () => {
    fc.assert(
      fc.property(gpsResultArb(), anyAgeArb, nowArb, (gps, gpsAgeMs, now) => {
        const result = enhanceArrivalWithSchedule(gps, {
          scheduledArrivalMinutes: null,
          gpsAgeMs,
          nowMinutesSinceMidnight: now,
        });

        expect(result.etaSource).toBe('gps');
        // Core GPS fields are preserved exactly.
        expect(result.estimatedMinutes).toBe(gps.estimatedMinutes);
        expect(result.confidence).toBe(gps.confidence);
        expect(result.statusMessage).toBe(gps.statusMessage);
        expect(result.status).toBe(gps.status);
        // Additive fields.
        expect(result.scheduleEtaMinutes).toBeNull();
        expect(result.gpsEtaMinutes).toBe(gps.estimatedMinutes);
      }),
      { numRuns: 200 },
    );
  }, 60000);

  // Case (a): GPS fresh → GPS primary, schedule as reference ----------------
  it('keeps GPS primary with schedule as reference when GPS is fresh', () => {
    fc.assert(
      fc.property(
        gpsResultArb(),
        freshAgeArb,
        scheduledArrivalArb,
        nowArb,
        (gps, gpsAgeMs, scheduled, now) => {
          const result = enhanceArrivalWithSchedule(gps, {
            scheduledArrivalMinutes: scheduled,
            gpsAgeMs,
            nowMinutesSinceMidnight: now,
          });

          expect(result.etaSource).toBe('gps');
          // GPS value remains primary and confidence is untouched.
          expect(result.estimatedMinutes).toBe(gps.estimatedMinutes);
          expect(result.confidence).toBe(gps.confidence);
          expect(result.gpsEtaMinutes).toBe(gps.estimatedMinutes);
          // Schedule is retained only as a (non-negative) reference.
          expect(result.scheduleEtaMinutes).toBe(expectedScheduleEta(scheduled, now));
        },
      ),
      { numRuns: 200 },
    );
  }, 60000);

  // Case (b): GPS stale → schedule primary, lower confidence ----------------
  it('uses schedule as primary with downgraded confidence when GPS is stale', () => {
    fc.assert(
      fc.property(
        gpsResultArb(),
        staleAgeArb,
        scheduledArrivalArb,
        nowArb,
        (gps, gpsAgeMs, scheduled, now) => {
          const result = enhanceArrivalWithSchedule(gps, {
            scheduledArrivalMinutes: scheduled,
            gpsAgeMs,
            nowMinutesSinceMidnight: now,
          });

          const scheduleEta = expectedScheduleEta(scheduled, now);

          expect(result.etaSource).toBe('schedule');
          // Schedule value becomes the primary ETA.
          expect(result.estimatedMinutes).toBe(scheduleEta);
          expect(result.scheduleEtaMinutes).toBe(scheduleEta);
          // GPS is retained as a reference.
          expect(result.gpsEtaMinutes).toBe(gps.estimatedMinutes);
          // Confidence is downgraded exactly one step (never above original).
          expect(result.confidence).toBe(downgradeConfidence(gps.confidence));
          expect(compareConfidence(result.confidence, gps.confidence)).toBeLessThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  }, 60000);

  // Strict-lower-confidence relationship (Requirement 5.4) ------------------
  it('assigns schedule-primary strictly lower confidence than GPS-primary for high/medium GPS confidence', () => {
    fc.assert(
      fc.property(
        gpsResultArb(downgradableConfidenceArb),
        freshAgeArb,
        staleAgeArb,
        scheduledArrivalArb,
        nowArb,
        (gps, freshAge, staleAge, scheduled, now) => {
          const fresh = enhanceArrivalWithSchedule(gps, {
            scheduledArrivalMinutes: scheduled,
            gpsAgeMs: freshAge,
            nowMinutesSinceMidnight: now,
          });
          const stale = enhanceArrivalWithSchedule(gps, {
            scheduledArrivalMinutes: scheduled,
            gpsAgeMs: staleAge,
            nowMinutesSinceMidnight: now,
          });

          expect(fresh.etaSource).toBe('gps');
          expect(stale.etaSource).toBe('schedule');
          // GPS confidence in {high, medium} downgrades to a strictly lower level.
          expect(compareConfidence(stale.confidence, fresh.confidence)).toBeLessThan(0);
        },
      ),
      { numRuns: 200 },
    );
  }, 60000);

  // Boundary: GPS already 'low' floors at 'low' (accepted boundary case) ----
  it('floors schedule-primary confidence at low when GPS confidence is already low', () => {
    fc.assert(
      fc.property(
        gpsResultArb(fc.constant(CONFIDENCE_LEVELS.LOW)),
        staleAgeArb,
        scheduledArrivalArb,
        nowArb,
        (gps, gpsAgeMs, scheduled, now) => {
          const result = enhanceArrivalWithSchedule(gps, {
            scheduledArrivalMinutes: scheduled,
            gpsAgeMs,
            nowMinutesSinceMidnight: now,
          });

          expect(result.etaSource).toBe('schedule');
          expect(result.confidence).toBe(CONFIDENCE_LEVELS.LOW);
          // Not strictly lower, but never higher than the original.
          expect(compareConfidence(result.confidence, gps.confidence)).toBeLessThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);

  // Primary ETA is always non-negative across all branches ------------------
  it('always produces a non-negative primary ETA', () => {
    fc.assert(
      fc.property(
        gpsResultArb(),
        anyAgeArb,
        fc.option(scheduledArrivalArb, { nil: null }),
        nowArb,
        (gps, gpsAgeMs, scheduled, now) => {
          const result = enhanceArrivalWithSchedule(gps, {
            scheduledArrivalMinutes: scheduled,
            gpsAgeMs,
            nowMinutesSinceMidnight: now,
          });
          expect(result.estimatedMinutes).toBeGreaterThanOrEqual(0);
          if (result.scheduleEtaMinutes !== null) {
            expect(result.scheduleEtaMinutes).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  }, 60000);
});
