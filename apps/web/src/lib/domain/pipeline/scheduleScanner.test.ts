import { describe, expect, it } from 'vitest';
import { scanSchedule, type ScheduleRow } from './scheduleScanner';

const row = (overrides: Partial<ScheduleRow> = {}): ScheduleRow => ({
  trip_id: 't-1',
  arrival_time: '09:05:00',
  departure_time: '09:06:00',
  pickup_type: 0,
  stop_sequence: 3,
  last_seq: 8,
  route_id: '24',
  route_short_name: '24',
  route_color: 'ff0000',
  route_text_color: 'ffffff',
  route_type: 3,
  trip_headsign: 'Mănăștur',
  stop_lat: 46.7712,
  stop_lon: 23.6236,
  ...overrides,
});

describe('scanSchedule', () => {
  const now = 9 * 60; // 09:00
  const nowMs = new Date(2026, 5, 26, 9, 0, 0).getTime();

  it('produces a scheduled vehicle for a future arrival', () => {
    const out = scanSchedule({
      rows: [row({ arrival_time: '09:10:00', departure_time: '09:10:30' })],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('scheduled');
    expect(out[0].eta?.minutes).toBe(10);
    expect(out[0].type).toBe('bus');
    expect(out[0].route.shortName).toBe('24');
    expect(out[0].schedule?.headsign).toBe('Mănăștur');
  });

  it('produces a predicted vehicle when scheduled to be at the stop now', () => {
    const out = scanSchedule({
      rows: [row({ arrival_time: '08:59:00', departure_time: '09:01:00' })],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('predicted');
    expect(out[0].position?.source).toBe('predicted-from-schedule');
    expect(out[0].position?.lat).toBeCloseTo(46.7712, 4);
  });

  it('drops arrivals outside the window', () => {
    const out = scanSchedule({
      rows: [
        row({ arrival_time: '06:00:00', departure_time: '06:00:30' }),
        row({ arrival_time: '12:00:00', departure_time: '12:00:30' }),
      ],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
    });
    expect(out).toHaveLength(0);
  });

  it('keeps recently departed arrivals (5 min past window)', () => {
    const out = scanSchedule({
      rows: [row({ arrival_time: '08:57:00', departure_time: '08:57:30' })],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
    });
    expect(out).toHaveLength(1);
    expect(out[0].eta?.minutes).toBe(-3);
  });

  it('flags drop-off-only (pickup_type=1)', () => {
    const out = scanSchedule({
      rows: [row({ arrival_time: '09:05:00', pickup_type: 1 })],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
    });
    expect(out[0].dropOffOnly).toBe(true);
  });

  it('flags terminus arrival as drop-off-only even when pickup_type is null', () => {
    // Real-world case from Cluj: trip ends at this stop. pickup_type left
    // null by the operator, but stop_sequence === last_seq signals it's a
    // terminus arrival, so the scanner treats it as drop-off-only.
    const out = scanSchedule({
      rows: [row({
        arrival_time: '09:05:00',
        pickup_type: null,
        stop_sequence: 8,
        last_seq: 8,
      })],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
    });
    expect(out[0].dropOffOnly).toBe(true);
  });

  it('does NOT flag a mid-trip stop with null pickup_type', () => {
    const out = scanSchedule({
      rows: [row({
        arrival_time: '09:05:00',
        pickup_type: null,
        stop_sequence: 3,
        last_seq: 8,
      })],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
    });
    expect(out[0].dropOffOnly).toBeUndefined();
  });

  it('attaches checkedSources to predicted vehicles only', () => {
    const out = scanSchedule({
      rows: [
        row({ arrival_time: '09:10:00' }),       // scheduled, future
        row({ arrival_time: '08:59:30', trip_id: 't-2' }), // predicted, at stop
      ],
      nowMinSinceMidnight: now,
      nowMs,
      windowMinutes: 60,
      checkedSources: ['gtfs-rt'],
    });
    const predicted = out.find((v) => v.kind === 'predicted');
    const scheduled = out.find((v) => v.kind === 'scheduled');
    expect(predicted?.kind === 'predicted' && predicted.checkedSources).toEqual(['gtfs-rt']);
    expect((scheduled as { checkedSources?: unknown }).checkedSources).toBeUndefined();
  });
});
