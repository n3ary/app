import { describe, it, expect } from 'vitest';
import { buildOrphanLiveVehicle } from './orphanLive';
import type { LiveVehicleObservation } from '$lib/data/live/gtfsRtClient';
import type { Route } from './types';

const ROUTE: Route = {
  id: 'R1',
  shortName: '24',
  color: '#22aa22',
  type: 'bus',
};

/** Straight-east polyline anchored at (46.77, 23.60). At that
 *  latitude 0.01° lon ≈ 760 m, so the four points span ~2.3 km. */
const SHAPE = [
  { lat: 46.77, lon: 23.60 },
  { lat: 46.77, lon: 23.61 },
  { lat: 46.77, lon: 23.62 },
  { lat: 46.77, lon: 23.63 },
];

function obsAt(lat: number, lon: number, speedMs: number | null = 5): LiveVehicleObservation {
  return {
    source: 'gtfs-rt',
    vehicleId: 'V1',
    tripId: 'T1',
    routeId: 'R1',
    directionId: 0,
    startTime: '08:00:00',
    lat, lon,
    bearing: null,
    speedMs,
    currentStatus: 0,
    nextStopId: null,
    asOfMs: Date.now(),
  };
}

describe('buildOrphanLiveVehicle', () => {
  it('returns null when the polyline has fewer than 2 points', () => {
    const v = buildOrphanLiveVehicle(
      obsAt(46.77, 23.605),
      ROUTE,
      [{ lat: 46.77, lon: 23.60 }],
      { lat: 46.77, lon: 23.62 },
    );
    expect(v).toBeNull();
  });

  it('returns null when the station does not lie on the shape', () => {
    // Station 5 km north of the shape → low confidence → not this trip.
    const v = buildOrphanLiveVehicle(
      obsAt(46.77, 23.605),
      ROUTE,
      SHAPE,
      { lat: 46.82, lon: 23.61 },
    );
    expect(v).toBeNull();
  });

  it('returns null when the bus has already passed the station', () => {
    // Bus at ~2300 m, station at ~760 m.
    const v = buildOrphanLiveVehicle(
      obsAt(46.77, 23.6295, 10),
      ROUTE,
      SHAPE,
      { lat: 46.77, lon: 23.61 },
    );
    expect(v).toBeNull();
  });

  it('builds a live Vehicle when the bus is approaching the station', () => {
    // Bus at ~380 m, station at ~2280 m → ETA positive.
    const v = buildOrphanLiveVehicle(
      obsAt(46.77, 23.605, 10),
      ROUTE,
      SHAPE,
      { lat: 46.77, lon: 23.63 },
    );
    expect(v).not.toBeNull();
    if (v?.kind !== 'live') throw new Error('expected kind=live');
    expect(v.position.lat).toBeCloseTo(46.77, 4);
    expect(v.position.source).toBe('gps');
    expect(v.liveSources).toEqual(['gtfs-rt']);
    expect(v.route.id).toBe('R1');
    expect(v.eta?.minutes).toBeGreaterThan(0);
    expect(v.id).toBe('live:T1');
    // No schedule field — orphans don't carry one.
    expect(v.schedule).toBeUndefined();
  });

  it('falls back to `unknown` vehicle type when route.type is missing', () => {
    const typeless: Route = { id: 'R1', shortName: '24', color: '#22aa22' };
    const v = buildOrphanLiveVehicle(
      obsAt(46.77, 23.605, 10),
      typeless,
      SHAPE,
      { lat: 46.77, lon: 23.63 },
    );
    expect(v?.type).toBe('unknown');
  });
});
