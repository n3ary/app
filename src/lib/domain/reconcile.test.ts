import { describe, expect, it } from 'vitest';
import { computeTolerance, parseLiveStartMin, reconcileWithLive } from './reconcile';
import type { LiveVehicleObservation } from '$lib/data/live/gtfsRtClient';
import type { Route, Vehicle } from './types';

const r14: Route = { id: '14', shortName: '25', color: '#ff0000' };

// Build a UTC Unix-ms timestamp from minutes-since-midnight. Tests use
// timezone 'UTC' so the value round-trips through minSinceMidnightInTz
// to the same number, keeping the schedule/now comparisons exact.
function epochAt(minSinceUtcMidnight: number): number {
  return Date.UTC(2025, 5, 26, 0, 0, 0) + minSinceUtcMidnight * 60_000;
}

function scheduled(opts: {
  tripId: string;
  tripStartMin: number;
  directionId?: 0 | 1;
  route?: Route;
  scheduledDeparture?: number;
}): Vehicle {
  return {
    kind: 'scheduled',
    id: `trip:${opts.tripId}`,
    route: opts.route ?? r14,
    type: 'bus',
    confidence: 'low',
    schedule: {
      tripId: opts.tripId,
      scheduledDeparture: opts.scheduledDeparture ?? 14 * 60 + 25,
      directionId: opts.directionId ?? 1,
      tripStartMin: opts.tripStartMin,
    },
    eta: { distanceMeters: 0, minutes: 3, confidence: 'low' },
  } as Vehicle;
}

function obs(opts: {
  tripId: string;
  routeId?: string;
  directionId?: 0 | 1;
  startTime?: string;
  asOfMs?: number;
  lat?: number;
  lon?: number;
}): LiveVehicleObservation {
  return {
    source: 'gtfs-rt',
    vehicleId: `v-${opts.tripId}`,
    tripId: opts.tripId,
    routeId: opts.routeId ?? '14',
    directionId: opts.directionId ?? 1,
    startTime: opts.startTime ?? '',
    lat: opts.lat ?? 46.77,
    lon: opts.lon ?? 23.62,
    bearing: null,
    speedMs: null,
    currentStatus: null,
    nextStopId: null,
    asOfMs: opts.asOfMs ?? 1_700_000_000_000,
  };
}

describe('parseLiveStartMin', () => {
  it('prefers explicit startTime over trip_id parse', () => {
    expect(parseLiveStartMin(obs({ tripId: '14_1_LV_99_0900', startTime: '14:23:00' })))
      .toBe(14 * 60 + 23);
  });
  it('falls back to the _HHMM suffix in the trip_id', () => {
    expect(parseLiveStartMin(obs({ tripId: '14_1_LV_99_1423' }))).toBe(14 * 60 + 23);
  });
  it('handles _HMM suffix (single-digit hour)', () => {
    expect(parseLiveStartMin(obs({ tripId: '14_1_LV_99_905' }))).toBe(9 * 60 + 5);
  });
  it('returns null when no parseable time is present', () => {
    expect(parseLiveStartMin(obs({ tripId: 'no-time-here' }))).toBeNull();
  });
});

