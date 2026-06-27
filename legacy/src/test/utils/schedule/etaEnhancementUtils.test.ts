import { describe, it, expect } from 'vitest';
import {
  enhanceArrivalWithSchedule,
  downgradeConfidence,
  isGpsStaleForEta,
  compareConfidence,
  GPS_STALE_ETA_FALLBACK_MS,
} from '../../../utils/schedule/etaEnhancementUtils';
import { CONFIDENCE_LEVELS } from '../../../utils/core/stringConstants';
import { GPS_DATA_AGE_THRESHOLDS } from '../../../utils/core/constants';
import type { ArrivalTimeResult } from '../../../types/arrivalTime';

// Minimal GPS-based arrival result builder ---------------------------------

function makeGpsResult(
  overrides: Partial<ArrivalTimeResult> = {},
): ArrivalTimeResult {
  return {
    vehicleId: 1,
    estimatedMinutes: 10,
    status: 'in_minutes',
    statusMessage: 'In 10 minutes',
    confidence: CONFIDENCE_LEVELS.HIGH,
    calculationMethod: 'route_shape',
    rawDistance: 1200,
    ...overrides,
  };
}

const NOW = 8 * 60; // 08:00 → 480 minutes since midnight
const FRESH_AGE = 0;
const STALE_AGE = GPS_DATA_AGE_THRESHOLDS.STALE + 1; // exceeds boundary

describe('isGpsStaleForEta', () => {
  it('treats ages at or below the threshold as fresh', () => {
    expect(isGpsStaleForEta(0)).toBe(false);
    expect(isGpsStaleForEta(GPS_STALE_ETA_FALLBACK_MS)).toBe(false);
  });

  it('treats ages exceeding the threshold as stale', () => {
    expect(isGpsStaleForEta(GPS_STALE_ETA_FALLBACK_MS + 1)).toBe(true);
  });
});

describe('downgradeConfidence', () => {
  it('lowers high→medium and medium→low', () => {
    expect(downgradeConfidence(CONFIDENCE_LEVELS.HIGH)).toBe(CONFIDENCE_LEVELS.MEDIUM);
    expect(downgradeConfidence(CONFIDENCE_LEVELS.MEDIUM)).toBe(CONFIDENCE_LEVELS.LOW);
  });

  it('floors at low (no lower level on a three-level scale)', () => {
    expect(downgradeConfidence(CONFIDENCE_LEVELS.LOW)).toBe(CONFIDENCE_LEVELS.LOW);
  });
});

