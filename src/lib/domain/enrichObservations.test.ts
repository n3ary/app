import { describe, expect, it } from 'vitest';
import { enrichObservations, indexActiveTripsByTripId } from './enrichObservations';
import { quirksForFeed } from './feedQuirks';
import type { LiveVehicleObservation } from '$lib/data/live/gtfsRtClient';
import type { Route, Vehicle } from './types';

const r14: Route = { id: '14', shortName: '14', color: '#ff0000' };

function sched(opts: {
  tripId: string;
  directionId: 0 | 1;
  tripStartMin: number;
}): Vehicle {
  return {
    kind: 'scheduled',
    id: `trip:${opts.tripId}`,
    route: r14,
    type: 'bus',
    tripId: opts.tripId,
    directionId: opts.directionId,
    confidence: 'low',
    schedule: {
      tripId: opts.tripId,
      scheduledDeparture: opts.tripStartMin,
      directionId: opts.directionId,
      tripStartMin: opts.tripStartMin,
    },
    eta: { distanceMeters: 0, minutes: 3, confidence: 'low' },
  } as Vehicle;
}

function obs(opts: Partial<LiveVehicleObservation> & { tripId: string }): LiveVehicleObservation {
  return {
    source: 'gtfs-rt',
    vehicleId: `v-${opts.tripId}`,
    tripId: opts.tripId,
    routeId: opts.routeId ?? '14',
    directionId: opts.directionId ?? 0,
    startTime: opts.startTime ?? '',
    lat: 46.77,
    lon: 23.62,
    bearing: null,
    speedMs: null,
    currentStatus: null,
    nextStopId: null,
    asOfMs: opts.asOfMs ?? 0,
  };
}

describe('indexActiveTripsByTripId', () => {
  it('keeps only entries with a tripId, valid direction, and tripStartMin', () => {
    const idx = indexActiveTripsByTripId([
      sched({ tripId: 'A', directionId: 0, tripStartMin: 10 * 60 }),
      sched({ tripId: 'B', directionId: 1, tripStartMin: 11 * 60 }),
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get('A')).toEqual({ directionId: 0, tripStartMin: 600 });
  });
});

describe('enrichObservations — static-feed first', () => {
  const active = [
    sched({ tripId: 'A', directionId: 1, tripStartMin: 14 * 60 + 23 }),
    sched({ tripId: 'B', directionId: 0, tripStartMin: 15 * 60 + 7 }),
  ];

  it("uses static-feed direction + start_time when obs.tripId is in active", () => {
    // The feed reports direction=0 (Cluj-style broken) and no
    // start_time; enrichment should overwrite both with authoritative
    // values from the active set.
    const out = enrichObservations(
      [obs({ tripId: 'A', directionId: 0, startTime: '' })],
      active,
    );
    expect(out[0].directionId).toBe(1);
    expect(out[0].startTime).toBe('14:23:00');
  });

  it('overrides even a non-broken canonical field — static is authoritative', () => {
    const out = enrichObservations(
      [obs({ tripId: 'A', directionId: 0, startTime: '99:99:00' })],
      active,
    );
    expect(out[0].directionId).toBe(1);
    expect(out[0].startTime).toBe('14:23:00');
  });

  it('does not call into quirks for matched trips', () => {
    // Cluj quirks would have derived dir=1 from `A_1_X_Y_1234`, but
    // here we use static feed instead — and the trip_id has a
    // mismatched-on-purpose pattern to prove it.
    const out = enrichObservations(
      [obs({ tripId: 'A', directionId: 0 })], // tripId 'A' has no quirk-parseable pattern
      active,
      quirksForFeed('cluj-napoca'),
    );
    expect(out[0].directionId).toBe(1); // from static, not from quirks
  });
});

describe('enrichObservations — orphan fallback', () => {
  it('applies quirks when trip is NOT in active set', () => {
    // No active trips at all, so every obs goes through the orphan path.
    const out = enrichObservations(
      [obs({ tripId: '14_1_LV_99_1423', directionId: 0, startTime: '' })],
      [],
      quirksForFeed('cluj-napoca'),
    );
    expect(out[0].directionId).toBe(1); // from quirks regex
    expect(out[0].startTime).toBe('14:23:00');
  });

  it('without quirks, leaves canonical fields untouched', () => {
    const out = enrichObservations(
      [obs({ tripId: '14_1_LV_99_1423', directionId: 0, startTime: '' })],
      [],
    );
    expect(out[0].directionId).toBe(0);
    expect(out[0].startTime).toBe('');
  });

  it('preserves a feed-provided startTime even when quirks could synthesise one', () => {
    // If the feed actually provided start_time, trust it over the
    // quirks-derived value (canonical > derived for any single field).
    const out = enrichObservations(
      [obs({ tripId: '14_1_LV_99_1423', startTime: '10:00:00' })],
      [],
      quirksForFeed('cluj-napoca'),
    );
    expect(out[0].startTime).toBe('10:00:00');
  });

  it('returns the original obs when no derivation is possible', () => {
    const o = obs({ tripId: 'opaque-orphan' });
    const out = enrichObservations([o], [], quirksForFeed('cluj-napoca'));
    expect(out[0]).toBe(o); // same reference: no allocation when nothing changed
  });
});
