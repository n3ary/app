// Resolve live observations against the static-trip index. Pure: no IO. Caller owns the active-trips snapshot.

import type { LiveVehicleObservation } from '$lib/data/live/gtfsRtClient';
import { minutesToTime } from './pipeline/timeUtils';
import type { Vehicle } from './types';

type ActiveTripIndex = ReadonlyMap<string, { directionId: 0 | 1; tripStartMin: number }>;

// tripId → {direction, startMin}, from the active-trips the worker fetches per tick.
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
