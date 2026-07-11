import { describe, expect, it } from 'vitest';
import {
  atStationLabel,
  bucketOf,
  compareForBoard,
  bucketCounts,
  etaUrgency,
  filterForStationView,
  type ArrivalBucket,
} from './buckets';
import type { Vehicle } from './types';

function inputs(o: Partial<Parameters<typeof bucketOf>[1]> & { nowMin: number }) {
  return {
    etaMinutes: 5,
    distanceToStopMeters: 500,
    ...o,
  };
}

// Minimal Vehicle factories for the comparator test.
const route = { id: '1', shortName: '24', color: '#ff0000' };
function v(id: string, _kind: Vehicle['kind'] = 'scheduled'): Vehicle {
  return {
    kind: 'scheduled',
    id,
    route,
    type: 'bus',
    confidence: 'low',
    schedule: { tripId: `t-${id}`, scheduledDeparture: 540 },
    position: { lat: 0, lon: 0, source: 'predicted-from-schedule', asOf: 0 },
  } as Vehicle;
}

describe('bucketOf', () => {
  const now = 9 * 60; // 09:00

  it('returns incoming when far in the future', () => {
    expect(bucketOf('scheduled', inputs({ nowMin: now, etaMinutes: 10 }))).toBe('incoming');
  });

  it('returns arriving when within 1 min', () => {
    expect(bucketOf('scheduled', inputs({ nowMin: now, etaMinutes: 1 }))).toBe('arriving');
    expect(bucketOf('scheduled', inputs({ nowMin: now, etaMinutes: 0 }))).toBe('arriving');
  });

  it('returns incoming when 2 min away (above the threshold)', () => {
    // Riders consistently saw 'in 2 min' rows inside the arriving
    // section because the old threshold was ≤ 2. Dropped to ≤ 1 so a
    // bus that's two minutes out reads as 'incoming' — not 'arriving'.
    expect(bucketOf('scheduled', inputs({ nowMin: now, etaMinutes: 2 }))).toBe('incoming');
  });

  it('returns departed when in the past (scanner gates trip-end)', () => {
    // Bucketer now trusts the scheduleScanner to drop trips whose terminus
    // has already passed; anything past that reaches the bucketer is still
    // en route and belongs in 'departed', no recency cap.
    expect(bucketOf('scheduled', inputs({ nowMin: now, etaMinutes: -3 }))).toBe('departed');
    expect(bucketOf('scheduled', inputs({ nowMin: now, etaMinutes: -30 }))).toBe('departed');
  });

  it('off-route for live vehicles far from stop and off shape', () => {
    expect(
      bucketOf(
        'gps-only',
        inputs({
          nowMin: now,
          etaMinutes: 5,
          distanceToStopMeters: 500,
          onRouteShape: false,
        }),
      ),
    ).toBe('off-route');
  });

  it('at-station when physically at stop and stopped (live)', () => {
    expect(
      bucketOf(
        'gps-only',
        inputs({
          nowMin: now,
          etaMinutes: 0,
          distanceToStopMeters: 20,
          vehicleSpeedKmh: 0,
          scheduledArrivalMin: now - 2,  // outside arriving window (-1..+1)
          scheduledDepartureMin: now + 3, // outside departing window (-1..+1), dwell gap = 5
        }),
      ),
    ).toBe('at-station');
  });

  it('departing when live vehicle picks up speed at stop', () => {
    expect(
      bucketOf(
        'gps-only',
        inputs({
          nowMin: now,
          etaMinutes: 0,
          distanceToStopMeters: 20,
          vehicleSpeedKmh: 10,
          scheduledArrivalMin: now - 3, // outside arriving window
          scheduledDepartureMin: now + 3, // outside departing window
        }),
      ),
    ).toBe('departing');
  });

  it('departing in last minute of scheduled dwell (scheduled vehicle)', () => {
    expect(
      bucketOf(
        'scheduled',
        inputs({
          nowMin: now,
          etaMinutes: 0,
          distanceToStopMeters: 0,
          scheduledArrivalMin: now - 3,
          scheduledDepartureMin: now, // last-minute window covers now..now+1
        }),
      ),
    ).toBe('departing');
  });

  it('arriving in first minute of scheduled dwell (scheduled vehicle)', () => {
    expect(
      bucketOf(
        'scheduled',
        inputs({
          nowMin: now,
          etaMinutes: 0,
          distanceToStopMeters: 0,
          scheduledArrivalMin: now, // first-minute window covers now-1..now+1 -> picks arriving since (c) checks before (d)
          scheduledDepartureMin: now + 3,
        }),
      ),
    ).toBe('arriving');
  });

  it('arriving on short dwell (gap < 1 min) treated as just passing', () => {
    expect(
      bucketOf(
        'scheduled',
        inputs({
          nowMin: now,
          etaMinutes: 0,
          distanceToStopMeters: 0,
          scheduledArrivalMin: now - 2, // past arriving window
          scheduledDepartureMin: now - 2, // past departing window, dwell gap = 0
        }),
      ),
    ).toBe('arriving');
  });

  it('live vehicle physically at the stop, no timing match → at-station', () => {
    // The bus is right there (GPS within 50 m), schedule says depart later
    // (4 min). User can board it now — bucket should be 'at-station', not
    // 'arriving'. Covers the start-station dwell case.
    expect(
      bucketOf(
        'tracked',
        inputs({
          nowMin: now,
          etaMinutes: 4,
          distanceToStopMeters: 30,
          scheduledArrivalMin: now + 4,
          scheduledDepartureMin: now + 4,
        }),
      ),
    ).toBe('at-station');
  });

  it('live vehicle physically at stop near scheduled departure → departing', () => {
    expect(
      bucketOf(
        'tracked',
        inputs({
          nowMin: now,
          etaMinutes: 0,
          distanceToStopMeters: 30,
          scheduledArrivalMin: now - 1,
          scheduledDepartureMin: now,
        }),
      ),
    ).toBe('departing');
  });
});