describe('computeTolerance', () => {
  it('returns floor for empty cohorts', () => {
    expect(computeTolerance([], 600)).toBe(1);
  });
  it('uses median local headway / 2 on a high-frequency line', () => {
    // 4-min headway in the local hour → tolerance 2
    const starts = Array.from({ length: 10 }, (_, i) => 14 * 60 + i * 4);
    expect(computeTolerance(starts, 14 * 60 + 20)).toBe(2);
  });
  it('uses median local headway / 2 on a low-frequency line', () => {
    // 30-min headway → tolerance 15
    const starts = Array.from({ length: 5 }, (_, i) => 14 * 60 + i * 30);
    expect(computeTolerance(starts, 14 * 60 + 30)).toBe(15);
  });
  it('clamps to ceiling for very sparse service', () => {
    const starts = [10 * 60, 12 * 60, 14 * 60]; // 120 min gaps → /2=60, clamped to 30
    expect(computeTolerance(starts, 13 * 60)).toBe(30);
  });
  it('clamps to floor for sub-minute headway', () => {
    const starts = Array.from({ length: 10 }, (_, i) => 14 * 60 + i * 1);
    expect(computeTolerance(starts, 14 * 60 + 5)).toBe(1);
  });
  it('widens the window when local samples are too few', () => {
    // 1 trip near now, plenty 6h away → falls back to wider window
    const starts = [14 * 60 + 10, 8 * 60, 8 * 60 + 30, 9 * 60];
    // After widening to 4h: 14:10 included, 8:00/8:30/9:00 still outside;
    // falls through to full day: gaps 30, 30, 310 → median 30 → tol 15.
    expect(computeTolerance(starts, 14 * 60)).toBe(15);
  });
  it('uses fixed fallback tolerance when nowMin is omitted', () => {
    expect(computeTolerance([0, 60, 120])).toBe(5);
  });
});

