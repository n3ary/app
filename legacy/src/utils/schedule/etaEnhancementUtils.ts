/**
 * Schedule-enhanced ETA selection for GTFS schedule integration.
 *
 * This is a pure, store-free module that layers scheduled arrival times on top
 * of the existing GPS-based {@link ArrivalTimeResult}. It implements the design
 * document's Correctness Property 5 ("ETA source selection"):
 *
 *   (a) GPS fresh + scheduled arrival exists  → GPS primary, schedule as reference
 *   (b) GPS stale (exceeds GPS_DATA_AGE_THRESHOLDS) → scheduled arrival primary,
 *       with strictly lower confidence than the GPS-primary estimate
 *   (c) trip_id not in schedule data → return GPS-based ETA unchanged
 *
 * In all cases a schedule-based primary ETA carries strictly lower confidence
 * than the corresponding GPS-based primary ETA (see {@link downgradeConfidence}).
 *
 * The function is intentionally decoupled from `scheduleStore`: callers resolve
 * the scheduled arrival (via `scheduleStore.getScheduledArrival`) and the GPS
 * age, then pass primitives here. This keeps the selection logic pure and
 * independently testable (the integration wiring lives in a separate task).
 *
 * ## Graceful degradation
 *
 * When `scheduledArrivalMinutes` is `null` (trip/stop absent from the schedule,
 * or schedule data unavailable), the original GPS result is returned untouched
 * aside from the additive `etaSource`/reference fields — matching existing
 * GPS-only behavior (design "Graceful degradation").
 */

import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '../core/stringConstants';
import { GPS_DATA_AGE_THRESHOLDS } from '../core/constants';
import { generateStatusMessage } from '../arrival/statusUtils';
import type { ArrivalTimeResult } from '../../types/arrivalTime';

/** Which source the primary `estimatedMinutes` value is derived from. */
export type EtaSource = 'gps' | 'schedule';

/**
 * GPS age (ms) at which the schedule becomes the primary ETA source. The GPS
 * estimate is considered too stale to trust once its age *exceeds* the
 * very-stale boundary (`GPS_DATA_AGE_THRESHOLDS.STALE`). Below this, the
 * real-time GPS estimate remains primary and the schedule is shown only as a
 * reference (Requirements 5.2, 5.3).
 */
export const GPS_STALE_ETA_FALLBACK_MS: number = GPS_DATA_AGE_THRESHOLDS.STALE;

/**
 * An {@link ArrivalTimeResult} augmented with schedule context. All original
 * fields are preserved; the new fields are additive so existing consumers keep
 * working unchanged.
 */
export interface ScheduleEnhancedArrival extends ArrivalTimeResult {
  /** Whether the primary `estimatedMinutes` comes from GPS or the schedule. */
  etaSource: EtaSource;
  /**
   * GPS-derived ETA in minutes-from-now, always retained. Equals
   * `estimatedMinutes` when GPS is primary; kept as a reference when the
   * schedule is primary.
   */
  gpsEtaMinutes: number;
  /**
   * Schedule-derived ETA in minutes-from-now, or `null` when no scheduled
   * arrival is available for the trip/stop. Equals `estimatedMinutes` when the
   * schedule is primary; otherwise a reference value alongside the GPS ETA.
   */
  scheduleEtaMinutes: number | null;
}

/** Inputs needed to layer scheduled arrival data onto a GPS-based ETA. */
export interface ScheduleEtaInputs {
  /**
   * Scheduled arrival at the target stop, encoded as minutes-since-midnight
   * (may exceed 1440 for overnight trips). `null` when the trip/stop is not in
   * the schedule data, which triggers the GPS-only passthrough (case c).
   */
  scheduledArrivalMinutes: number | null;
  /** Age of the vehicle's GPS timestamp, in milliseconds. Negative values are treated as 0. */
  gpsAgeMs: number;
  /** Current wall-clock time as minutes-since-midnight (0–1439). */
  nowMinutesSinceMidnight: number;
  /**
   * Optional override of the staleness boundary (ms). Defaults to
   * {@link GPS_STALE_ETA_FALLBACK_MS}. Exposed mainly for testing.
   */
  staleThresholdMs?: number;
}

/** Numeric ranking of confidence levels (higher = more confident). */
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  [CONFIDENCE_LEVELS.HIGH]: 3,
  [CONFIDENCE_LEVELS.MEDIUM]: 2,
  [CONFIDENCE_LEVELS.LOW]: 1,
};

/**
 * Compare two confidence levels. Returns a negative number when `a` is less
 * confident than `b`, positive when more confident, and 0 when equal.
 */