describe('compareForBoard', () => {
  it('orders by bucket (departing first, at-station, arriving, incoming, departed) then by eta then by id', () => {
    const items = [
      { vehicle: v('z'), bucket: 'incoming' as ArrivalBucket, etaMinutes: 5 },
      { vehicle: v('a'), bucket: 'at-station' as ArrivalBucket, etaMinutes: 0 },
      { vehicle: v('b'), bucket: 'incoming' as ArrivalBucket, etaMinutes: 3 },
      { vehicle: v('c'), bucket: 'incoming' as ArrivalBucket, etaMinutes: 3 },
      { vehicle: v('d'), bucket: 'departing' as ArrivalBucket, etaMinutes: 0 },
    ];
    items.sort(compareForBoard);
    expect(items.map((i) => i.vehicle.id)).toEqual(['d', 'a', 'b', 'c', 'z']);
  });

  it('sorts departed by most-recent first (smallest |eta|)', () => {
    const items = [
      { vehicle: v('a'), bucket: 'departed' as ArrivalBucket, etaMinutes: -10 },
      { vehicle: v('b'), bucket: 'departed' as ArrivalBucket, etaMinutes: -1 },
      { vehicle: v('c'), bucket: 'departed' as ArrivalBucket, etaMinutes: -5 },
    ];
    items.sort(compareForBoard);
    expect(items.map((i) => i.vehicle.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('etaUrgency', () => {
  it("returns 'stop' for the departing bucket", () => {
    expect(etaUrgency('departing', 0)).toBe('stop');
  });

  it("returns 'go' for at-station and arriving", () => {
    expect(etaUrgency('at-station', 0)).toBe('go');
    expect(etaUrgency('arriving', 1)).toBe('go');
  });
  it("returns 'go' for incoming within the imminent threshold", () => {
    expect(etaUrgency('incoming', 5)).toBe('go');
    expect(etaUrgency('incoming', 3)).toBe('go');
  });

  it("returns 'neutral' for incoming beyond the imminent threshold", () => {
    expect(etaUrgency('incoming', 11)).toBe('neutral');
    expect(etaUrgency('incoming', 20)).toBe('neutral');
  });

  it("returns 'neutral' for departed and off-route", () => {
    expect(etaUrgency('departed', -3)).toBe('neutral');
    expect(etaUrgency('off-route', 99)).toBe('neutral');
  });
});

describe('atStationLabel', () => {
  const atStop = (o: Partial<Parameters<typeof atStationLabel>[1]>) => ({
    etaMinutes: 0,
    distanceToStopMeters: 20,
    nowMin: 9 * 60,
    ...o,
  });

  it('returns undefined for buckets outside the at-station section', () => {
    expect(atStationLabel('incoming', atStop({ etaMinutes: 5 }))).toBeUndefined();
    expect(atStationLabel('drop-off', atStop({ etaMinutes: 1 }))).toBeUndefined();
    expect(atStationLabel('departed', atStop({ etaMinutes: -1 }))).toBeUndefined();
    expect(atStationLabel('off-route', atStop({ etaMinutes: 1 }))).toBeUndefined();
  });

  it('"now" red when a live vehicle at the stop is picking up speed', () => {
    expect(
      atStationLabel('departing', atStop({ vehicleSpeedKmh: 10 })),
    ).toEqual({ text: 'now', urgency: 'stop' });
  });

  it('"departing now" red when at the stop, last minute of scheduled dwell', () => {
    const nowMin = 9 * 60;
    expect(
      atStationLabel('departing', atStop({
        nowMin,
        scheduledArrivalMin: nowMin - 4,
        scheduledDepartureMin: nowMin,
      })),
    ).toEqual({ text: 'departing now', urgency: 'stop' });
  });

  it('"arriving now" green when at the stop, first minute of scheduled dwell', () => {
    const nowMin = 9 * 60;
    expect(
      atStationLabel('arriving', atStop({
        nowMin,
        scheduledArrivalMin: nowMin,
        scheduledDepartureMin: nowMin + 3,
      })),
    ).toEqual({ text: 'arriving now', urgency: 'go' });
  });

  it('"at station" green when at the stop mid-dwell', () => {
    const nowMin = 9 * 60;
    expect(
      atStationLabel('at-station', atStop({
        nowMin,
        scheduledArrivalMin: nowMin - 2,
        scheduledDepartureMin: nowMin + 3,
      })),
    ).toEqual({ text: 'at station', urgency: 'go' });
  });

  it('"at station" green when at the stop with no schedule anchor', () => {
    // Live vehicle, GPS at the stop, no scheduled arrival/departure —
    // dwell gap is unknown, but the vehicle is at the stop, so render
    // the default mid-dwell label.
    expect(
      atStationLabel('at-station', atStop({})),
    ).toEqual({ text: 'at station', urgency: 'go' });
  });

  it('relative ETA when arriving (close but not at the stop)', () => {
    expect(
      atStationLabel('arriving', atStop({ etaMinutes: 2, distanceToStopMeters: 200 })),
    ).toEqual({ text: 'in 2 min', urgency: 'go' });
  });

  it('"now" red for a moving vehicle in the departing bucket', () => {
    // Defensive: if a moving vehicle ever reaches the bucketer
    // without the proximity test firing, fall back to "now" red so
    // the row still reads as "this one's gone".
    expect(
      atStationLabel('departing', atStop({ distanceToStopMeters: 500, etaMinutes: 0 })),
    ).toEqual({ text: 'now', urgency: 'stop' });
  });
});

describe('bucketCounts', () => {
  it('counts buckets', () => {
    const counts = bucketCounts(['incoming', 'incoming', 'arriving', 'departed']);
    expect(counts.incoming).toBe(2);
    expect(counts.arriving).toBe(1);
    expect(counts.departed).toBe(1);
    expect(counts['at-station']).toBe(0);
  });
});

describe('filterForStationView', () => {
  const base = (b: ArrivalBucket, dropOffOnly = false, kind: Vehicle['kind'] = 'scheduled') => ({
    vehicle: { ...v('x', kind), dropOffOnly, kind } as Vehicle,
    bucket: b,
  });
  const allowAll = {
    showDepartedVehicles: true,
    showDropOffOnly: true,
    showOffRouteVehicles: true,
  };

  it('drops off-route by default (showOffRouteVehicles=false)', () => {
    const out = filterForStationView(
      [base('off-route'), base('incoming')],
      { ...allowAll, showOffRouteVehicles: false },
    );
    expect(out.map((e) => e.bucket)).toEqual(['incoming']);
  });

  it('keeps off-route when the advanced toggle is on', () => {
    const out = filterForStationView(
      [base('off-route'), base('incoming')],
      allowAll,
    );
    expect(out.map((e) => e.bucket)).toEqual(['off-route', 'incoming']);
  });

  it('drops departed when showDepartedVehicles is off', () => {
    const out = filterForStationView(
      [base('departed'), base('incoming')],
      { ...allowAll, showDepartedVehicles: false },
    );
    expect(out.map((e) => e.bucket)).toEqual(['incoming']);
  });

  it('keeps departed when showDepartedVehicles is on', () => {
    const out = filterForStationView(
      [base('departed'), base('incoming')],
      allowAll,
    );
    expect(out.map((e) => e.bucket)).toEqual(['departed', 'incoming']);
  });

  it('drops drop-off-only vehicles when showDropOffOnly is off', () => {
    const out = filterForStationView(
      [base('drop-off', true), base('arriving', false)],
      { ...allowAll, showDropOffOnly: false },
    );
    expect(out).toHaveLength(1);
    expect(out[0].vehicle.dropOffOnly).toBeFalsy();
  });

  it('keeps drop-off-only DEPARTED vehicles even when showDropOffOnly is off', () => {
    // dropOffOnly is about future boardability; for past vehicles it's
    // meaningless. The departed bucket honors only its own toggle.
    const out = filterForStationView(
      [base('departed', true)],
      { ...allowAll, showDropOffOnly: false },
    );
    expect(out).toHaveLength(1);
    expect(out[0].bucket).toBe('departed');
  });
});