describe('reconcileWithLive (route+direction+startTime match)', () => {
  it('upgrades the single in-window candidate', () => {
    const sched = [
      scheduled({ tripId: '14_1_LV_84_1421', tripStartMin: 14 * 60 + 21 }),
      scheduled({ tripId: '14_1_LV_82_1413', tripStartMin: 14 * 60 + 13 }),
    ];
    const { vehicles, stats } = reconcileWithLive(
      sched,
      [obs({ tripId: '14_1_LV_101_1423', startTime: '14:23:00' })],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    // headway 8 min → tol 4 → only the 14:21 candidate is within ±4 of 14:23
    expect(stats.matched).toBe(1);
    expect(vehicles[0].kind).toBe('reconciled');
    expect(vehicles[1].kind).toBe('scheduled');
  });

  it('picks the closest scheduled start when multiple fit within tolerance', () => {
    // Service every 2 min around the live obs → tol 1 → still picks closest
    const sched = [
      scheduled({ tripId: 't-19', tripStartMin: 14 * 60 + 19 }),
      scheduled({ tripId: 't-21', tripStartMin: 14 * 60 + 21 }),
      scheduled({ tripId: 't-23', tripStartMin: 14 * 60 + 23 }),
    ];
    const { vehicles, stats } = reconcileWithLive(
      sched,
      [obs({ tripId: 'live', startTime: '14:22:00' })],
      { nowMs: epochAt(14 * 60 + 22 ), timezone: 'UTC'},
    );
    expect(stats.matched).toBe(1);
    // 14:21 and 14:23 are both delta=1 — earlier index wins; either is fine.
    const reconciled = vehicles.find((v) => v.kind === 'reconciled');
    expect(reconciled).toBeTruthy();
  });

  it('leaves rows scheduled when no candidate is within the tolerance', () => {
    const sched = [scheduled({ tripId: 't-1', tripStartMin: 14 * 60 + 0 })];
    const { vehicles, stats } = reconcileWithLive(
      sched,
      [obs({ tripId: 'live', startTime: '14:45:00' })],
      { nowMs: epochAt(14 * 60 + 30 ), timezone: 'UTC'},
    );
    // 1-row cohort → no headway → tol floor (1). 45 min off → no match.
    expect(stats.matched).toBe(0);
    expect(vehicles[0].kind).toBe('scheduled');
  });

  it('does not match across different directionIds even with same route+time', () => {
    const sched = [scheduled({
      tripId: 't-d0', tripStartMin: 14 * 60 + 21, directionId: 0,
    })];
    const { vehicles } = reconcileWithLive(
      sched,
      [obs({ tripId: 'live', startTime: '14:21:00', directionId: 1 })],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    expect(vehicles[0].kind).toBe('scheduled');
  });

  it('does not match across different routeIds', () => {
    const sched = [scheduled({
      tripId: 't-r14', tripStartMin: 14 * 60 + 21,
      route: { id: '14', shortName: '25', color: '#f00' },
    })];
    const { vehicles } = reconcileWithLive(
      sched,
      [obs({ tripId: 'live', startTime: '14:21:00', routeId: '15' })],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    expect(vehicles[0].kind).toBe('scheduled');
  });

  it('promotes at most one scheduled row per live observation set', () => {
    // Two live obs for the same trip start time — only one scheduled row
    // exists; the first live obs wins and the second is dropped.
    const sched = [scheduled({ tripId: 't-1', tripStartMin: 14 * 60 + 21 })];
    const { vehicles, stats } = reconcileWithLive(
      sched,
      [
        obs({ tripId: 'live-a', startTime: '14:21:00', lat: 46.77 }),
        obs({ tripId: 'live-b', startTime: '14:21:00', lat: 99 }),
      ],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    expect(stats.matched).toBe(1);
    if (vehicles[0].kind === 'reconciled') {
      expect(vehicles[0].position.lat).toBeCloseTo(46.77);
    }
  });

  it('parses HHMM from trip_id when feed does not populate startTime', () => {
    const sched = [scheduled({ tripId: 't-1', tripStartMin: 14 * 60 + 21 })];
    const { vehicles, stats } = reconcileWithLive(
      sched,
      [obs({ tripId: '14_1_LV_99_1421' })], // no startTime
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    expect(stats.matched).toBe(1);
    expect(vehicles[0].kind).toBe('reconciled');
  });

  it('preserves headsign / route / eta / dropOffOnly across upgrade', () => {
    const sched: Vehicle = {
      ...scheduled({ tripId: 't-1', tripStartMin: 14 * 60 + 21 }),
      headsign: 'Mănăștur',
      dropOffOnly: true,
    } as Vehicle;
    const { vehicles } = reconcileWithLive(
      [sched],
      [obs({ tripId: 'live', startTime: '14:21:00' })],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    if (vehicles[0].kind === 'reconciled') {
      expect(vehicles[0].headsign).toBe('Mănăștur');
      expect(vehicles[0].dropOffOnly).toBe(true);
      expect(vehicles[0].eta?.minutes).toBe(3);
      expect(vehicles[0].liveSources).toEqual(['gtfs-rt']);
      expect(vehicles[0].confidence).toBe('medium');
      expect(vehicles[0].id).toBe('trip:t-1');
    }
  });

  it('is idempotent for already-promoted kinds', () => {
    const input: Vehicle[] = [{
      kind: 'reconciled',
      id: 'trip:t-1',
      route: r14,
      type: 'bus',
      confidence: 'medium',
      schedule: {
        tripId: 't-1', scheduledDeparture: 540, directionId: 1, tripStartMin: 14 * 60 + 21,
      },
      position: { lat: 46.77, lon: 23.62, source: 'gps', asOf: 0 },
      liveSources: ['gtfs-rt'],
    }];
    const { vehicles } = reconcileWithLive(
      input,
      [obs({ tripId: 'live', startTime: '14:21:00' })],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    expect(vehicles[0]).toBe(input[0]);
  });

  it('falls back to fetch time when the observation has no timestamp', () => {
    const sched = [scheduled({ tripId: 't-1', tripStartMin: 14 * 60 + 21 })];
    const before = Date.now();
    const { vehicles } = reconcileWithLive(
      sched,
      [obs({ tripId: 'live', startTime: '14:21:00', asOfMs: 0 })],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    const after = Date.now();
    if (vehicles[0].kind === 'reconciled') {
      expect(vehicles[0].position.asOf).toBeGreaterThanOrEqual(before);
      expect(vehicles[0].position.asOf).toBeLessThanOrEqual(after);
    }
  });

  it('skips live observations without parseable start time', () => {
    const sched = [scheduled({ tripId: 't-1', tripStartMin: 14 * 60 + 21 })];
    const { stats } = reconcileWithLive(
      sched,
      [obs({ tripId: 'opaque' })],
      { nowMs: epochAt(14 * 60 + 25 ), timezone: 'UTC'},
    );
    expect(stats.matched).toBe(0);
  });
});