export function compareConfidence(a: ConfidenceLevel, b: ConfidenceLevel): number {
  return CONFIDENCE_RANK[a] - CONFIDENCE_RANK[b];
}

/**
 * Lower a confidence level by exactly one step so a schedule-based primary ETA
 * reads as less trustworthy than the GPS-based estimate it replaces:
 * `high → medium`, `medium → low`. `low` is the floor and stays `low` (the
 * three-level scale has no lower value), so a schedule-primary ETA is strictly
 * lower-confidence than its GPS-primary counterpart whenever the GPS confidence
 * is above the minimum.
 */
export function downgradeConfidence(confidence: ConfidenceLevel): ConfidenceLevel {
  switch (confidence) {
    case CONFIDENCE_LEVELS.HIGH:
      return CONFIDENCE_LEVELS.MEDIUM;
    case CONFIDENCE_LEVELS.MEDIUM:
      return CONFIDENCE_LEVELS.LOW;
    case CONFIDENCE_LEVELS.LOW:
    default:
      return CONFIDENCE_LEVELS.LOW;
  }
}

/**
 * Whether the GPS estimate is too stale to remain the primary ETA source.
 * @param gpsAgeMs Age of the GPS timestamp in milliseconds.
 * @param staleThresholdMs Boundary (defaults to {@link GPS_STALE_ETA_FALLBACK_MS}).
 */
export function isGpsStaleForEta(
  gpsAgeMs: number,
  staleThresholdMs: number = GPS_STALE_ETA_FALLBACK_MS,
): boolean {
  return gpsAgeMs > staleThresholdMs;
}

/**
 * Convert a scheduled arrival (minutes-since-midnight) into a non-negative
 * minutes-from-now ETA relative to the current time. Past scheduled times clamp
 * to 0 (the vehicle is due/overdue), keeping the result consistent with
 * `ArrivalTimeResult.estimatedMinutes` being "always positive".
 */
function scheduleArrivalToEtaMinutes(
  scheduledArrivalMinutes: number,
  nowMinutesSinceMidnight: number,
): number {
  const delta = scheduledArrivalMinutes - nowMinutesSinceMidnight;
  return delta > 0 ? delta : 0;
}

/**
 * Enhance a GPS-based arrival result with scheduled-arrival data, selecting the
 * primary ETA source per design Property 5.
 *
 * @param gpsResult The existing GPS-derived arrival result (unchanged input).
 * @param inputs Scheduled arrival, GPS age, and current time.
 * @returns A {@link ScheduleEnhancedArrival}. When no scheduled arrival is
 *   available, this is the original result with `etaSource: 'gps'`,
 *   `scheduleEtaMinutes: null`, and `gpsEtaMinutes` mirroring `estimatedMinutes`.
 */
export function enhanceArrivalWithSchedule(
  gpsResult: ArrivalTimeResult,
  inputs: ScheduleEtaInputs,
): ScheduleEnhancedArrival {
  const {
    scheduledArrivalMinutes,
    gpsAgeMs,
    nowMinutesSinceMidnight,
    staleThresholdMs = GPS_STALE_ETA_FALLBACK_MS,
  } = inputs;

  const gpsEtaMinutes = gpsResult.estimatedMinutes;

  // Case (c): trip/stop not in schedule data → GPS ETA unchanged (additive only).
  if (scheduledArrivalMinutes === null) {
    return {
      ...gpsResult,
      etaSource: 'gps',
      gpsEtaMinutes,
      scheduleEtaMinutes: null,
    };
  }

  const scheduleEtaMinutes = scheduleArrivalToEtaMinutes(
    scheduledArrivalMinutes,
    nowMinutesSinceMidnight,
  );

  // Case (a): GPS fresh enough → GPS primary, schedule retained as reference.
  if (!isGpsStaleForEta(gpsAgeMs, staleThresholdMs)) {
    return {
      ...gpsResult,
      etaSource: 'gps',
      gpsEtaMinutes,
      scheduleEtaMinutes,
    };
  }

  // Case (b): GPS stale → schedule primary, with strictly lower confidence.
  const scheduleConfidence = downgradeConfidence(gpsResult.confidence);
  return {
    ...gpsResult,
    estimatedMinutes: scheduleEtaMinutes,
    confidence: scheduleConfidence,
    // Re-derive the human-friendly message so it reflects the schedule ETA.
    statusMessage: generateStatusMessage(gpsResult.status, scheduleEtaMinutes),
    etaSource: 'schedule',
    gpsEtaMinutes,
    scheduleEtaMinutes,
  };
}