describe('enhanceArrivalWithSchedule', () => {
  // Case (c): trip not in schedule -----------------------------------------
  it('returns the GPS ETA unchanged when no scheduled arrival exists', () => {
    const gps = makeGpsResult();
    const result = enhanceArrivalWithSchedule(gps, {
      scheduledArrivalMinutes: null,
      gpsAgeMs: STALE_AGE, // even when stale, no schedule → GPS unchanged
      nowMinutesSinceMidnight: NOW,
    });

    expect(result.etaSource).toBe('gps');
    expect(result.estimatedMinutes).toBe(gps.estimatedMinutes);
    expect(result.confidence).toBe(gps.confidence);
    expect(result.statusMessage).toBe(gps.statusMessage);
    expect(result.scheduleEtaMinutes).toBeNull();
    expect(result.gpsEtaMinutes).toBe(gps.estimatedMinutes);
  });

  // Case (a): GPS fresh -----------------------------------------------------
  it('keeps GPS primary and exposes schedule as a reference when GPS is fresh', () => {
    const gps = makeGpsResult({ estimatedMinutes: 10 });
    const result = enhanceArrivalWithSchedule(gps, {
      scheduledArrivalMinutes: NOW + 6, // schedule says 6 min from now
      gpsAgeMs: FRESH_AGE,
      nowMinutesSinceMidnight: NOW,
    });

    expect(result.etaSource).toBe('gps');
    expect(result.estimatedMinutes).toBe(10); // GPS primary
    expect(result.confidence).toBe(CONFIDENCE_LEVELS.HIGH);
    expect(result.gpsEtaMinutes).toBe(10);
    expect(result.scheduleEtaMinutes).toBe(6); // reference
  });

  // Case (b): GPS stale -----------------------------------------------------
  it('falls back to schedule primary with lower confidence when GPS is stale', () => {
    const gps = makeGpsResult({ estimatedMinutes: 10, confidence: CONFIDENCE_LEVELS.HIGH });
    const result = enhanceArrivalWithSchedule(gps, {
      scheduledArrivalMinutes: NOW + 6,
      gpsAgeMs: STALE_AGE,
      nowMinutesSinceMidnight: NOW,
    });

    expect(result.etaSource).toBe('schedule');
    expect(result.estimatedMinutes).toBe(6); // schedule primary
    expect(result.confidence).toBe(CONFIDENCE_LEVELS.MEDIUM); // strictly lower than high
    expect(result.statusMessage).toBe('In 6 minutes'); // re-derived for schedule ETA
    expect(result.gpsEtaMinutes).toBe(10); // GPS retained as reference
    expect(result.scheduleEtaMinutes).toBe(6);
  });

  it('clamps past scheduled arrivals to a non-negative ETA', () => {
    const gps = makeGpsResult();
    const result = enhanceArrivalWithSchedule(gps, {
      scheduledArrivalMinutes: NOW - 5, // 5 minutes in the past
      gpsAgeMs: STALE_AGE,
      nowMinutesSinceMidnight: NOW,
    });

    expect(result.etaSource).toBe('schedule');
    expect(result.estimatedMinutes).toBe(0);
    expect(result.scheduleEtaMinutes).toBe(0);
  });

  it('handles overnight scheduled arrivals (minutes ≥ 1440) near midnight', () => {
    const gps = makeGpsResult();
    const nearMidnight = 23 * 60 + 50; // 23:50 → 1430
    const result = enhanceArrivalWithSchedule(gps, {
      scheduledArrivalMinutes: 24 * 60 + 5, // 00:05 next day → 1445
      gpsAgeMs: STALE_AGE,
      nowMinutesSinceMidnight: nearMidnight,
    });

    expect(result.scheduleEtaMinutes).toBe(15);
  });

  // Strict-lower-confidence invariant (design Property 5) -------------------
  it('assigns schedule-primary strictly lower confidence than GPS-primary for high/medium GPS', () => {
    for (const confidence of [CONFIDENCE_LEVELS.HIGH, CONFIDENCE_LEVELS.MEDIUM] as const) {
      const gps = makeGpsResult({ confidence });
      const fresh = enhanceArrivalWithSchedule(gps, {
        scheduledArrivalMinutes: NOW + 6,
        gpsAgeMs: FRESH_AGE,
        nowMinutesSinceMidnight: NOW,
      });
      const stale = enhanceArrivalWithSchedule(gps, {
        scheduledArrivalMinutes: NOW + 6,
        gpsAgeMs: STALE_AGE,
        nowMinutesSinceMidnight: NOW,
      });

      expect(fresh.etaSource).toBe('gps');
      expect(stale.etaSource).toBe('schedule');
      // schedule-primary confidence strictly lower than GPS-primary confidence
      expect(compareConfidence(stale.confidence, fresh.confidence)).toBeLessThan(0);
    }
  });

  it('does not mutate the input GPS result', () => {
    const gps = makeGpsResult({ estimatedMinutes: 10 });
    enhanceArrivalWithSchedule(gps, {
      scheduledArrivalMinutes: NOW + 6,
      gpsAgeMs: STALE_AGE,
      nowMinutesSinceMidnight: NOW,
    });
    expect(gps.estimatedMinutes).toBe(10);
    expect(gps.confidence).toBe(CONFIDENCE_LEVELS.HIGH);
  });
});
