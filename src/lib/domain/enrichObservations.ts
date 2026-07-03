/*
 * Enrich live observations with authoritative scheduled-trip data.
 *
 * Runs after the RT parse and before the reconciler. For each observation:
 *
 *   1. If `obs.tripId` matches an active scheduled trip, copy
 *      `directionId` and `startTime` from the static feed. This is the
 *      hot path — when the RT feed publishes the same trip_id space
 *      as the static feed, the lookup fires for the vast majority of
 *      observations.
 *   2. Otherwise (orphan, deadhead, build skew, fix-up run) leave the
 *      canonical RT fields as-is. Downstream the observation becomes
 *      unmatched / gps-only.
 *
 * Historical note: an earlier pass kept a per-feed trip_id parser here
 * as a fallback for RT feeds whose operators publish broken `direction_id`
 * or missing `start_time`. That fallback was feed-specific (keyed by
 * `feed.id`) and so violated this repo's feed-agnostic standard
 * (`docs/standards/feed-agnostic.md`). The proper home for those
 * recovers is the producer (neary-gtfs): if it can pre-resolve
 * `direction_id` / `start_time` upstream before they hit the browser,
 * every consumer gets them for free and this module stays generic.
 *
 * Pure function: no IO, no DB access. Caller owns the active-trips
 * snapshot (already fetched per tick by `livePipeline.tickLive` for
 * the reconciler).
 */

import type { LiveVehicleObservation } from '$lib/data/live/gtfsRtClient';
import { minutesToTime } from './pipeline/timeUtils';
import type { Vehicle } from './types';

type ActiveTripIndex = ReadonlyMap<string, { directionId: 0 | 1; tripStartMin: number }>;

/** Build a tripId → {direction, startMin} index from the active-trips
 *  list the worker already fetches per tick. Cheap; size scales with
 *  the active cohort (a few hundred entries on a typical urban feed). */
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

/** Enrich a list of observations using the static feed's active-trips
 *  index. Observations whose `tripId` isn't in the index flow through
 *  unchanged — the reconciler treats them as orphans. */
export function enrichObservations(
  observations: readonly LiveVehicleObservation[],
  active: readonly Vehicle[],
): LiveVehicleObservation[] {
  const byTripId = indexActiveTripsByTripId(active);
  return observations.map((obs) => enrichOne(obs, byTripId));
}

function enrichOne(
  obs: LiveVehicleObservation,
  byTripId: ActiveTripIndex,
): LiveVehicleObservation {
  const sched = obs.tripId ? byTripId.get(obs.tripId) : undefined;
  if (sched) {
    return {
      ...obs,
      directionId: sched.directionId,
      startTime: minutesToTime(sched.tripStartMin),
    };
  }
  return obs;
}
