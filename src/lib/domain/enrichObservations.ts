/*
 * Enrich live observations with authoritative scheduled-trip data.
 *
 * Runs after the RT parse and before the reconciler. For each observation:
 *
 *   1. If `obs.tripId` matches an active scheduled trip, copy
 *      `directionId` and `startTime` from the static feed. This is the
 *      hot path — for Cluj's RT feed, ~77% of observations carry a
 *      trip_id that matches a static row, so this branch fires for
 *      the vast majority.
 *   2. Otherwise (the trip isn't in the active set — orphan, deadhead,
 *      build skew, fix-up run), apply the feed's quirks regex on the
 *      trip_id to derive the same two fields. This is the only place
 *      the codebase reads trip_id substrings outside the debug display.
 *   3. If neither step yields a value, leave the canonical RT fields
 *      as-is; downstream the observation becomes unmatched.
 *
 * Why this split: the canonical static-feed values are authoritative;
 * the regex is a last resort that exists only because some operators
 * (Cluj) publish RT feeds with broken `direction_id` and missing
 * `start_time`. Putting the SQL-backed lookup first means the regex
 * runs only on the ~10-40 orphan observations per tick instead of all
 * 50-150, and the producer-specific knowledge is exercised only when
 * the static feed genuinely can't help.
 *
 * Pure function: no IO, no DB access. Caller owns the active-trips
 * snapshot (already fetched per tick by `livePipeline.tickLive` for
 * the reconciler).
 */

import type { LiveVehicleObservation } from '$lib/data/live/gtfsRtClient';
import { minutesToTime } from './pipeline/timeUtils';
import type { Vehicle } from './types';
import {
  deriveDirection,
  deriveStartTime,
  type FeedRtQuirks,
} from './feedQuirks';

type ActiveTripIndex = ReadonlyMap<string, { directionId: 0 | 1; tripStartMin: number }>;

/** Build a tripId → {direction, startMin} index from the active-trips
 *  list the worker already fetches per tick. Cheap; ~500 entries for
 *  Cluj. */
export function indexActiveTripsByTripId(active: readonly Vehicle[]): ActiveTripIndex {
  const out = new Map<string, { directionId: 0 | 1; tripStartMin: number }>();
  for (const v of active) {
    if (!v.tripId) continue;
    const dir = v.schedule?.directionId;
    const start = v.schedule?.tripStartMin;
    if ((dir !== 0 && dir !== 1) || typeof start !== 'number') continue;
    out.set(v.tripId, { directionId: dir, tripStartMin: start });
  }
  return out;
}

/** Enrich a list of observations using the static feed first, falling
 *  back to per-feed trip_id quirks for orphans. */
export function enrichObservations(
  observations: readonly LiveVehicleObservation[],
  active: readonly Vehicle[],
  quirks: FeedRtQuirks = {},
): LiveVehicleObservation[] {
  const byTripId = indexActiveTripsByTripId(active);
  return observations.map((obs) => enrichOne(obs, byTripId, quirks));
}

function enrichOne(
  obs: LiveVehicleObservation,
  byTripId: ActiveTripIndex,
  quirks: FeedRtQuirks,
): LiveVehicleObservation {
  // Hot path: trip is in the active set. Use static-feed values.
  const sched = obs.tripId ? byTripId.get(obs.tripId) : undefined;
  if (sched) {
    return {
      ...obs,
      directionId: sched.directionId,
      startTime: minutesToTime(sched.tripStartMin),
    };
  }
  // Orphan path: SQL can't help; try the feed's quirks. The canonical
  // RT fields stay as fallback when the quirk doesn't fire either.
  const derivedDir = deriveDirection(quirks, obs.tripId);
  const derivedStart = deriveStartTime(quirks, obs.tripId);
  if (derivedDir == null && !derivedStart) return obs; // nothing to add
  return {
    ...obs,
    directionId: derivedDir ?? obs.directionId,
    startTime: obs.startTime || derivedStart || '',
  };
}
